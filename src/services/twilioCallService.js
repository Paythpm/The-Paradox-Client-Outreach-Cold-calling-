import { Device } from '@twilio/voice-sdk';
import supabase from '../lib/supabase';

// Module-level state
let device = null;
let activeCall = null;
let isDeviceReady = false;
let callStartTime = null;
let currentBusinessId = null;
let currentCallLogId = null;
let currentScriptId = null; // tracks which script was used for feedback loop

export function getDeviceState() {
  return { isDeviceReady, currentCallLogId, currentBusinessId };
}

export async function initializeDevice(callerIdentity) {
  if (device && isDeviceReady) return device;

  // Get access token from edge function
  const { data, error } = await supabase.functions.invoke('twilio-access-token', {
    body: { caller_identity: callerIdentity }
  });

  if (error || !data?.token) {
    throw new Error('Failed to get Twilio access token: ' + (error?.message || 'no token returned'));
  }

  device = new Device(data.token, {
    codecPreferences: ['opus', 'pcmu'],
    fakeLocalDTMF: true,
    enableRingingState: true,
    edge: 'roaming',
  });

  await device.register();

  device.on('registered', () => { isDeviceReady = true; });
  device.on('unregistered', () => { isDeviceReady = false; });
  device.on('error', (error) => { console.error('Twilio Device error:', error); });
  device.on('tokenWillExpire', () => { refreshToken(callerIdentity); });

  isDeviceReady = true;
  return device;
}

export async function makeCall(business, callerId, onStatusChange) {
  if (!isDeviceReady || !device) {
    throw new Error('Twilio device not ready. Please wait and try again.');
  }
  if (!business.phone) {
    throw new Error('This business has no phone number.');
  }

  // Get current active script for logging
  let scriptSnapshot = null;
  let scriptId = null;
  try {
    const { data: scriptData } = await supabase
      .from('ai_scripts')
      .select('id, opening_line, talking_points, objection_handlers, suggested_close')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .eq('variant', 'primary')
      .single();
    scriptSnapshot = scriptData ? { opening_line: scriptData.opening_line, talking_points: scriptData.talking_points, objection_handlers: scriptData.objection_handlers, suggested_close: scriptData.suggested_close } : null;
    scriptId = scriptData?.id || null;
  } catch { /* script is optional */ }

  currentScriptId = scriptId;

  // Insert call log
  const { data: callLog, error: logError } = await supabase
    .from('call_logs')
    .insert({
      business_id: business.id,
      caller_id: callerId,
      started_at: new Date().toISOString(),
      ai_script_used: scriptSnapshot,
      call_direction: 'outbound',
    })
    .select('id')
    .single();

  if (logError) {
    throw new Error('Failed to create call log: ' + logError.message);
  }

  currentCallLogId = callLog.id;
  currentBusinessId = business.id;

  // Update business status
  await supabase
    .from('businesses')
    .update({ call_status: 'calling' })
    .eq('id', business.id);

  // Make the call
  const call = await device.connect({
    params: {
      To: business.phone,
      BusinessId: business.id,
      CallLogId: currentCallLogId,
    }
  });

  callStartTime = new Date();
  activeCall = call;

  // Wire up call events
  call.on('accept', () => {
    // Store the Twilio call SID now that we have it
    if (currentCallLogId && call.parameters?.CallSid) {
      supabase.from('call_logs')
        .update({ twilio_call_sid: call.parameters.CallSid })
        .eq('id', currentCallLogId)
        .then(() => {});
    }
    onStatusChange('connected', {});
  });
  call.on('disconnect', () => {
    const duration = callStartTime ? Math.floor((Date.now() - callStartTime.getTime()) / 1000) : 0;
    onStatusChange('ended', { duration, callLogId: currentCallLogId });
    activeCall = null;
    callStartTime = null;
  });
  call.on('reject', () => onStatusChange('rejected', {}));
  call.on('error', (err) => onStatusChange('error', { message: err.message }));
  call.on('ringing', () => onStatusChange('ringing', {}));
  call.on('reconnecting', () => onStatusChange('reconnecting', {}));
  call.on('reconnected', () => onStatusChange('connected', {}));

  return call;
}

export function endCall() {
  if (activeCall) {
    activeCall.disconnect();
    activeCall = null;
  }
}

export function muteCall(isMuted) {
  if (activeCall) activeCall.mute(isMuted);
}

export function destroyDevice() {
  // Call this on user logout to release browser microphone and Twilio connection
  try {
    if (activeCall) { activeCall.disconnect(); activeCall = null; }
    if (device) { device.destroy(); device = null; }
  } catch { /* ignore */ }
  isDeviceReady = false;
  callStartTime = null;
  currentBusinessId = null;
  currentCallLogId = null;
  currentScriptId = null;
}

export async function saveCallOutcome(callLogId, outcome, notes, callerId) {
  // Map outcome to business status
  const statusMap = {
    'answered_interested': 'interested',
    'answered_not_interested': 'not_interested',
    'answered_callback': 'callback_requested',
    'no_answer': 'no_answer',
    'voicemail_left': 'no_answer',
    'wrong_number': 'wrong_number',
    'busy': 'no_answer',
  };

  // Update call log
  const { data: updatedLog, error } = await supabase
    .from('call_logs')
    .update({
      outcome,
      notes,
      ended_at: new Date().toISOString(),
      caller_id: callerId,
    })
    .eq('id', callLogId)
    .select('business_id')
    .single();

  if (error) throw new Error('Failed to save outcome: ' + error.message);

  if (updatedLog?.business_id) {
    const newStatus = statusMap[outcome] || 'not_called';
    await supabase
      .from('businesses')
      .update({ call_status: newStatus, last_called_at: new Date().toISOString() })
      .eq('id', updatedLog.business_id);

    // Feedback loop: mark script as used and optionally converted
    if (currentScriptId) {
      const positiveOutcomes = ['answered_interested', 'meeting_booked'];
      await supabase.rpc('increment_script_usage', {
        p_script_id: currentScriptId,
        p_converted: positiveOutcomes.includes(outcome),
      });
    }
  }

  return updatedLog;
}

async function refreshToken(callerIdentity) {
  try {
    const { data } = await supabase.functions.invoke('twilio-access-token', {
      body: { caller_identity: callerIdentity }
    });
    if (data?.token && device) {
      device.updateToken(data.token);
    }
  } catch (err) {
    console.error('Token refresh failed:', err);
  }
}

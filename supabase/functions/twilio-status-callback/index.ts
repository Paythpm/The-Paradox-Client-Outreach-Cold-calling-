import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validate Twilio's X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + sorted(key+value))).
async function isValidTwilioSignature(
  authToken: string, signature: string, urls: string[], params: Record<string, string>,
): Promise<boolean> {
  if (!signature) return false;
  const sortedKeys = Object.keys(params).sort();
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  for (const url of urls) {
    let data = url;
    for (const k of sortedKeys) data += k + params[k];
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    if (btoa(String.fromCharCode(...new Uint8Array(sig))) === signature) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.text();
    const params = new URLSearchParams(body);

    // ── Verify the request genuinely came from Twilio ──────────────────────
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    if (authToken && Deno.env.get('TWILIO_SKIP_VALIDATION') !== 'true') {
      const signature = req.headers.get('X-Twilio-Signature') || '';
      const paramObj: Record<string, string> = {};
      for (const [k, v] of params.entries()) paramObj[k] = v;
      const candidateUrls = [req.url, `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-status-callback`];
      if (!(await isValidTwilioSignature(authToken, signature, candidateUrls, paramObj))) {
        return new Response('', { status: 403, headers: corsHeaders });
      }
    }

    const callSid = params.get('CallSid') || '';
    const callStatus = params.get('CallStatus') || '';
    const callDuration = parseInt(params.get('CallDuration') || '0', 10);
    const recordingUrl = params.get('RecordingUrl') || null;
    const to = params.get('To') || '';

    switch (callStatus) {
      case 'initiated':
      case 'ringing': {
        // Frontend (makeCall) already creates the call_log with business_id and caller_id.
        // We just update the twilio_call_sid if the log exists but lacks it.
        // We do NOT create a new log here — that would duplicate.
        const { data: existingBySid } = await supabase
          .from('call_logs')
          .select('id')
          .eq('twilio_call_sid', callSid)
          .maybeSingle();

        if (!existingBySid) {
          // Try to find the most recent log for this business without a SID
          const { data: biz } = await supabase
            .from('businesses')
            .select('id')
            .eq('phone', to)
            .maybeSingle();

          if (biz) {
            // Update the most recent unsid'd call log for this business
            const { data: recentLog } = await supabase
              .from('call_logs')
              .select('id')
              .eq('business_id', biz.id)
              .is('twilio_call_sid', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (recentLog) {
              await supabase
                .from('call_logs')
                .update({ twilio_call_sid: callSid })
                .eq('id', recentLog.id);
            }
            // Always update business call_status to 'calling'
            await supabase
              .from('businesses')
              .update({ call_status: 'calling' })
              .eq('id', biz.id);
          }
        }
        break;
      }

      case 'answered': {
        await supabase
          .from('call_logs')
          .update({ answered_at: new Date().toISOString() })
          .eq('twilio_call_sid', callSid);
        break;
      }

      case 'completed': {
        const { data: callLog } = await supabase
          .from('call_logs')
          .update({
            ended_at: new Date().toISOString(),
            duration_seconds: callDuration,
            twilio_recording_url: recordingUrl,
          })
          .eq('twilio_call_sid', callSid)
          .select('business_id, caller_id')
          .single();

        if (callLog?.business_id) {
          const { data: bizData } = await supabase
            .from('businesses')
            .select('call_count')
            .eq('id', callLog.business_id)
            .single();

          await supabase
            .from('businesses')
            .update({
              // Don't set call_status here — saveCallOutcome() handles that after caller picks outcome
              last_called_at: new Date().toISOString(),
              call_count: (bizData?.call_count || 0) + 1, // single authoritative increment
            })
            .eq('id', callLog.business_id);
        }
        break;
      }

      case 'no-answer': {
        const { data: callLog } = await supabase
          .from('call_logs')
          .update({ outcome: 'no_answer', ended_at: new Date().toISOString() })
          .eq('twilio_call_sid', callSid)
          .select('business_id')
          .single();

        if (callLog?.business_id) {
          await supabase
            .from('businesses')
            .update({ call_status: 'no_answer' })
            .eq('id', callLog.business_id);
        }
        break;
      }

      case 'busy': {
        await supabase
          .from('call_logs')
          .update({ outcome: 'busy', ended_at: new Date().toISOString() })
          .eq('twilio_call_sid', callSid);
        break;
      }

      case 'failed': {
        const { data: callLog } = await supabase
          .from('call_logs')
          .update({ outcome: 'no_answer', ended_at: new Date().toISOString(), notes: 'Call failed' })
          .eq('twilio_call_sid', callSid)
          .select('business_id')
          .single();
        break;
      }
    }

    // Twilio expects 200 OK
    return new Response('', { status: 200, headers: corsHeaders });

  } catch (err) {
    console.error('Status callback error:', err.message);
    return new Response('', { status: 200, headers: corsHeaders }); // Always 200 to Twilio
  }
});

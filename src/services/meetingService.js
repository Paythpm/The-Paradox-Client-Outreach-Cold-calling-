import supabase from '../lib/supabase';

export async function scheduleMeeting({ businessId, callLogId, bookedBy, scheduledAt, timezone, durationMinutes = 15, topic, meetingLink, channel = 'sms' }) {
  const { data, error } = await supabase
    .from('meetings')
    .insert({
      business_id: businessId,
      call_log_id: callLogId || null,
      booked_by: bookedBy,
      scheduled_at: scheduledAt,
      timezone,
      duration_minutes: durationMinutes,
      topic,
      meeting_link: meetingLink || null,
      channel,
      status: 'pending_confirmation',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Mark the business as meeting_booked — a booked meeting is the highest-value
  // outcome and must be reflected on the lead so it leaves the calling queue.
  if (businessId) {
    await supabase
      .from('businesses')
      .update({ call_status: 'meeting_booked', last_called_at: new Date().toISOString() })
      .eq('id', businessId);
  }

  return data;
}

export async function sendConfirmation(meetingId, business, caller, messageBody, channel) {
  const { data, error } = await supabase.functions.invoke('send-meeting-confirmation', {
    body: {
      meeting_id: meetingId,
      channel,
      message_body: messageBody,
      to_number: channel === 'whatsapp' ? business.whatsapp : business.phone,
      caller_name: caller.full_name,
    }
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getMeetingsForBusiness(businessId) {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('business_id', businessId)
    .order('scheduled_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateMeetingStatus(meetingId, status, notes) {
  const { data, error } = await supabase
    .from('meetings')
    .update({ status, notes: notes || undefined })
    .eq('id', meetingId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

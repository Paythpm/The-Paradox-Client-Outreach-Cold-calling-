import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function normalizeReply(text: string): string {
  return (text || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.text();
    const params = new URLSearchParams(body);

    const messageSid = params.get('MessageSid') || '';
    const messageStatus = params.get('MessageStatus') || '';
    const from = params.get('From') || '';
    const replyBody = params.get('Body') || '';

    // Status update for outbound message
    if (messageStatus === 'delivered') {
      // Could log delivery
    } else if (messageStatus === 'failed' || messageStatus === 'undelivered') {
      console.error(`Message ${messageSid} failed: ${messageStatus}`);
    }

    // Handle inbound reply (Body present, no MessageStatus for inbound)
    if (replyBody && !messageStatus) {
      const normalized = normalizeReply(replyBody);
      const fromClean = from.replace('whatsapp:', '');

      // Find the meeting by matching phone number
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, business_name')
        .or(`phone.eq.${fromClean},whatsapp.eq.${fromClean}`)
        .maybeSingle();

      if (biz) {
        const { data: meeting } = await supabase
          .from('meetings')
          .select('*')
          .eq('business_id', biz.id)
          .eq('status', 'pending_confirmation')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (meeting) {
          const isConfirm = normalized.includes('yes') || normalized.includes('confirm') || normalized.includes('✓') || normalized.includes('ok');
          const isDecline = normalized.includes('no') || normalized.includes('cancel') || normalized.includes('reschedule');

          if (isConfirm) {
            await supabase.from('meetings').update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_via: 'reply_yes' }).eq('id', meeting.id);
            await supabase.from('businesses').update({ call_status: 'meeting_booked' }).eq('id', biz.id);
          } else if (isDecline) {
            await supabase.from('meetings').update({ status: 'rescheduled' }).eq('id', meeting.id);
          } else {
            const currentNotes = meeting.notes || '';
            await supabase.from('meetings').update({ notes: `${currentNotes}\nReply: ${replyBody}` }).eq('id', meeting.id);
          }
        }
      }
    }

    // Always return empty TwiML
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml', ...corsHeaders }
    });

  } catch (err) {
    console.error('Message webhook error:', err.message);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml', ...corsHeaders }
    });
  }
});

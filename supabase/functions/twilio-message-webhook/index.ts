import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function normalizeReply(text: string): string {
  return (text || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
}

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.text();
    const params = new URLSearchParams(body);

    // ── Verify the request genuinely came from Twilio ──────────────────────
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    if (authToken && Deno.env.get('TWILIO_SKIP_VALIDATION') !== 'true') {
      const signature = req.headers.get('X-Twilio-Signature') || '';
      const paramObj: Record<string, string> = {};
      for (const [k, v] of params.entries()) paramObj[k] = v;
      const candidateUrls = [req.url, `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-message-webhook`];
      if (!(await isValidTwilioSignature(authToken, signature, candidateUrls, paramObj))) {
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          status: 403, headers: { 'Content-Type': 'text/xml', ...corsHeaders },
        });
      }
    }

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
      // Strip to E.164 phone chars before using in a PostgREST filter (injection-safe).
      const fromClean = from.replace('whatsapp:', '').replace(/[^0-9+]/g, '');

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

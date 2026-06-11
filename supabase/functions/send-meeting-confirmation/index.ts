import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getTwilioNumber(countryCode: string): string {
  if (countryCode === 'AU') return Deno.env.get('TWILIO_NUMBER_AU') || '';
  if (countryCode === 'CA') return Deno.env.get('TWILIO_NUMBER_CA') || '';
  if (countryCode === 'UK') return Deno.env.get('TWILIO_NUMBER_UK') || '';
  if (countryCode === 'US') return Deno.env.get('TWILIO_NUMBER_US') || '';
  return Deno.env.get('TWILIO_NUMBER_AU') || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { meeting_id, channel, message_body, to_number, caller_name } = await req.json();

    // Verify meeting exists
    const { data: meeting } = await supabase
      .from('meetings')
      .select('*, businesses(country_code)')
      .eq('id', meeting_id)
      .single();

    if (!meeting) {
      return new Response(JSON.stringify({ error: 'Meeting not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const countryCode = meeting.businesses?.country_code || 'AU';
    const fromNumber = getTwilioNumber(countryCode);
    const statusCallback = `${supabaseUrl}/functions/v1/twilio-message-webhook`;

    const credentials = btoa(`${accountSid}:${authToken}`);
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    let body: URLSearchParams;
    if (channel === 'whatsapp') {
      body = new URLSearchParams({
        Body: message_body,
        To: `whatsapp:${to_number}`,
        From: `whatsapp:${Deno.env.get('TWILIO_WHATSAPP_NUMBER') || fromNumber}`,
        StatusCallback: statusCallback,
      });
    } else {
      body = new URLSearchParams({
        Body: message_body,
        To: to_number,
        From: fromNumber,
        StatusCallback: statusCallback,
      });
    }

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!twilioRes.ok) {
      const errText = await twilioRes.text();
      throw new Error(`Twilio error ${twilioRes.status}: ${errText}`);
    }

    const twilioData = await twilioRes.json();

    // Update meeting record
    await supabase
      .from('meetings')
      .update({
        confirmation_sent_at: new Date().toISOString(),
        confirmation_message_sid: twilioData.sid,
        channel,
      })
      .eq('id', meeting_id);

    return new Response(JSON.stringify({ success: true, message_sid: twilioData.sid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

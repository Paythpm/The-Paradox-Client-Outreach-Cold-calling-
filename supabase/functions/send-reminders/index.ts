import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function formatTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString('en-AU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  } catch { return iso; }
}

async function sendSMS(to: string, body: string, fromNumber: string, accountSid: string, authToken: string, supabaseUrl: string): Promise<{ ok: boolean; error?: string }> {
  // No configured sender for this country → don't silently drop it.
  if (!fromNumber) return { ok: false, error: 'no From number configured for this country' };
  const credentials = btoa(`${accountSid}:${authToken}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ Body: body, To: to, From: fromNumber, StatusCallback: `${supabaseUrl}/functions/v1/twilio-message-webhook` }).toString(),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    return { ok: false, error: `Twilio ${res.status}: ${txt.slice(0, 120)}` };
  }
  return { ok: true };
}

function getFromNumber(countryCode: string): string {
  if (countryCode === 'AU') return Deno.env.get('TWILIO_NUMBER_AU') || '';
  if (countryCode === 'CA') return Deno.env.get('TWILIO_NUMBER_CA') || '';
  if (countryCode === 'UK') return Deno.env.get('TWILIO_NUMBER_UK') || '';
  if (countryCode === 'US') return Deno.env.get('TWILIO_NUMBER_US') || '';
  return Deno.env.get('TWILIO_NUMBER_AU') || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  let sent24h = 0, sent1h = 0, noshows = 0;
  const skipped: string[] = [];

  try {
    const now = new Date();

    // 24h reminders
    const t23 = new Date(now.getTime() + 23 * 3600000).toISOString();
    const t25 = new Date(now.getTime() + 25 * 3600000).toISOString();
    const { data: upcoming24 } = await supabase.from('meetings').select('*, businesses(phone, business_name, country_code)').eq('status', 'confirmed').is('reminder_24h_sent_at', null).gte('scheduled_at', t23).lte('scheduled_at', t25);

    for (const m of upcoming24 || []) {
      const phone = m.businesses?.phone;
      if (!phone) continue;
      const isDNC = await checkDNC(supabase, phone);
      if (isDNC) continue;
      const msg = `Hi ${m.businesses.business_name}! Just a reminder — your call with us is tomorrow, ${formatTime(m.scheduled_at, m.timezone)}.${m.meeting_link ? ' Join here: ' + m.meeting_link : ''} Looking forward to it! Reply CANCEL if you need to reschedule.`;
      const r = await sendSMS(phone, msg, getFromNumber(m.businesses.country_code), accountSid, authToken, supabaseUrl);
      if (!r.ok) { skipped.push(`24h ${m.businesses.country_code}: ${r.error}`); continue; } // don't mark sent → retries later
      await supabase.from('meetings').update({ reminder_24h_sent_at: new Date().toISOString() }).eq('id', m.id);
      sent24h++;
    }

    // 1h reminders
    const t55 = new Date(now.getTime() + 55 * 60000).toISOString();
    const t65 = new Date(now.getTime() + 65 * 60000).toISOString();
    const { data: upcoming1h } = await supabase.from('meetings').select('*, businesses(phone, business_name, country_code)').eq('status', 'confirmed').is('reminder_1h_sent_at', null).gte('scheduled_at', t55).lte('scheduled_at', t65);

    for (const m of upcoming1h || []) {
      const phone = m.businesses?.phone;
      if (!phone) continue;
      const isDNC = await checkDNC(supabase, phone);
      if (isDNC) continue;
      const msg = `Hi ${m.businesses.business_name}! Your call is in about 1 hour — ${formatTime(m.scheduled_at, m.timezone)}.${m.meeting_link ? ' Link: ' + m.meeting_link : ''} See you soon! 🙌`;
      const r = await sendSMS(phone, msg, getFromNumber(m.businesses.country_code), accountSid, authToken, supabaseUrl);
      if (!r.ok) { skipped.push(`1h ${m.businesses.country_code}: ${r.error}`); continue; }
      await supabase.from('meetings').update({ reminder_1h_sent_at: new Date().toISOString() }).eq('id', m.id);
      sent1h++;
    }

    // No-shows (confirmed meetings 30+ mins past with no reschedule offer)
    const t30ago = new Date(now.getTime() - 30 * 60000).toISOString();
    const { data: noShows } = await supabase.from('meetings').select('*, businesses(phone, business_name, country_code, id)').eq('status', 'confirmed').lt('scheduled_at', t30ago).is('reschedule_offer_sent_at', null);

    for (const m of noShows || []) {
      const phone = m.businesses?.phone;
      if (!phone) continue;
      const isDNC = await checkDNC(supabase, phone);
      if (isDNC) continue;
      const msg = `Hi ${m.businesses.business_name}! Looks like we missed each other earlier. No worries — would you like to reschedule? Just reply RESCHEDULE and I'll find a new time that works for you.`;
      const r = await sendSMS(phone, msg, getFromNumber(m.businesses.country_code), accountSid, authToken, supabaseUrl);
      if (!r.ok) { skipped.push(`noshow ${m.businesses.country_code}: ${r.error}`); continue; }
      await supabase.from('meetings').update({ status: 'no_show', reschedule_offer_sent_at: new Date().toISOString() }).eq('id', m.id);
      if (m.businesses?.id) await supabase.from('businesses').update({ call_status: 'callback_requested' }).eq('id', m.businesses.id);
      noshows++;
    }

    return new Response(JSON.stringify({ success: true, sent_24h: sent24h, sent_1h: sent1h, noshows_handled: noshows, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, sent_24h: sent24h, sent_1h: sent1h, noshows_handled: noshows }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function checkDNC(supabase: any, phone: string): Promise<boolean> {
  const { data } = await supabase.from('do_not_call_list').select('id').eq('phone', phone).maybeSingle();
  return !!data;
}

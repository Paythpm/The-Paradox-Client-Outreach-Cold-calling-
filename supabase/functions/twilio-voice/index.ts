const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getCallerIdForNumber(toNumber: string): string {
  // Get each country number — falls back to US number if not yet configured
  const usNumber  = Deno.env.get('TWILIO_NUMBER_US') || '';
  const auNumber  = Deno.env.get('TWILIO_NUMBER_AU') || usNumber;
  const ukNumber  = Deno.env.get('TWILIO_NUMBER_UK') || usNumber; // fallback until UK bundle approved
  const caNumber  = Deno.env.get('TWILIO_NUMBER_CA') || usNumber;

  if (toNumber.startsWith('+61')) return auNumber;
  if (toNumber.startsWith('+44')) return ukNumber;
  if (toNumber.startsWith('+1')) {
    const area = toNumber.slice(2, 5);
    const caAreaCodes = new Set(['204','226','236','249','250','289','306','343','365','403','416','418','431','437','438','450','506','514','519','548','579','581','587','604','613','639','647','672','705','709','742','778','780','782','807','819','825','867','873','902','905']);
    if (caAreaCodes.has(area)) return caNumber;
    return usNumber;
  }
  return auNumber;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const rawTo = params.get('To') || '';
    const callSid = params.get('CallSid') || '';

    // SECURITY: the To value is interpolated into TwiML XML below. Strip everything
    // that isn't a valid E.164 phone character so a crafted value can't inject or
    // restructure the <Dial>/<Number> markup (e.g. dialing premium-rate numbers).
    const to = rawTo.replace(/[^0-9+]/g, '');
    if (!/^\+?[1-9]\d{6,15}$/.test(to)) {
      const badTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Invalid destination number.</Say></Response>`;
      return new Response(badTwiml, { headers: { 'Content-Type': 'text/xml', ...corsHeaders } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const callerId = getCallerIdForNumber(to);
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-status-callback`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" timeout="30" record="record-from-answer-dual-channel">
    <Number
      statusCallbackEvent="initiated ringing answered completed"
      statusCallback="${statusCallbackUrl}"
      statusCallbackMethod="POST">
      ${to}
    </Number>
  </Dial>
</Response>`;

    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml', ...corsHeaders }
    });

  } catch (err) {
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Please try again.</Say></Response>`;
    return new Response(errorTwiml, {
      headers: { 'Content-Type': 'text/xml', ...corsHeaders }
    });
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getCallerIdForNumber(toNumber: string): string {
  if (toNumber.startsWith('+61')) return Deno.env.get('TWILIO_NUMBER_AU') || '';
  if (toNumber.startsWith('+44')) return Deno.env.get('TWILIO_NUMBER_UK') || '';
  if (toNumber.startsWith('+1')) {
    // +1 covers both US and CA — pick based on area code or fall back to US
    // Canadian area codes: 204,226,236,249,250,289,306,343,365,403,416,418,431,437,438,450,506,514,519,548,579,581,587,604,613,639,647,672,705,709,742,778,780,782,807,819,825,867,873,902,905
    const area = toNumber.slice(2, 5);
    const caAreaCodes = new Set(['204','226','236','249','250','289','306','343','365','403','416','418','431','437','438','450','506','514','519','548','579','581','587','604','613','639','647','672','705','709','742','778','780','782','807','819','825','867','873','902','905']);
    if (caAreaCodes.has(area)) return Deno.env.get('TWILIO_NUMBER_CA') || '';
    return Deno.env.get('TWILIO_NUMBER_US') || '';
  }
  return Deno.env.get('TWILIO_NUMBER_AU') || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const to = params.get('To') || '';
    const callSid = params.get('CallSid') || '';

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

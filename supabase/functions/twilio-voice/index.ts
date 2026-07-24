const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Validate Twilio's X-Twilio-Signature so only genuine Twilio requests are
 * accepted. Algorithm: base64( HMAC-SHA1( authToken, url + sorted(key+value) ) ).
 * Tries both the raw request URL and the canonical SUPABASE_URL path to survive
 * any proxy host rewriting. Set TWILIO_SKIP_VALIDATION=true to disable in an
 * emergency without a redeploy.
 */
async function isValidTwilioSignature(
  authToken: string,
  signature: string,
  urls: string[],
  params: Record<string, string>,
): Promise<boolean> {
  if (!signature) return false;
  const sortedKeys = Object.keys(params).sort();
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  for (const url of urls) {
    let data = url;
    for (const k of sortedKeys) data += k + params[k];
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
    if (b64 === signature) return true;
  }
  return false;
}

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

    // ── Verify the request genuinely came from Twilio ──────────────────────
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const skipValidation = Deno.env.get('TWILIO_SKIP_VALIDATION') === 'true';
    if (authToken && !skipValidation) {
      const signature = req.headers.get('X-Twilio-Signature') || '';
      const paramObj: Record<string, string> = {};
      for (const [k, v] of params.entries()) paramObj[k] = v;
      const candidateUrls = [req.url, `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-voice`];
      const valid = await isValidTwilioSignature(authToken, signature, candidateUrls, paramObj);
      if (!valid) {
        const rejectTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>`;
        return new Response(rejectTwiml, { status: 403, headers: { 'Content-Type': 'text/xml', ...corsHeaders } });
      }
    }

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

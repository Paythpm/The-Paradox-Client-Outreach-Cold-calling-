import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { caller_identity } = await req.json();

    if (!caller_identity) {
      return new Response(JSON.stringify({ error: 'caller_identity is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const apiKeySid = Deno.env.get('TWILIO_API_KEY_SID')!;
    const apiKeySecret = Deno.env.get('TWILIO_API_KEY_SECRET')!;
    const twimlAppSid = Deno.env.get('TWILIO_TWIML_APP_SID')!;

    // Build the Twilio Access Token JWT manually (Deno-compatible)
    const now = Math.floor(Date.now() / 1000);
    const ttl = 3600;

    const header = { alg: 'HS256', typ: 'JWT', cty: 'twilio-fpa;v=1' };
    const grants = {
      identity: caller_identity,
      voice: {
        outgoing: { application_sid: twimlAppSid },
        incoming: { allow: false },
      },
    };

    const payload = {
      jti: `${apiKeySid}-${now}`,
      iss: apiKeySid,
      sub: accountSid,
      nbf: now,
      exp: now + ttl,
      grants,
    };

    // Base64url encode — handles multi-byte chars correctly via TextEncoder
    function base64url(str: string): string {
      const bytes = new TextEncoder().encode(str);
      let binary = '';
      bytes.forEach(b => binary += String.fromCharCode(b));
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    // HMAC-SHA256 signature
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(apiKeySecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(signingInput)
    );

    const sigB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
    const token = `${signingInput}.${sigB64}`;

    return new Response(JSON.stringify({ token, identity: caller_identity, expires_in: ttl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

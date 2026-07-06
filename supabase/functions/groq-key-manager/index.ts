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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // SECURITY: this function returns raw Groq API keys (get_active_key) and mutates
    // the key pool. It must ONLY be callable server-to-server (by the generate-script
    // function, which sends the service role key as its bearer). A browser call carries
    // the user's JWT — not the service role key — so it is rejected here. This prevents
    // any authenticated employee from extracting plaintext API keys via the endpoint.
    const authHeader = req.headers.get('Authorization') || '';
    if (authHeader !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceKey
    );

    const { action, key_id, tokens_used, error_message } = await req.json();

    if (action === 'get_active_key') {
      // Reset keys whose cooling period has passed
      await supabase
        .from('groq_keys')
        .update({ is_cooling: false, cooling_until: null })
        .lt('cooling_until', new Date().toISOString())
        .eq('is_cooling', true);

      // Reset daily usage for keys older than 24h
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('groq_keys')
        .update({ calls_today: 0, tokens_today: 0, last_reset_at: new Date().toISOString() })
        .lt('last_reset_at', yesterday);

      // Get least recently used active key
      const { data, error } = await supabase
        .from('groq_keys')
        .select('*')
        .eq('is_active', true)
        .eq('is_cooling', false)
        .order('last_used_at', { ascending: true, nullsFirst: true })
        .limit(1)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'no_keys_available' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check daily limit
      if (data.calls_today >= data.daily_call_limit) {
        return new Response(JSON.stringify({ error: 'no_keys_available', reason: 'daily_limit_reached' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ key: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'mark_used') {
      // Use the atomic RPC function — no race conditions, no dead code
      await supabase.rpc('increment_groq_usage', { p_key_id: key_id, p_tokens: tokens_used || 0 });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'mark_cooling') {
      const coolingUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      await supabase
        .from('groq_keys')
        .update({
          is_cooling: true,
          cooling_until: coolingUntil,
          last_error: error_message || 'Rate limited',
          last_error_at: new Date().toISOString(),
        })
        .eq('id', key_id);

      // Increment consecutive_errors
      await supabase.rpc('increment_groq_errors', { p_key_id: key_id, p_threshold: 5 });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'mark_error') {
      await supabase
        .from('groq_keys')
        .update({
          last_error: error_message || 'Unknown error',
          last_error_at: new Date().toISOString(),
        })
        .eq('id', key_id);

      await supabase.rpc('increment_groq_errors', { p_key_id: key_id, p_threshold: 10 });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get_pool_status') {
      const { data: keys } = await supabase.from('groq_keys').select('*');

      if (!keys) {
        return new Response(JSON.stringify({ total: 0, active: 0, cooling: 0, depleted: 0, calls_today: 0, tokens_today: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const status = {
        total: keys.length,
        active: keys.filter(k => k.is_active && !k.is_cooling).length,
        cooling: keys.filter(k => k.is_cooling).length,
        depleted: keys.filter(k => k.calls_today >= k.daily_call_limit).length,
        inactive: keys.filter(k => !k.is_active).length,
        calls_today: keys.reduce((sum, k) => sum + (k.calls_today || 0), 0),
        tokens_today: keys.reduce((sum, k) => sum + (k.tokens_today || 0), 0),
        keys: keys.map(k => ({
          id: k.id,
          label: k.display_label,
          calls_today: k.calls_today,
          is_active: k.is_active,
          is_cooling: k.is_cooling,
          last_used_at: k.last_used_at,
        })),
      };

      return new Response(JSON.stringify(status), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

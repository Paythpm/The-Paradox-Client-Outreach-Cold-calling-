import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an expert cold calling coach who helps sales reps open conversations with local businesses. Your job is to generate a highly personalized, natural-sounding call script based on real review data from Google Maps. The script must feel human, never robotic or salesy. Output ONLY valid JSON with no markdown, no backticks, no preamble. Output exactly this JSON structure:
{
  "opening_line": "A single natural sentence to open the call, referencing their specific situation",
  "talking_points": [
    "Point 1 — specific to their top pain point",
    "Point 2 — connecting their gap to industry average",
    "Point 3 — a low-pressure next step framing"
  ],
  "objection_handlers": {
    "we are doing fine": "A natural, empathetic response",
    "no budget": "A natural, empathetic response",
    "not interested": "A natural, empathetic response",
    "call me later": "A natural response with a specific callback ask"
  },
  "qa_facts": [
    "A confidence fact the caller should know before the call",
    "A competitive context fact",
    "A data point that adds authority to the conversation"
  ],
  "suggested_close": "A single sentence to naturally move toward booking a follow-up meeting"
}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { business_id, force_regenerate = false } = await req.json();

    if (!business_id) {
      return new Response(JSON.stringify({ error: 'business_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // STEP 1 — Load business data
    const { data: biz, error: bizError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', business_id)
      .single();

    if (bizError || !biz) {
      return new Response(JSON.stringify({ error: 'Business not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // STEP 2 — Check cache (unless force_regenerate)
    if (!force_regenerate) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: cachedScript } = await supabase
        .from('ai_scripts')
        .select('*')
        .eq('business_id', business_id)
        .eq('is_active', true)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cachedScript) {
        return new Response(JSON.stringify({ cached: true, script: cachedScript }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // STEP 3 — Get an active Groq key
    const keyRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/groq-key-manager`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ action: 'get_active_key' }),
    });

    const keyData = await keyRes.json();

    if (!keyData?.key) {
      return new Response(JSON.stringify({ error: 'no_keys_available' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const key = keyData.key;

    // STEP 4 — Build user prompt
    const userPrompt = `Generate a cold call script for this business:

Business: ${biz.business_name}
Category: ${biz.category || 'Unknown'}
City: ${biz.city || 'Unknown'}, ${biz.country_code}
Google Rating: ${biz.rating || 'N/A'} stars from ${biz.reviews || 'unknown'} reviews
Negative reviews: ${biz.negative_pct || 0}%
Health Score: ${biz.health_score || 'N/A'}/100
Industry average rating: ${biz.industry_avg_rating || 'N/A'} stars
Top pain point from reviews: ${biz.top_pain_point || 'Not analyzed'}
All pain points: ${JSON.stringify(biz.pain_points || [])}
${biz.notes ? 'Additional notes: ' + biz.notes : ''}

The caller will use this script on a real phone call. Make every line feel like something a real person would naturally say. Reference their specific data points, not generic advice.`;

    // STEP 5 — Call Groq API
    const startMs = Date.now();

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        temperature: 0.72,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    const generationMs = Date.now() - startMs;

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      // Mark key as cooling if rate limited
      if (groqRes.status === 429) {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/groq-key-manager`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({ action: 'mark_cooling', key_id: key.id, error_message: 'Rate limited' }),
        });
      }
      return new Response(JSON.stringify({ error: `Groq API error: ${groqRes.status}`, details: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const groqData = await groqRes.json();
    const rawText = groqData?.choices?.[0]?.message?.content || '';
    const tokensUsed = groqData?.usage?.total_tokens || 0;

    // STEP 6 — Parse and validate JSON response
    let scriptData;
    try {
      // Strip any accidental markdown fences
      const cleaned = rawText.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
      scriptData = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid_json_from_model', raw: rawText }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate required keys
    const requiredKeys = ['opening_line', 'talking_points', 'objection_handlers', 'qa_facts', 'suggested_close'];
    for (const k of requiredKeys) {
      if (!scriptData[k]) {
        return new Response(JSON.stringify({ error: `Missing key in model response: ${k}`, raw: rawText }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // STEP 7 — Deactivate old scripts
    await supabase
      .from('ai_scripts')
      .update({ is_active: false })
      .eq('business_id', business_id);

    // STEP 8 — Save new script
    const { data: newScript, error: insertError } = await supabase
      .from('ai_scripts')
      .insert({
        business_id,
        opening_line: scriptData.opening_line,
        talking_points: scriptData.talking_points,
        objection_handlers: scriptData.objection_handlers,
        qa_facts: scriptData.qa_facts,
        suggested_close: scriptData.suggested_close,
        model_used: 'llama-3.3-70b-versatile',
        groq_key_id: key.id,
        prompt_version: 'v1',
        tokens_used: tokensUsed,
        generation_ms: generationMs,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to save script', details: insertError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // STEP 9 — Mark key as used
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/groq-key-manager`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ action: 'mark_used', key_id: key.id, tokens_used: tokensUsed }),
    });

    // STEP 10 — Return script
    return new Response(JSON.stringify({ cached: false, script: newScript }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

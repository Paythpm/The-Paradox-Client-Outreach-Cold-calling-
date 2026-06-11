import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── What we offer — injected into every prompt ───────────────────────────────
const WHAT_WE_OFFER = `
We help local businesses across AU, CA, UK, and US grow their client base by
leveraging their Google Maps presence — turning their existing ratings and reviews
into a consistent source of new enquiries. The core offer: a 15-minute strategy
session to show them exactly how their current online reputation stacks up against
local competitors and where the hidden growth is.

The GOAL of every cold call is NOT to sell anything.
The ONLY goal is: get a 15-minute follow-up meeting or call booked.
Every script must close with a clear, low-pressure ask for that meeting.
Never pitch features or pricing on the first call.
`;

// ─── Tier detection ───────────────────────────────────────────────────────────
function getScriptTier(rating: number, negPct: number, healthScore: number) {
  const r = rating || 0, n = negPct || 0, h = healthScore || 50;

  if (r >= 4.8 && n <= 8 && h >= 85) {
    return {
      tier: 'elite', tierLabel: 'Elite Business',
      instructions: `
This is a top-performing business. They know they are excellent.
STRICT RULES for elite businesses:
- NEVER say they have problems, issues, or things to fix
- NEVER mention negative reviews (they have almost none)
- NEVER say "I noticed some customers mentioned..." (it's patronising)
- The opening line MUST acknowledge their excellence BRIEFLY, then immediately
  pivot to OPPORTUNITY: most people searching for their category in their city
  never find them, despite their great reputation
- The hook: "Your reputation is your biggest asset — the question is whether
  it's working as hard as it could be for you"
- Talking points must include one specific statistic:
  "Did you know that 78% of people searching for [category] in [city] only
   call the first 3 results on Google Maps — your competitors may be
   getting those calls even though your reviews are better?"
- Talking points: visibility, competitive edge, converting reputation into booked clients
- Tone: peer-level, respectful, ambitious. Never salesy.
`,
    };
  }

  if (r >= 4.0 && n <= 20 && h >= 60) {
    return {
      tier: 'grow', tierLabel: 'Strong Business',
      instructions: `
This is an above-average business with a good reputation and minor improvement areas.
RULES for strong businesses:
- Lead with genuine acknowledgement of their strong performance
- The main hook is the GAP: they're good, but there's a specific opportunity
  to be great — and their top competitor is already there
- Use their pain points as secondary hooks, not the main opener
- Reference the industry average: "You're above the local average, but the top
  [category] in [city] is pulling even further ahead"
- Talking points: reputation leverage, specific pain point, competitive positioning
- Tone: collaborative, forward-looking, confident
`,
    };
  }

  if (r >= 3.0 && n <= 50 && h >= 35) {
    return {
      tier: 'improve', tierLabel: 'Mid-Tier Business',
      instructions: `
This business is doing okay but has clear, specific areas for improvement
showing up in their reviews. They likely know about these issues.
RULES for mid-tier businesses:
- Be specific about their top pain point — name it directly but constructively
- Hook: "I noticed [specific issue] keeps coming up in your reviews — I work
  with businesses in [city] to fix exactly that"
- Show understanding without being condescending
- Reference the gap between their rating and the industry average
- Talking points: specific pain point, rating gap, concrete fast fix
- Include time-bound hook in close: "it takes about 15 minutes to show you"
- Tone: direct, solution-focused, empathetic
`,
    };
  }

  return {
    tier: 'rescue', tierLabel: 'Struggling Business',
    instructions: `
This business has serious issues showing up publicly in their reviews.
RULES for rescue businesses:
- Open with empathy, never criticism
- Be very specific: "I noticed [exact pain point] is coming up in [X]% of
  your reviews — that's actually a very fixable problem"
- Urgency angle: every week without fixing this, potential clients choose a competitor
- Focus on the single biggest issue only — don't pile on
- The close must feel like a lifeline, not a sales pitch
- Tone: empathetic, urgent, concrete
- Objection handlers must acknowledge the difficulty of their situation
`,
  };
}

// ─── Industry context ─────────────────────────────────────────────────────────
function getIndustryContext(category: string): string {
  const c = (category || '').toLowerCase();

  if (c.includes('law') || c.includes('legal') || c.includes('solicitor') ||
      c.includes('attorney') || c.includes('barrister') || c.includes('notary') ||
      c.includes('avocat') || c.includes('counselor')) {
    return `INDUSTRY: Legal / Law Firm
- Lawyers care about: new client acquisition, referral networks, professional reputation
- Use "clients", "enquiries", "referrals" — NOT "customers" or "patients"
- Never mention "booking friction" — irrelevant for legal
- Regulated industry — use "could help" not "will increase"
- Senior partners are proud of reputation — approach as a peer, never as a vendor`;
  }

  if (c.includes('dent') || c.includes('orthodont') || c.includes('endodont') ||
      c.includes('periodont') || c.includes('oral surgeon') || c.includes('prosthodont')) {
    return `INDUSTRY: Dental Practice
- Dentists care about: patient retention, reducing no-shows, filling appointment slots
- "Recall patients" (not returned in 12+ months) is a major concern
- One bad review can cost 10 new patients
- Use "patients", "practice", "appointments", "recall"
- ROI framing works: "filling 2 extra slots per week at $X = $Y/year"`;
  }

  if (c.includes('clinic') || c.includes('medical') || c.includes('doctor') ||
      c.includes('physician') || c.includes('health') || c.includes('physiother') ||
      c.includes('chiro') || c.includes('osteo')) {
    return `INDUSTRY: Medical / Allied Health
- Practitioners care about: patient trust, wait time reputation, credibility
- Regulated — be careful with outcome claims
- Use "patients" not "customers", "practice" not "business"
- Pain points: long wait perception, difficulty getting appointments`;
  }

  if (c.includes('account') || c.includes('bookkeep') || c.includes('tax') ||
      c.includes('financ') || c.includes('cpa') || c.includes('chartered')) {
    return `INDUSTRY: Accounting / Financial Services
- Care about: standing out from identical local competitors, getting found during tax season
- Most firms look identical online — reviews are the differentiator
- Use "clients", "practice", "referrals"
- Best hook: "Most people choose their accountant based on Google reviews — is yours working?"`;
  }

  if (c.includes('restaurant') || c.includes('cafe') || c.includes('bistro') ||
      c.includes('pub') || c.includes('food') || c.includes('bakery') ||
      c.includes('pizza') || c.includes('sushi') || c.includes('bar ')) {
    return `INDUSTRY: Restaurant / Hospitality
- Google Maps is their #1 discovery channel — "near me" searches dominate
- Reviews are existential — one bad month can kill a restaurant
- Use "guests", "covers", "foot traffic", "reservations"
- High-rated hook: "Your 5-star reputation should be bringing 3x more walk-ins"`;
  }

  if (c.includes('real estate') || c.includes('estate agent') || c.includes('realt') ||
      c.includes('property') || c.includes('letting') || c.includes('mortgage')) {
    return `INDUSTRY: Real Estate / Property
- Agents care about: listing volume, buyer leads, local competitive edge
- Trust is everything — reviews directly convert to enquiries
- Use "clients", "listings", "enquiries", "vendors", "buyers"`;
  }

  if (c.includes('plumb') || c.includes('electr') || c.includes('hvac') ||
      c.includes('roof') || c.includes('landscap') || c.includes('clean') ||
      c.includes('pest') || c.includes('paint') || c.includes('build')) {
    return `INDUSTRY: Trades / Home Services
- Tradespeople care about: repeat business, word-of-mouth referrals, job volume
- Reviews ARE their digital word-of-mouth
- Use "jobs", "clients", "callouts", "referrals"
- Best hook: "Your competitors with more reviews are getting called first — even when they charge more"`;
  }

  return `INDUSTRY: General Business
Use the business's specific pain points and rating tier as the primary context.
Be specific about their actual data — don't use generic statements.`;
}

// ─── Language / regional note ─────────────────────────────────────────────────
function getLanguageNote(city: string, countryCode: string, businessName: string): string {
  const FRENCH_CITIES = ['quebec','montreal','laval','gatineau','longueuil','sherbrooke',
    'saguenay','levis','trois-rivieres','terrebonne','saint-jean','drummondville','granby'];
  const FRENCH_SIGNALS = ['avocat','avocate','cabinet','société','clinique','médical',
    'médecin','dentaire','comptable','notaire','immobilier','groupe','centre'];

  const cityL = (city || '').toLowerCase();
  const nameL = (businessName || '').toLowerCase();

  if (countryCode === 'CA' &&
      (FRENCH_CITIES.some(fc => cityL.includes(fc)) || FRENCH_SIGNALS.some(fs => nameL.includes(fs)))) {
    return `LANGUAGE FLAG — FRENCH QUEBEC MARKET:
This business is likely French-speaking. Add as first qa_fact:
"⚠️ French-speaking market — open in English, ask within 5 seconds: 'Parlez-vous anglais? / Do you speak English?' If they prefer French, acknowledge: 'Je vous rappellerai avec un collègue francophone si vous préférez.'"
Tone should be more reserved and relationship-focused than English markets.`;
  }

  if (countryCode === 'AU' && (cityL.includes('darwin') || cityL.includes('alice springs') ||
      cityL.includes('broome') || cityL.includes('cairns'))) {
    return `REGIONAL NOTE — NORTHERN AUSTRALIA: Remote/regional city. Be patient on calls, don't assume city-speed communication styles.`;
  }

  return '';
}

// ─── Main Deno server ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { business_id, force_regenerate = false, variant = 'primary' } = await req.json();

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
        .eq('variant', variant)
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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ action: 'get_active_key' }),
    });
    const keyData = await keyRes.json();
    if (!keyData?.key) {
      return new Response(JSON.stringify({ error: 'no_keys_available' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const key = keyData.key;

    // STEP 4 — Build the upgraded tiered prompt
    const ratingNum   = parseFloat(biz.rating) || 0;
    const negPctNum   = parseFloat(biz.negative_pct) || 0;
    const healthNum   = parseInt(biz.health_score) || 50;
    const tierData    = getScriptTier(ratingNum, negPctNum, healthNum);
    const industry    = getIndustryContext(biz.category || '');
    const langNote    = getLanguageNote(biz.city || '', biz.country_code || '', biz.business_name || '');
    const contactLine = biz.contact_name ? `Contact name: ${biz.contact_name}` : '';

    const alternativeInstruction = variant === 'alternative' ? `
━━━ VARIANT: ALTERNATIVE APPROACH ━━━
This is a SECOND script. A caller already tried the primary approach and it didn't convert.
Generate a completely different angle:
- If primary used a "problem" hook → use a "curiosity" or "competitor" hook
- If primary used their rating → use their specific reviews or city context
- If primary was direct → make this one more question-based and conversational
- The opening line must be completely different from the standard approach
- Label in qa_facts[2]: "Alternative script — angle used: [describe the angle]"
` : '';

    const painPointsText = Array.isArray(biz.pain_points) && biz.pain_points.length > 0
      ? `Pain points from reviews: ${JSON.stringify(biz.pain_points)}`
      : 'No specific pain points identified in reviews.';

    const SYSTEM_PROMPT = `
You are an expert cold calling coach helping sales reps open conversations with local businesses.
Generate a highly personalised, natural-sounding call script based on real Google Maps review data.

${WHAT_WE_OFFER}

CRITICAL RULES — apply to ALL scripts:
1. Output ONLY valid JSON. No markdown, no backticks, no preamble, no explanation.
2. Every sentence must sound like something a real human says on a phone call. Read it aloud.
3. Use REAL data: specific rating, specific city, specific pain points. No generic statements.
4. Opening line must reference something SPECIFIC about this exact business in the first sentence.
5. Close must always be a low-pressure ask for a 15-minute follow-up meeting. Never sell on first call.
6. Objection handlers MUST reference the specific business data — never use generic sales language.
   For "we are doing fine": acknowledge their specific performance, then pivot to the visibility opportunity.
   e.g. "Your [X] stars is genuinely impressive — I'm not calling because something's wrong.
        I'm calling because businesses like yours often leave clients on the table simply because
        they're not the first result when someone searches in [city]."
7. Use the contact's first name if provided. If not, use the business name.

Output exactly this JSON structure:
{
  "opening_line": "A single natural sentence — specific to this exact business",
  "talking_points": [
    "Point 1 — tied to their specific data or pain point",
    "Point 2 — industry-relevant angle or competitive context with specific statistic",
    "Point 3 — low-pressure bridge to the meeting ask"
  ],
  "objection_handlers": {
    "we are doing fine": "Warm, specific response referencing their actual rating data",
    "no budget": "Response that reframes cost — the meeting is free and takes 15 min",
    "not interested": "Graceful exit that leaves the door open",
    "call me later": "Specific callback ask with a day and time suggestion"
  },
  "qa_facts": [
    "A specific data fact the caller should know before the call",
    "A competitive context or industry comparison fact",
    "A cultural/language/regional note if applicable — otherwise a third data point"
  ],
  "suggested_close": "One natural sentence to move toward booking the 15-minute meeting"
}`;

    const userPrompt = `
Generate a cold call script for this business.

━━━ BUSINESS DATA ━━━
Business: ${biz.business_name}
Category: ${biz.category || 'General Business'}
City: ${biz.city || 'Unknown'}, ${biz.country_code}
${contactLine}

━━━ PERFORMANCE DATA ━━━
Google Rating: ${ratingNum} stars from ${biz.reviews || 0} reviews
Negative Reviews: ${negPctNum}%
Health Score: ${healthNum}/100
Industry Average: 4.2 stars
Script Tier: ${tierData.tierLabel}

━━━ REVIEW INTELLIGENCE ━━━
Top pain point: ${biz.top_pain_point || 'None identified'}
${painPointsText}
${biz.notes ? `Additional context: ${biz.notes}` : ''}

━━━ SCRIPT APPROACH ━━━
${tierData.instructions}

━━━ INDUSTRY CONTEXT ━━━
${industry}

${langNote ? `━━━ LANGUAGE / REGIONAL NOTE ━━━\n${langNote}` : ''}
${alternativeInstruction}

Remember: The goal is to book a 15-minute follow-up, not to sell anything.
Every line must sound like a real person talking, not a script being read.
`;

    // STEP 5 — Call Groq
    const startMs = Date.now();
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1200,
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
      if (groqRes.status === 429) {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/groq-key-manager`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({ action: 'mark_cooling', key_id: key.id, error_message: 'Rate limited' }),
        });
      }
      return new Response(JSON.stringify({ error: `Groq error: ${groqRes.status}`, details: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const groqData = await groqRes.json();
    const rawText = groqData?.choices?.[0]?.message?.content || '';
    const tokensUsed = groqData?.usage?.total_tokens || 0;

    // STEP 6 — Parse and validate
    let scriptData;
    try {
      const cleaned = rawText.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
      scriptData = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid_json_from_model', raw: rawText }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const required = ['opening_line', 'talking_points', 'objection_handlers', 'qa_facts', 'suggested_close'];
    for (const k of required) {
      if (!scriptData[k]) return new Response(JSON.stringify({ error: `Missing: ${k}`, raw: rawText }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Derive variant_angle from the tier and opening approach
    const variantAngle = variant === 'alternative'
      ? `alternative-${tierData.tier}`
      : tierData.tier;

    // STEP 7 — Deactivate old scripts of same variant
    await supabase
      .from('ai_scripts')
      .update({ is_active: false })
      .eq('business_id', business_id)
      .eq('variant', variant);

    // STEP 8 — Save new script
    const { data: newScript, error: insertError } = await supabase
      .from('ai_scripts')
      .insert({
        business_id,
        opening_line:       scriptData.opening_line,
        talking_points:     scriptData.talking_points,
        objection_handlers: scriptData.objection_handlers,
        qa_facts:           scriptData.qa_facts,
        suggested_close:    scriptData.suggested_close,
        model_used:         'llama-3.3-70b-versatile',
        groq_key_id:        key.id,
        prompt_version:     'v3',
        tokens_used:        tokensUsed,
        generation_ms:      generationMs,
        is_active:          true,
        variant,
        variant_angle:      variantAngle,
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

    return new Response(JSON.stringify({ cached: false, script: newScript, tier: tierData.tier }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

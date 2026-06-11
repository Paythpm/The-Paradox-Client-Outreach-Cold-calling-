import supabase from '../lib/supabase';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_MAX_TOKENS = 1000;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_RETRIES = 5;

/**
 * Call Groq API with automatic key rotation and retry logic
 * @param {string} prompt - The user message
 * @param {string} systemPrompt - The system instructions
 * @param {object} options - { model, max_tokens, temperature, retries }
 * @returns {Promise<string>} - The model's response text
 */
export async function callGroq(prompt, systemPrompt, options = {}) {
  const retries = options.retries ?? DEFAULT_RETRIES;

  // Step 1: Get an active key from the pool
  const { data: keyData, error: keyError } = await supabase.functions.invoke('groq-key-manager', {
    body: { action: 'get_active_key' }
  });

  if (keyError || !keyData?.key) {
    throw new Error('All Groq keys exhausted for today. Try again tomorrow.');
  }

  const key = keyData.key;

  // Step 2: Call Groq API
  let response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || DEFAULT_MODEL,
        max_tokens: options.max_tokens || DEFAULT_MAX_TOKENS,
        temperature: options.temperature || DEFAULT_TEMPERATURE,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch (networkError) {
    await markKeyError(key.id, networkError.message);
    throw new Error(`Network error calling Groq: ${networkError.message}`);
  }

  // Step 3: Handle rate limiting (429)
  if (response.status === 429) {
    await markKeyCooling(key.id, 'Rate limited (429)');

    if (retries > 0) {
      // Retry with one fewer retry and without this key
      return callGroq(prompt, systemPrompt, { ...options, retries: retries - 1 });
    }
    throw new Error('Rate limited on all available Groq keys. Try again in a few minutes.');
  }

  // Step 4: Handle other errors
  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    await markKeyError(key.id, `HTTP ${response.status}: ${errText}`);
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  // Step 5: Parse response
  const result = await response.json();
  const text = result?.choices?.[0]?.message?.content;
  const tokensUsed = result?.usage?.total_tokens || 0;

  if (!text) {
    throw new Error('Groq returned an empty response');
  }

  // Step 6: Mark key as used
  await supabase.functions.invoke('groq-key-manager', {
    body: { action: 'mark_used', key_id: key.id, tokens_used: tokensUsed }
  });

  return text;
}

async function markKeyCooling(keyId, message) {
  await supabase.functions.invoke('groq-key-manager', {
    body: { action: 'mark_cooling', key_id: keyId, error_message: message }
  });
}

async function markKeyError(keyId, message) {
  await supabase.functions.invoke('groq-key-manager', {
    body: { action: 'mark_error', key_id: keyId, error_message: message }
  });
}

/**
 * Get current Groq key pool status
 */
export async function getKeyPoolStatus() {
  const { data } = await supabase.functions.invoke('groq-key-manager', {
    body: { action: 'get_pool_status' }
  });
  return data;
}

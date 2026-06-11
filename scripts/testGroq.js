// Quick end-to-end test of groq-key-manager + generate-script
// Run with: node scripts/testGroq.js

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  console.log('=== TEST 1: groq-key-manager pool status ===');
  const { data: poolStatus, error: poolErr } = await supabase.functions.invoke('groq-key-manager', {
    body: { action: 'get_pool_status' }
  });
  if (poolErr) { console.log('FAIL:', poolErr.message); return; }
  console.log('Pool status:', JSON.stringify(poolStatus, null, 2));

  console.log('\n=== TEST 2: groq-key-manager get_active_key ===');
  const { data: keyData, error: keyErr } = await supabase.functions.invoke('groq-key-manager', {
    body: { action: 'get_active_key' }
  });
  if (keyErr) { console.log('FAIL:', keyErr.message); return; }
  if (!keyData?.key) { console.log('FAIL: no key returned:', keyData); return; }
  console.log('Got key:', keyData.key.display_label, '| id:', keyData.key.id);

  console.log('\n=== TEST 3: generate-script (needs a real business_id) ===');
  // Get any business from the table
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, business_name, country_code')
    .limit(1)
    .single();

  if (!businesses) {
    console.log('SKIP: No businesses in table yet (import your Excel data first)');
    console.log('\nAll core functions are working. Import data then test generate-script.');
    return;
  }

  console.log('Testing with business:', businesses.business_name, '(', businesses.id, ')');
  const { data: script, error: scriptErr } = await supabase.functions.invoke('generate-script', {
    body: { business_id: businesses.id, force_regenerate: true }
  });

  if (scriptErr) { console.log('FAIL:', scriptErr.message); return; }
  if (script?.error) { console.log('FAIL:', script.error); return; }

  console.log('Script generated successfully!');
  console.log('Cached:', script.cached);
  console.log('Opening line:', script.script?.opening_line);
  console.log('Talking points:', script.script?.talking_points?.length, 'points');
  console.log('Tokens used:', script.script?.tokens_used);
  console.log('Generation time:', script.script?.generation_ms + 'ms');
  console.log('\n=== ALL TESTS PASSED ===');
}

test().catch(console.error);

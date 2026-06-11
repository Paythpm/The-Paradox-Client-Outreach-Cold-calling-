// Run with: node scripts/seedGroqKeys.js
// Requires: REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_SERVICE_ROLE_KEY in .env.local

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const keysPath = path.join(__dirname, 'groq_keys.json');

  if (!fs.existsSync(keysPath)) {
    console.error('groq_keys.json not found. Create it at scripts/groq_keys.json with format:');
    console.error('[{"api_key":"gsk_xxx","account_email":"you@gmail.com","display_label":"Account 1"}]');
    process.exit(1);
  }

  const keys = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));
  console.log(`Found ${keys.length} keys in groq_keys.json`);

  let inserted = 0;
  let skipped = 0;

  for (const key of keys) {
    const { data: existing } = await supabase
      .from('groq_keys')
      .select('id')
      .eq('api_key', key.api_key)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from('groq_keys').insert({
      api_key: key.api_key,
      account_email: key.account_email,
      display_label: key.display_label || key.account_email,
      is_active: true,
      is_cooling: false,
      calls_today: 0,
      tokens_today: 0,
      daily_call_limit: 1000,
    });

    if (error) {
      console.error(`Failed to insert ${key.display_label}: ${error.message}`);
    } else {
      inserted++;
      console.log(`✓ Seeded: ${key.display_label}`);
    }
  }

  console.log(`\nDone: ${inserted} seeded, ${skipped} skipped (already exist)`);
}

main().catch(console.error);

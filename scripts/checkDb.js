const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('\n=== TABLE CHECK ===');
  const tables = ['callers','businesses','call_logs','groq_keys','ai_scripts','meetings','do_not_call_list'];
  for (const t of tables) {
    const { error } = await supabase.from(t).select('id').limit(1);
    console.log(t + ': ' + (error ? 'MISSING — ' + error.message : 'OK'));
  }

  console.log('\n=== COLUMN CHECK ===');
  // call_status on call_logs
  const { data: cl, error: cle } = await supabase.from('call_logs').select('call_status').limit(1);
  console.log('call_logs.call_status: ' + (cle ? 'MISSING' : 'OK'));

  // recording_url on call_logs
  const { data: ru, error: rue } = await supabase.from('call_logs').select('recording_url').limit(1);
  console.log('call_logs.recording_url: ' + (rue ? 'MISSING' : 'OK'));

  console.log('\n=== FUNCTION CHECK ===');
  const { error: e1 } = await supabase.rpc('increment_groq_usage', { p_key_id: '00000000-0000-0000-0000-000000000000', p_tokens: 0 });
  console.log('increment_groq_usage: ' + (e1 && e1.message.includes('not exist') ? 'MISSING' : 'OK — ' + (e1 ? e1.message.slice(0,80) : 'no error')));

  const { error: e2 } = await supabase.rpc('increment_groq_errors', { p_key_id: '00000000-0000-0000-0000-000000000000', p_threshold: 10 });
  console.log('increment_groq_errors: ' + (e2 && e2.message.includes('not exist') ? 'MISSING' : 'OK — ' + (e2 ? e2.message.slice(0,80) : 'no error')));

  const { error: e3 } = await supabase.rpc('is_do_not_call', { phone_number: 'test' });
  console.log('is_do_not_call: ' + (e3 && e3.message.includes('not exist') ? 'MISSING' : 'OK'));

  console.log('\n=== UNIQUE CONSTRAINT CHECK ===');
  // Try inserting duplicate phone+country — should fail with unique violation
  await supabase.from('businesses').delete().eq('phone', '__dup_test__');
  const { error: ins1 } = await supabase.from('businesses').insert({ business_name: 'Test A', phone: '__dup_test__', country_code: 'AU' });
  const { error: ins2 } = await supabase.from('businesses').insert({ business_name: 'Test B', phone: '__dup_test__', country_code: 'AU' });
  if (ins2 && ins2.message.toLowerCase().includes('unique')) {
    console.log('businesses phone+country unique constraint: OK');
  } else if (!ins2) {
    console.log('businesses phone+country unique constraint: MISSING (duplicate allowed)');
  } else {
    console.log('businesses phone+country unique constraint: ' + ins2.message);
  }
  // Cleanup
  await supabase.from('businesses').delete().eq('phone', '__dup_test__');

  console.log('\n=== GROQ KEYS ===');
  const { data: keys, error: ke } = await supabase.from('groq_keys').select('id, display_label, is_active, is_cooling, calls_today, consecutive_errors');
  if (ke) { console.log('Error: ' + ke.message); }
  else {
    console.log('Total keys: ' + keys.length);
    keys.forEach(k => {
      console.log('  ' + k.display_label + ' | active:' + k.is_active + ' | cooling:' + k.is_cooling + ' | calls_today:' + k.calls_today + ' | errors:' + k.consecutive_errors);
    });
  }

  console.log('\n=== RLS CHECK ===');
  // Switch to anon key to test RLS
  const anonClient = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
  );
  const { data: anonGroq, error: anonGroqErr } = await anonClient.from('groq_keys').select('id').limit(1);
  console.log('groq_keys blocked from anon: ' + (anonGroqErr || !anonGroq || anonGroq.length === 0 ? 'OK (protected)' : 'WARNING — anon can read groq keys!'));
  const { data: anonBiz, error: anonBizErr } = await anonClient.from('businesses').select('id').limit(1);
  console.log('businesses readable by anon (needs auth): ' + (anonBizErr ? 'blocked — ' + anonBizErr.message.slice(0,60) : 'accessible (' + (anonBiz ? anonBiz.length : 0) + ' rows)'));

  console.log('\n=== DONE ===');
}

check().catch(console.error);

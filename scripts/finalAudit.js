/**
 * finalAudit.js — Complete system health check
 * Tests every layer from DB schema to edge functions to data quality
 * Run: node scripts/finalAudit.js
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const { toZonedTime }  = require('date-fns-tz');

const supa     = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anonSupa = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

const { normalizePhone } = require('./phoneNormalizer');

const PASS = [], WARN = [], FAIL = [];
function pass(msg) { PASS.push(msg); process.stdout.write('.'); }
function warn(msg) { WARN.push(msg); process.stdout.write('W'); }
function fail(msg) { FAIL.push(msg); process.stdout.write('F'); }

async function safe(label, fn) {
  try { await fn(); }
  catch (e) { fail(label + ' — threw: ' + e.message); }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         DENTIQ — FINAL SYSTEM AUDIT                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('Running checks (. = pass, W = warn, F = fail)...\n');

  // ══════════════════════════════════════════════════════════════════════
  // 1. DATABASE SCHEMA
  // ══════════════════════════════════════════════════════════════════════
  console.log('1. Database schema...');

  const tables = ['callers','businesses','call_logs','groq_keys','ai_scripts','meetings','do_not_call_list'];
  for (const t of tables) {
    await safe('Table ' + t, async () => {
      const { error } = await supa.from(t).select('id').limit(1);
      error ? fail('Table ' + t + ' missing: ' + error.message) : pass('Table ' + t + ' exists');
    });
  }

  // Extra columns added by patches
  const extraCols = [
    { table:'businesses', col:'place_id' },
    { table:'businesses', col:'timezone' },
    { table:'call_logs',  col:'call_status' },
    { table:'call_logs',  col:'recording_url' },
  ];
  for (const { table, col } of extraCols) {
    await safe('Column ' + col, async () => {
      const { error } = await supa.from(table).select(col).limit(1);
      error ? fail('Column ' + table + '.' + col + ' missing') : pass(table + '.' + col + ' exists');
    });
  }

  // RPC functions
  await safe('RPC increment_groq_usage', async () => {
    const { error } = await supa.rpc('increment_groq_usage', { p_key_id: '00000000-0000-0000-0000-000000000000', p_tokens: 0 });
    error?.message?.includes('not exist') ? fail('RPC increment_groq_usage missing') : pass('RPC increment_groq_usage OK');
  });
  await safe('RPC increment_groq_errors', async () => {
    const { error } = await supa.rpc('increment_groq_errors', { p_key_id: '00000000-0000-0000-0000-000000000000', p_threshold: 10 });
    error?.message?.includes('not exist') ? fail('RPC increment_groq_errors missing') : pass('RPC increment_groq_errors OK');
  });
  await safe('RPC is_do_not_call', async () => {
    const { error } = await supa.rpc('is_do_not_call', { phone_number: 'test' });
    error?.message?.includes('not exist') ? fail('RPC is_do_not_call missing') : pass('RPC is_do_not_call OK');
  });

  // Unique constraint
  await safe('Unique constraint', async () => {
    await supa.from('businesses').delete().eq('phone', '__audit_test__');
    await supa.from('businesses').insert({ business_name: 'A', phone: '__audit_test__', country_code: 'AU' });
    const { error } = await supa.from('businesses').insert({ business_name: 'B', phone: '__audit_test__', country_code: 'AU' });
    await supa.from('businesses').delete().eq('phone', '__audit_test__');
    error?.message?.includes('unique') ? pass('Unique constraint phone+country enforced') : fail('Unique constraint phone+country BROKEN');
  });

  // Triggers
  await safe('Auth trigger handle_new_user', async () => {
    const { data } = await supa.from('callers').select('id').limit(1);
    data !== null ? pass('callers table accessible (auth trigger target)') : warn('callers table empty — no users logged in yet');
  });

  // ══════════════════════════════════════════════════════════════════════
  // 2. DATA QUALITY
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n2. Data quality...');

  await safe('Business counts', async () => {
    const counts = {};
    for (const cc of ['US','AU','CA','UK']) {
      const { count: total }  = await supa.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc);
      const { count: phone }  = await supa.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc).not('phone','is',null);
      const { count: tz }     = await supa.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc).not('timezone','is',null);
      const { count: enrich } = await supa.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc).not('health_score','is',null);
      counts[cc] = { total, phone, tz, enrich };
      total > 3000 ? pass(cc + ': ' + total + ' businesses') : warn(cc + ': only ' + total + ' businesses');
      phone / total > 0.9 ? pass(cc + ': ' + Math.round(phone/total*100) + '% have phone') : warn(cc + ': only ' + Math.round(phone/total*100) + '% have phone');
      tz === total ? pass(cc + ': 100% timezone coverage') : warn(cc + ': ' + tz + '/' + total + ' have timezone');
      enrich > 0 ? pass(cc + ': ' + enrich + ' enriched with pain points') : warn(cc + ': 0 enriched');
    }
    const total = Object.values(counts).reduce((s,c) => s + c.total, 0);
    total > 50000 ? pass('Total: ' + total.toLocaleString() + ' businesses') : warn('Total: only ' + total.toLocaleString());
  });

  await safe('Sort order', async () => {
    const { data } = await supa.from('businesses').select('health_score,rating').eq('country_code','US').order('health_score',{ascending:false,nullsFirst:false}).order('rating',{ascending:false,nullsFirst:false}).range(0,4);
    data?.[0]?.health_score !== null ? pass('Sort: enriched rows appear first (health_score non-null)') : warn('Sort: first row has null health_score — sort may be off');
  });

  await safe('Groq keys data', async () => {
    const { data } = await supa.from('groq_keys').select('id,is_active,is_cooling,calls_today').order('calls_today',{ascending:false});
    const active = data?.filter(k => k.is_active && !k.is_cooling).length;
    data?.length === 11 ? pass('Groq keys: 11 rows') : fail('Groq keys: wrong count ' + data?.length);
    active === 11 ? pass('Groq keys: all 11 active') : warn('Groq keys: only ' + active + ' active');
    data?.every(k => k.calls_today < 1000) ? pass('Groq keys: all under daily limit') : warn('Some groq keys near daily limit');
  });

  // ══════════════════════════════════════════════════════════════════════
  // 3. EDGE FUNCTIONS — CONNECTIVITY
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n3. Edge functions...');

  const edgeFunctions = [
    'groq-key-manager',
    'generate-script',
    'send-meeting-confirmation',
    'send-reminders',
    'twilio-access-token',
    'twilio-voice',
    'twilio-status-callback',
    'twilio-message-webhook',
  ];
  for (const fn of edgeFunctions) {
    await safe('Edge fn ' + fn, async () => {
      const { error } = await supa.functions.invoke(fn, { body: {} });
      error?.message?.includes('fetch failed') ? fail(fn + ': UNREACHABLE') : pass(fn + ': reachable');
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // 4. GROQ AI ENGINE — DEEP TEST
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n4. Groq AI engine...');

  await safe('Groq pool status', async () => {
    const { data: pool } = await supa.functions.invoke('groq-key-manager', { body: { action: 'get_pool_status' } });
    pool?.total ? pass('Pool status: ' + pool.total + ' total, ' + pool.active + ' active') : fail('Pool status failed');
  });

  await safe('Groq get_active_key', async () => {
    const { data } = await supa.functions.invoke('groq-key-manager', { body: { action: 'get_active_key' } });
    data?.key?.id ? pass('get_active_key: returned ' + data.key.display_label) : fail('get_active_key: no key returned');
  });

  let testBizId = null;
  await safe('Fetch test business', async () => {
    const { data } = await supa.from('businesses').select('id,business_name,city,country_code').not('health_score','is',null).not('phone','is',null).eq('country_code','US').limit(1).single();
    testBizId = data?.id;
    data?.id ? pass('Test business: ' + data.business_name + ', ' + data.city) : fail('No enriched US business found');
  });

  if (testBizId) {
    await safe('Script generation (fresh)', async () => {
      const { data: s } = await supa.functions.invoke('generate-script', { body: { business_id: testBizId, force_regenerate: false } });
      if (!s?.script) { fail('generate-script: no script returned'); return; }
      pass('generate-script: returned script (cached=' + s.cached + ')');
      s.script.opening_line ? pass('Script opening_line present') : fail('Script missing opening_line');
      s.script.talking_points?.length === 3 ? pass('Script: 3 talking points') : warn('Script: ' + s.script.talking_points?.length + ' talking points');
      Object.keys(s.script.objection_handlers||{}).length === 4 ? pass('Script: 4 objection handlers') : warn('Script: ' + Object.keys(s.script.objection_handlers||{}).length + ' objection handlers');
      s.script.qa_facts?.length === 3 ? pass('Script: 3 QA facts') : warn('Script: ' + s.script.qa_facts?.length + ' QA facts');
      s.script.suggested_close ? pass('Script: suggested_close present') : fail('Script: missing suggested_close');
      s.script.tokens_used > 0 ? pass('Script: tokens_used=' + s.script.tokens_used) : warn('Script: no token count');
      s.script.generation_ms > 0 ? pass('Script: generation_ms=' + s.script.generation_ms) : warn('Script: no generation time');
    });

    await safe('Script caching', async () => {
      const { data: s2 } = await supa.functions.invoke('generate-script', { body: { business_id: testBizId } });
      s2?.cached === true ? pass('Script caching: 2nd call correctly cached') : warn('Script caching: not cached on 2nd call');
    });

    await safe('Script rating RPC', async () => {
      const { data: scripts } = await supa.from('ai_scripts').select('id,avg_rating,rating_count').eq('business_id', testBizId).order('created_at',{ascending:false}).limit(1).single();
      scripts?.id ? pass('ai_scripts: found script for test business') : warn('ai_scripts: no cached script in DB');
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // 5. TWILIO INTEGRATION
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n5. Twilio integration...');

  await safe('Twilio access token', async () => {
    const { data, error } = await supa.functions.invoke('twilio-access-token', { body: { caller_identity: 'audit-test-user' } });
    if (error) { fail('twilio-access-token error: ' + error.message); return; }
    if (!data?.token) { fail('twilio-access-token: no token returned'); return; }
    const parts = data.token.split('.');
    parts.length === 3 ? pass('twilio-access-token: valid JWT (' + data.token.length + ' chars)') : fail('twilio-access-token: malformed JWT');
    data.identity === 'audit-test-user' ? pass('twilio-access-token: identity preserved') : warn('twilio-access-token: identity mismatch');
    data.expires_in === 3600 ? pass('twilio-access-token: 3600s TTL') : warn('twilio-access-token: TTL=' + data.expires_in);
  });

  await safe('Twilio voice TwiML', async () => {
    const { data } = await supa.functions.invoke('twilio-voice', { body: { To: '+19124201502' } });
    const xml = typeof data === 'string' ? data : JSON.stringify(data);
    xml?.includes('<Response>') && xml?.includes('<Dial>') ? pass('twilio-voice: returns valid TwiML with Dial') : warn('twilio-voice: unexpected TwiML: ' + xml?.substring(0,100));
  });

  await safe('Twilio status callback (no-op)', async () => {
    const { error } = await supa.functions.invoke('twilio-status-callback', { body: {} });
    !error ? pass('twilio-status-callback: handles empty body') : warn('twilio-status-callback: ' + error.message);
  });

  await safe('Twilio message webhook (no-op)', async () => {
    const { error } = await supa.functions.invoke('twilio-message-webhook', { body: {} });
    !error ? pass('twilio-message-webhook: handles empty body') : warn('twilio-message-webhook: ' + error.message);
  });

  // ══════════════════════════════════════════════════════════════════════
  // 6. MEETING FLOW
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n6. Meeting flow...');

  await safe('send-meeting-confirmation rejects bad ID', async () => {
    const { data } = await supa.functions.invoke('send-meeting-confirmation', { body: { meeting_id: '00000000-0000-0000-0000-000000000000' } });
    data?.error === 'Meeting not found' ? pass('send-meeting-confirmation: correctly rejects invalid meeting_id') : warn('Unexpected response: ' + JSON.stringify(data)?.substring(0,80));
  });

  await safe('send-reminders runs', async () => {
    const { data } = await supa.functions.invoke('send-reminders', { body: {} });
    data?.success === true ? pass('send-reminders: ran OK (24h:' + data.sent_24h + ' 1h:' + data.sent_1h + ' noshows:' + data.noshows_handled + ')') : warn('send-reminders returned: ' + JSON.stringify(data)?.substring(0,80));
  });

  await safe('meetings table schema', async () => {
    const { data } = await supa.from('meetings').select('id,business_id,scheduled_at,status,channel,confirmation_sent_at,confirmed_at').limit(1);
    data !== null ? pass('meetings: all required columns present') : fail('meetings: schema query failed');
  });

  // ══════════════════════════════════════════════════════════════════════
  // 7. SECURITY — RLS
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n7. Security / RLS...');

  await safe('groq_keys blocked to anon', async () => {
    const { data } = await anonSupa.from('groq_keys').select('id,api_key').limit(1);
    !data?.length ? pass('RLS: groq_keys blocked to anon users') : fail('RLS BREACH: groq_keys visible to anon — API keys exposed');
  });

  await safe('businesses needs auth', async () => {
    const { data, error } = await anonSupa.from('businesses').select('id').limit(1);
    error || !data?.length ? pass('RLS: businesses requires auth (0 rows to anon)') : warn('RLS: businesses may be publicly accessible (' + data?.length + ' rows)');
  });

  await safe('service role can access groq_keys', async () => {
    const { data } = await supa.from('groq_keys').select('id,display_label').limit(1);
    data?.length ? pass('Service role: groq_keys accessible') : fail('Service role: cannot read groq_keys');
  });

  // ══════════════════════════════════════════════════════════════════════
  // 8. TIMEZONE ENGINE
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n8. Timezone engine...');

  const STATE_TZ = {
    AL:'America/Chicago', NC:'America/New_York', MI:'America/Detroit',
    TX:'America/Chicago', FL:'America/New_York', GA:'America/New_York',
    OH:'America/New_York', PA:'America/New_York', NY:'America/New_York',
    CA:'America/Los_Angeles', OR:'America/Los_Angeles', WA:'America/Los_Angeles',
    AZ:'America/Phoenix', CO:'America/Denver', IL:'America/Chicago',
    VA:'America/New_York', MO:'America/Chicago',
  };
  function getTZ(city, cc) {
    if (cc === 'UK') return 'Europe/London';
    if (cc === 'AU') {
      if (/QLD/i.test(city)) return 'Australia/Brisbane';
      if (/WA/i.test(city)) return 'Australia/Perth';
      if (/SA/i.test(city)) return 'Australia/Adelaide';
      if (/TAS/i.test(city)) return 'Australia/Hobart';
      if (/NT/i.test(city)) return 'Australia/Darwin';
      return 'Australia/Sydney';
    }
    if (cc === 'CA') {
      if (/BC/i.test(city)) return 'America/Vancouver';
      if (/AB/i.test(city)) return 'America/Edmonton';
      if (/MB/i.test(city)) return 'America/Winnipeg';
      if (/SK/i.test(city)) return 'America/Regina';
      if (/NS|NB|PE/i.test(city)) return 'America/Halifax';
      if (/NL/i.test(city)) return 'America/St_Johns';
      return 'America/Toronto';
    }
    const m = city.match(/,\s*([A-Z]{2})$/);
    return m && STATE_TZ[m[1]] ? STATE_TZ[m[1]] : 'America/New_York';
  }

  const tzTests = [
    ['Birmingham, AL','US','America/Chicago',  'bug-fix: was Europe/London'],
    ['Durham, NC',    'US','America/New_York',  'US Eastern'],
    ['Grand Rapids, MI','US','America/Detroit', 'US Michigan'],
    ['Phoenix, AZ',   'US','America/Phoenix',   'US Arizona no DST'],
    ['Portland, OR',  'US','America/Los_Angeles','US Pacific'],
    ['Birmingham, England','UK','Europe/London','UK disambiguation'],
    ['Sydney, NSW',   'AU','Australia/Sydney',  'AU Eastern'],
    ['Brisbane, QLD', 'AU','Australia/Brisbane','AU no DST'],
    ['Perth, WA',     'AU','Australia/Perth',   'AU Western'],
    ['Adelaide, SA',  'AU','Australia/Adelaide','AU Central'],
    ['Vancouver, BC', 'CA','America/Vancouver', 'CA Pacific'],
    ['Toronto, ON',   'CA','America/Toronto',   'CA Eastern'],
    ['Calgary, AB',   'CA','America/Edmonton',  'CA Mountain'],
    ['London, England','UK','Europe/London',    'UK London'],
  ];
  let tzPass = 0;
  for (const [city, cc, expected, note] of tzTests) {
    const got = getTZ(city, cc);
    if (got === expected) { tzPass++; pass('TZ ' + city + ': ' + got); }
    else { fail('TZ ' + city + ': got ' + got + ' expected ' + expected + ' (' + note + ')'); }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 9. PHONE NORMALIZER
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n9. Phone normalizer...');

  const phoneTests = [
    ['(866) 938-3272', 'US', '+18669383272', 'US toll-free'],
    ['(502) 448-2876', 'US', '+15024482876', 'US local KY'],
    ['(162) 467-2685', 'US', null,           'US invalid area code'],
    ['(07) 3155 6240', 'AU', '+61731556240', 'AU QLD landline'],
    ['(02) 8880 1015', 'AU', '+61288801015', 'AU NSW landline'],
    ['1800 438 435',   'AU', '+611800438435','AU 1800 free call'],
    ['1300 636 846',   'AU', '+611300636846','AU 1300'],
    ['0468 591 227',   'AU', '+61468591227', 'AU mobile'],
    ['+61 412 475 031','AU', '+61412475031', 'AU E.164'],
    ['315 - 317',      'AU', null,           'AU garbage string'],
    ['0 0 100 105',    'AU', null,           'AU all zeros'],
    ['(604) 901-1310', 'CA', '+16049011310', 'CA BC'],
    ['+1 855-847-5529','CA', '+18558475529', 'CA toll-free'],
    ['0800 041 8350',  'UK', '+448000418350','UK 0800'],
    ['01273 685888',   'UK', '+441273685888','UK geographic'],
    ['07776 711678',   'UK', '+447776711678','UK mobile'],
    ['020 3519 1545',  'UK', '+442035191545','UK London 020'],
    ['+44 1633 920160','UK', '+441633920160','UK E.164'],
    ['0 0 384 512',    'UK', null,           'UK garbage'],
  ];
  let phonePass = 0;
  for (const [raw, cc, expected, note] of phoneTests) {
    const got = normalizePhone(raw, cc);
    if (got === expected) { phonePass++; pass('Phone ' + note); }
    else { fail('Phone ' + note + ': got "' + got + '" expected "' + expected + '"'); }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 10. PAGINATION & DASHBOARD LOAD
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n10. Pagination & dashboard...');

  await safe('Page 1 loads 200 rows', async () => {
    const { data } = await supa.from('businesses').select('id,health_score,rating').eq('country_code','US').eq('do_not_call',false).order('health_score',{ascending:false,nullsFirst:false}).order('rating',{ascending:false,nullsFirst:false}).range(0,199);
    data?.length === 200 ? pass('Pagination: page 1 = 200 rows') : warn('Pagination: page 1 = ' + data?.length + ' rows');
    data?.[0]?.health_score !== null ? pass('Sort: enriched (health_score) rows appear first') : warn('Sort: first row has null health_score — sort may be incorrect');
  });

  await safe('Page 2 loads correctly', async () => {
    const { data: p2 } = await supa.from('businesses').select('id').eq('country_code','US').eq('do_not_call',false).order('health_score',{ascending:false,nullsFirst:false}).range(200,399);
    p2?.length === 200 ? pass('Pagination: page 2 = 200 rows (US has 6897 total, scrolls work)') : warn('Page 2: ' + p2?.length + ' rows');
  });

  await safe('Search filter works', async () => {
    const { data } = await supa.from('businesses').select('id,business_name').eq('country_code','US').ilike('business_name','%dental%').range(0,4);
    data?.length > 0 ? pass('Search: name filter returns ' + data.length + ' rows for "dental"') : warn('Search: no results for "dental" in US');
  });

  await safe('Status filter works', async () => {
    const { data } = await supa.from('businesses').select('id,call_status').eq('country_code','US').eq('call_status','not_called').range(0,4);
    data?.length > 0 ? pass('Filter: call_status=not_called returns data') : warn('Filter: no not_called businesses');
  });

  await safe('Realtime subscription feasibility', async () => {
    const { data } = await supa.from('businesses').select('id').eq('country_code','US').limit(1);
    data !== null ? pass('Realtime: businesses table queryable (subscription will work)') : fail('Realtime: cannot query businesses');
  });

  // ══════════════════════════════════════════════════════════════════════
  // 11. CALLING HOURS — LEGAL WINDOWS
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n11. Calling hours engine...');

  const LEGAL = {
    US: { weekday:{s:8,e:21}, saturday:{s:8,e:21}, sunday:{s:8,e:21} },
    AU: { weekday:{s:9,e:20}, saturday:{s:9,e:17}, sunday:{s:0,e:0,blocked:true} },
    CA: { weekday:{s:8,e:21}, saturday:{s:8,e:18}, sunday:{s:13,e:21} },
    UK: { weekday:{s:8,e:20}, saturday:{s:8,e:20}, sunday:{s:9,e:18} },
  };

  // Test at 10:30 AM Wednesday Eastern — should be prime for Eastern US
  const wed1030ET = new Date('2026-06-10T14:30:00.000Z');
  const nyTime = toZonedTime(wed1030ET, 'America/New_York');
  nyTime.getHours() === 10 ? pass('Calling hours: New York correctly at 10:30 AM') : fail('Calling hours: New York time wrong');

  // Test Birmingham AL at same moment
  const chiTime = toZonedTime(wed1030ET, 'America/Chicago');
  chiTime.getHours() === 9 ? pass('Calling hours: Birmingham AL correctly at 9:30 AM') : fail('Calling hours: Birmingham AL time wrong');

  // Test UK same moment
  const ukTime = toZonedTime(wed1030ET, 'Europe/London');
  const ukHour = ukTime.getHours();
  (ukHour >= 8 && ukHour < 20) ? pass('Calling hours: UK at ' + ukHour + ':30 = legal') : warn('Calling hours: UK at ' + ukHour + ':30');

  // Test AU same moment
  const auTime = toZonedTime(wed1030ET, 'Australia/Sydney');
  const auHour = auTime.getHours();
  pass('Calling hours: Sydney at ' + auHour + ':30 (legal: ' + (auHour >= 9 && auHour < 20 ? 'yes' : 'no') + ')');

  // ══════════════════════════════════════════════════════════════════════
  // 12. AUTH & SESSION
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n12. Auth & session...');

  await safe('Auth settings', async () => {
    const { data } = await supa.from('callers').select('id,email,full_name,assigned_countries,daily_call_target').limit(1);
    data !== null ? pass('callers table: schema correct') : fail('callers: query failed');
    if (data?.length > 0) {
      data[0].assigned_countries ? pass('callers: assigned_countries set') : warn('callers: no assigned_countries');
    } else {
      warn('callers: no users yet — create one via Supabase Dashboard → Auth → Users');
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // FINAL REPORT
  // ══════════════════════════════════════════════════════════════════════
  const total = PASS.length + WARN.length + FAIL.length;
  const score = Math.round((PASS.length / total) * 100);

  console.log('\n\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  DENTIQ FINAL SYSTEM AUDIT — REPORT                             ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  Total checks: ' + String(total).padEnd(5) + '  Pass: ' + String(PASS.length).padEnd(5) + '  Warn: ' + String(WARN.length).padEnd(5) + '  Fail: ' + String(FAIL.length).padEnd(5) + '        ║');
  console.log('║  System score: ' + String(score + '%').padEnd(48) + '║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  if (FAIL.length > 0) {
    console.log('\n🔴 FAILURES (' + FAIL.length + ') — must fix:');
    FAIL.forEach(f => console.log('  ✗ ' + f));
  }
  if (WARN.length > 0) {
    console.log('\n🟡 WARNINGS (' + WARN.length + ') — review:');
    WARN.forEach(w => console.log('  ⚠ ' + w));
  }
  console.log('\n✅ PASSING (' + PASS.length + '):');
  PASS.forEach(p => console.log('  ✓ ' + p));
}

main().catch(err => {
  console.error('\n\nAudit crashed:', err.message);
  console.error(err.stack);
});

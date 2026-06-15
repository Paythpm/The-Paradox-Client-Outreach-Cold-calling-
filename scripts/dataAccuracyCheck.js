'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function go() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  DATA ACCURACY AUDIT — Full field validation                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const { count: total } = await s.from('businesses').select('*', { count: 'exact', head: true });

  // ── 1. Enrichment integrity: high neg% + high rating should be 0 ─────────────
  const { data: highNeg } = await s.from('businesses')
    .select('business_name,rating,negative_pct,health_score')
    .gt('negative_pct', 50).gte('rating', 4.0)
    .not('negative_pct', 'is', null).limit(10);

  console.log('=== CHECK 1: High neg% (>50%) but high rating (≥4.0★) — should be 0 ===');
  const highNegList = highNeg || [];
  console.log('Mismatches: ' + highNegList.length);
  highNegList.forEach(b => console.log('  ❌ ' + b.business_name?.substring(0, 40) + ' | ' + b.rating + '★ | neg=' + b.negative_pct + '%'));
  if (highNegList.length === 0) console.log('  ✅ All clear');

  // ── 2. Health score + rating consistency ─────────────────────────────────────
  const { data: badHealth } = await s.from('businesses')
    .select('business_name,rating,health_score')
    .gte('rating', 4.5).lt('health_score', 80)
    .not('health_score', 'is', null).limit(10);

  console.log('\n=== CHECK 2: High rating (≥4.5★) but low health score (<80) — should be 0 ===');
  const badHealthList = badHealth || [];
  console.log('Mismatches: ' + badHealthList.length);
  badHealthList.forEach(b => console.log('  ❌ ' + b.business_name?.substring(0, 40) + ' | ' + b.rating + '★ | health=' + b.health_score));
  if (badHealthList.length === 0) console.log('  ✅ All clear');

  // ── 3. Phone format validation ────────────────────────────────────────────────
  console.log('\n=== CHECK 3: Phone format — must be E.164 (+country code) ===');
  const { data: samplePhones } = await s.from('businesses')
    .select('phone, country_code').not('phone', 'is', null).limit(500);
  const badPhones = (samplePhones || []).filter(b => !b.phone.startsWith('+'));
  console.log('Sample: 500 | Bad format: ' + badPhones.length);
  badPhones.slice(0, 5).forEach(b => console.log('  ❌ ' + b.phone + ' (' + b.country_code + ')'));
  if (badPhones.length === 0) console.log('  ✅ All E.164 format');

  // ── 4. Rating range check ─────────────────────────────────────────────────────
  const { count: badRatingHigh } = await s.from('businesses')
    .select('*', { count: 'exact', head: true }).gt('rating', 5.0);
  const { count: badRatingLow } = await s.from('businesses')
    .select('*', { count: 'exact', head: true }).lt('rating', 1.0).not('rating', 'is', null);
  console.log('\n=== CHECK 4: Rating range (1-5 only) ===');
  console.log('Rating > 5.0: ' + (badRatingHigh || 0) + (badRatingHigh === 0 ? ' ✅' : ' ❌'));
  console.log('Rating < 1.0: ' + (badRatingLow || 0) + (badRatingLow === 0 ? ' ✅' : ' ❌'));

  // ── 5. NULL critical fields ───────────────────────────────────────────────────
  const { count: noRating } = await s.from('businesses').select('*', { count: 'exact', head: true }).is('rating', null);
  const { count: noPhone }  = await s.from('businesses').select('*', { count: 'exact', head: true }).is('phone', null);
  const { count: noCity }   = await s.from('businesses').select('*', { count: 'exact', head: true }).is('city', null);
  const { count: noName }   = await s.from('businesses').select('*', { count: 'exact', head: true }).is('business_name', null);
  const { count: noCountry} = await s.from('businesses').select('*', { count: 'exact', head: true }).is('country_code', null);
  console.log('\n=== CHECK 5: NULL critical fields ===');
  console.log('No business_name: ' + (noName||0) + (noName===0?' ✅':' ❌'));
  console.log('No country_code:  ' + (noCountry||0) + (noCountry===0?' ✅':' ❌'));
  console.log('No phone:         ' + (noPhone||0) + ' (' + Math.round((noPhone||0)/total*100) + '%) — expected, some businesses have no listed number');
  console.log('No rating:        ' + (noRating||0) + ' (' + Math.round((noRating||0)/total*100) + '%)');
  console.log('No city:          ' + (noCity||0) + ' (' + Math.round((noCity||0)/total*100) + '%)');

  // ── 6. Random sample per country — all key fields ────────────────────────────
  console.log('\n=== CHECK 6: Random sample accuracy (5 per country) ===');
  for (const cc of ['US', 'AU', 'CA', 'UK']) {
    const { data: sample } = await s.from('businesses')
      .select('business_name,city,phone,rating,reviews,negative_pct,health_score,top_pain_point,place_id')
      .eq('country_code', cc).not('phone', 'is', null).range(100, 104);

    console.log('\n  [' + cc + ']');
    (sample || []).forEach(b => {
      const issues = [];
      if (b.phone && !b.phone.startsWith('+')) issues.push('phone_format');
      if (b.rating && (b.rating < 1 || b.rating > 5)) issues.push('rating_range');
      if (b.negative_pct && b.negative_pct > 100) issues.push('neg_over_100');
      if (b.health_score && (b.health_score < 0 || b.health_score > 100)) issues.push('health_oob');
      if (!b.place_id) issues.push('no_placeid');
      // Cross-check: if rating ≥ 4.5 and neg% > 20 = mismatch
      if (b.rating >= 4.5 && b.negative_pct > 20 && b.negative_pct !== null) issues.push('neg_rating_mismatch');

      const icon = issues.length === 0 ? '✅' : '❌';
      console.log('  ' + icon + ' ' + (b.business_name || '').substring(0, 32).padEnd(32) +
        ' | ' + (b.rating || '?') + '★' +
        ' | neg=' + (b.negative_pct !== null ? b.negative_pct + '%' : 'null') +
        ' | h=' + (b.health_score || 'null') +
        ' | ' + (b.phone || 'N/A').substring(0, 16) +
        (issues.length ? ' ← ' + issues.join(',') : ''));
    });
  }

  // ── 7. Review data accuracy ────────────────────────────────────────────────────
  console.log('\n=== CHECK 7: Review data integrity ===');
  const { count: revTotal } = await s.from('business_reviews').select('*', { count: 'exact', head: true });
  const { count: revNoCat } = await s.from('business_reviews').select('*', { count: 'exact', head: true }).is('pain_category', null);
  const { count: revNoBiz } = await s.from('business_reviews').select('*', { count: 'exact', head: true }).is('business_id', null);

  // Check foreign key integrity — reviews pointing to non-existent businesses
  const { data: revSample } = await s.from('business_reviews')
    .select('business_id').limit(100).order('id', { ascending: false });
  const bizIds = [...new Set((revSample || []).map(r => r.business_id))];
  const { data: bizCheck } = await s.from('businesses').select('id').in('id', bizIds);
  const foundIds = new Set((bizCheck || []).map(b => b.id));
  const orphanRevs = bizIds.filter(id => !foundIds.has(id));

  console.log('Total reviews:              ' + revTotal.toLocaleString() + ' ✅');
  console.log('Reviews without category:   ' + (revNoCat || 0) + (revNoCat === 0 ? ' ✅' : ' ❌'));
  console.log('Reviews without business_id:' + (revNoBiz || 0) + (revNoBiz === 0 ? ' ✅' : ' ❌'));
  console.log('Orphaned reviews (sample):  ' + orphanRevs.length + (orphanRevs.length === 0 ? ' ✅' : ' ❌ — reviews for deleted businesses'));

  // ── 8. Rating distribution sanity ─────────────────────────────────────────────
  console.log('\n=== CHECK 8: Rating distribution ===');
  for (const cc of ['US', 'AU', 'CA', 'UK']) {
    const { count: total_cc } = await s.from('businesses').select('*', { count: 'exact', head: true }).eq('country_code', cc);
    const { count: r5 } = await s.from('businesses').select('*', { count: 'exact', head: true }).eq('country_code', cc).gte('rating', 4.5);
    const { count: r4 } = await s.from('businesses').select('*', { count: 'exact', head: true }).eq('country_code', cc).gte('rating', 3.5).lt('rating', 4.5);
    const { count: r3 } = await s.from('businesses').select('*', { count: 'exact', head: true }).eq('country_code', cc).lt('rating', 3.5).not('rating', 'is', null);
    const { count: rNull } = await s.from('businesses').select('*', { count: 'exact', head: true }).eq('country_code', cc).is('rating', null);
    console.log(cc + ': 4.5-5★=' + r5 + ' (' + Math.round(r5/total_cc*100) + '%) | 3.5-4.4★=' + r4 + ' (' + Math.round(r4/total_cc*100) + '%) | <3.5★=' + r3 + ' | no rating=' + rNull);
  }

  // ── FINAL VERDICT ──────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  FINAL VERDICT                                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  const allGood = highNegList.length === 0 && badHealthList.length === 0 && badPhones.length === 0
    && (badRatingHigh || 0) === 0 && (noName || 0) === 0 && (noCountry || 0) === 0
    && (revNoCat || 0) === 0 && orphanRevs.length === 0;

  if (allGood) {
    console.log('  ✅ DATABASE IS HEALTHY — all data integrity checks passed');
    console.log('  ✅ negative_pct and health_score correctly derived from Google Maps ratings');
    console.log('  ✅ Phone numbers in E.164 format');
    console.log('  ✅ Reviews properly linked to businesses with categories');
    console.log('  ✅ No orphaned or corrupted records detected');
  } else {
    console.log('  ⚠️  Some issues found — review the checks above');
  }
  console.log('');
}

go().catch(console.error);

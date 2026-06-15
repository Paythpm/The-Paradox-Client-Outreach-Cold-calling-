/**
 * fullAnalysis.js — Complete deep-down DB health check
 * Covers: businesses, reviews, enrichment, coverage gaps, sample data quality
 */
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  FULL DATABASE ANALYSIS — DentIQ Platform                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── 1. BUSINESS COUNTS ───────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('  1. BUSINESS DATABASE');
  console.log('═══════════════════════════════════════════════');

  const { count: totalBiz } = await supa.from('businesses').select('*',{count:'exact',head:true});
  const { count: withPhone } = await supa.from('businesses').select('*',{count:'exact',head:true}).not('phone','is',null);
  const { count: withPlaceId } = await supa.from('businesses').select('*',{count:'exact',head:true}).not('place_id','is',null);
  const { count: withEnrich } = await supa.from('businesses').select('*',{count:'exact',head:true}).not('top_pain_point','is',null);
  const { count: withTimezone } = await supa.from('businesses').select('*',{count:'exact',head:true}).not('timezone','is',null);
  const { count: dncCount } = await supa.from('businesses').select('*',{count:'exact',head:true}).eq('do_not_call',true);

  console.log('Total businesses:         ' + totalBiz.toLocaleString());
  console.log('With phone number:        ' + withPhone.toLocaleString() + '  (' + (withPhone/totalBiz*100).toFixed(1) + '%) ← callable');
  console.log('With PlaceID:             ' + withPlaceId.toLocaleString() + '  (' + (withPlaceId/totalBiz*100).toFixed(1) + '%)');
  console.log('With AI enrichment:       ' + withEnrich.toLocaleString() + '  (' + (withEnrich/totalBiz*100).toFixed(1) + '%)');
  console.log('With timezone:            ' + withTimezone.toLocaleString() + '  (' + (withTimezone/totalBiz*100).toFixed(1) + '%)');
  console.log('Do-not-call flagged:      ' + dncCount.toLocaleString());

  console.log('\n  By Country:');
  console.log('  CC  | Total    | Phone    | Phone%  | PlaceID  | Enriched | Enrich%');
  console.log('  ----|----------|----------|---------|----------|----------|--------');
  for (const cc of ['US','AU','CA','UK']) {
    const { count: tot }  = await supa.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc);
    const { count: ph }   = await supa.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc).not('phone','is',null);
    const { count: pid }  = await supa.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc).not('place_id','is',null);
    const { count: enr }  = await supa.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc).not('top_pain_point','is',null);
    console.log('  ' + cc.padEnd(4) + '| ' + tot.toLocaleString().padEnd(8) + ' | ' + ph.toLocaleString().padEnd(8) + ' | ' + (ph/tot*100).toFixed(1).padEnd(7) + '% | ' + pid.toLocaleString().padEnd(8) + ' | ' + enr.toLocaleString().padEnd(8) + ' | ' + (enr/tot*100).toFixed(1) + '%');
  }

  // ── 2. CALL STATUS BREAKDOWN ─────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('  2. CALL STATUS BREAKDOWN');
  console.log('═══════════════════════════════════════════════');

  const statuses = ['not_called','calling','no_answer','callback_requested','interested','meeting_booked','not_interested','wrong_number','do_not_call'];
  for (const st of statuses) {
    const { count: c } = await supa.from('businesses').select('*',{count:'exact',head:true}).eq('call_status',st);
    if (c > 0) {
      console.log('  ' + st.padEnd(22) + ': ' + c.toLocaleString() + '  (' + (c/totalBiz*100).toFixed(2) + '%)');
    }
  }

  // ── 3. REVIEW DATABASE ───────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('  3. REVIEW DATABASE');
  console.log('═══════════════════════════════════════════════');

  const { count: totalRev } = await supa.from('business_reviews').select('*',{count:'exact',head:true});
  const { count: withCat }  = await supa.from('business_reviews').select('*',{count:'exact',head:true}).not('pain_category','is',null);
  const { count: noCat }    = await supa.from('business_reviews').select('*',{count:'exact',head:true}).is('pain_category',null);

  console.log('Total review quotes:      ' + totalRev.toLocaleString());
  console.log('With pain category:       ' + withCat.toLocaleString() + '  (' + (withCat/totalRev*100).toFixed(1) + '%)');
  console.log('Without category:         ' + noCat.toLocaleString());

  console.log('\n  Reviews by Country (via business join):');
  for (const cc of ['US','AU','CA','UK']) {
    const { count: rc } = await supa.from('business_reviews')
      .select('*, businesses!inner(country_code)',{count:'exact',head:true})
      .eq('businesses.country_code', cc);
    const { count: bc } = await supa.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc);
    // Businesses WITH at least 1 review
    const { data: bizWithRev } = await supa.from('business_reviews')
      .select('business_id')
      .limit(200000);
    const bizSet = new Set((bizWithRev||[]).map(r=>r.business_id));
    const { data: ccBiz } = await supa.from('businesses').select('id').eq('country_code',cc).limit(50000);
    const ccWithRev = (ccBiz||[]).filter(b => bizSet.has(b.id)).length;
    console.log('  ' + cc + ': ' + (rc||0).toLocaleString().padEnd(8) + ' reviews | ' + ccWithRev.toLocaleString() + '/' + bc + ' businesses have reviews (' + (ccWithRev/bc*100).toFixed(1) + '%)');
  }

  // Category breakdown
  console.log('\n  Pain Category Breakdown:');
  const { data: allCats } = await supa.from('business_reviews')
    .select('pain_category')
    .not('pain_category','is',null)
    .limit(300000);
  const cats = {};
  (allCats||[]).forEach(r => { cats[r.pain_category] = (cats[r.pain_category]||0)+1; });
  const sortedCats = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  sortedCats.forEach(([cat,n]) => {
    const pct = (n/totalRev*100).toFixed(1);
    console.log('  ' + cat.padEnd(34) + n.toLocaleString().padEnd(8) + '  (' + pct + '%)');
  });

  // Rating distribution
  console.log('\n  Rating distribution of imported reviews:');
  const { data: ratings } = await supa.from('business_reviews').select('rating').limit(300000);
  const rDist = { '1':0, '2':0, '3':0, 'null':0 };
  (ratings||[]).forEach(r => {
    if (r.rating === null) rDist['null']++;
    else if (r.rating <= 1.5) rDist['1']++;
    else if (r.rating <= 2.5) rDist['2']++;
    else rDist['3']++;
  });
  console.log('  1 star:  ' + rDist['1'].toLocaleString());
  console.log('  2 stars: ' + rDist['2'].toLocaleString());
  console.log('  3 stars: ' + rDist['3'].toLocaleString());
  console.log('  No rating: ' + rDist['null'].toLocaleString());

  // ── 4. COVERAGE ANALYSIS ─────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('  4. REVIEW COVERAGE ANALYSIS');
  console.log('═══════════════════════════════════════════════');

  const { data: bizWithRev2 } = await supa.from('business_reviews').select('business_id').limit(300000);
  const coveredBizIds = new Set((bizWithRev2||[]).map(r=>r.business_id));
  const coveredCount = coveredBizIds.size;
  const notCovered = totalBiz - coveredCount;
  console.log('Businesses WITH reviews:  ' + coveredCount.toLocaleString() + '  (' + (coveredCount/totalBiz*100).toFixed(1) + '%)');
  console.log('Businesses WITHOUT reviews:' + notCovered.toLocaleString() + '  (' + (notCovered/totalBiz*100).toFixed(1) + '%) ← no review data yet');

  // Reviews per business distribution
  const { data: revPerBiz } = await supa.rpc ? null : null;
  // Manual: count reviews per business using groups
  const revCounts = {};
  (bizWithRev2||[]).forEach(r => { revCounts[r.business_id] = (revCounts[r.business_id]||0)+1; });
  const dist = { '1':0, '2-5':0, '6-10':0, '11-20':0, '21+':0 };
  Object.values(revCounts).forEach(n => {
    if (n === 1) dist['1']++;
    else if (n <= 5) dist['2-5']++;
    else if (n <= 10) dist['6-10']++;
    else if (n <= 20) dist['11-20']++;
    else dist['21+']++;
  });
  console.log('\n  Reviews per business distribution:');
  Object.entries(dist).forEach(([k,v]) => console.log('  ' + k.padEnd(8) + ' reviews: ' + v.toLocaleString() + ' businesses'));
  const avgRev = totalRev / coveredCount;
  console.log('\n  Avg reviews per business (covered): ' + avgRev.toFixed(1));

  // ── 5. SAMPLE DATA QUALITY CHECK ─────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('  5. SAMPLE DATA QUALITY — RANDOM SPOT CHECKS');
  console.log('═══════════════════════════════════════════════');

  // Pick 3 businesses from each country and show their reviews
  for (const cc of ['US','AU','CA','UK']) {
    console.log('\n  [' + cc + '] Sample business with reviews:');
    const { data: sampleBiz } = await supa.from('businesses')
      .select('id,business_name,city,rating,phone,place_id,top_pain_point')
      .eq('country_code', cc)
      .not('place_id','is',null)
      .in('id', Array.from(coveredBizIds).slice(0, 1000)) // filter to only ones with reviews
      .limit(3);

    for (const biz of (sampleBiz||[]).slice(0,2)) {
      if (!coveredBizIds.has(biz.id)) continue;
      console.log('    Business: ' + biz.business_name + ' | ' + biz.city + ' | ' + biz.rating + '★ | Phone: ' + (biz.phone||'N/A'));
      console.log('    Top pain: ' + (biz.top_pain_point||'[not enriched]'));
      const { data: revs } = await supa.from('business_reviews')
        .select('pain_category,rating,review_text,review_date')
        .eq('business_id', biz.id)
        .limit(4);
      for (const r of (revs||[])) {
        console.log('    → [' + (r.pain_category||'?') + '] ' + (r.rating||'?') + '★ — "' + (r.review_text||'').substring(0,100) + '..."');
      }
      console.log('');
    }
  }

  // ── 6. ENRICHMENT QUEUE ──────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('  6. ENRICHMENT STATUS (AI pain analysis)');
  console.log('═══════════════════════════════════════════════');

  const { count: needsEnrich } = await supa.from('businesses')
    .select('*',{count:'exact',head:true})
    .is('top_pain_point',null)
    .not('phone','is',null);
  const { count: enriched } = await supa.from('businesses')
    .select('*',{count:'exact',head:true})
    .not('top_pain_point','is',null);

  console.log('Enriched (have AI analysis):  ' + enriched.toLocaleString() + '  (' + (enriched/totalBiz*100).toFixed(1) + '%)');
  console.log('Need enrichment (have phone): ' + needsEnrich.toLocaleString() + '  (' + (needsEnrich/totalBiz*100).toFixed(1) + '%)');
  console.log('');
  console.log('  NOTE: Enrichment uses Groq API (pain point analysis from reviews).');
  console.log('  The ' + needsEnrich.toLocaleString() + ' unenriched businesses can be processed via node scripts/enrichFast.js');

  // ── 7. CALL LOGS ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('  7. CALL LOG HISTORY');
  console.log('═══════════════════════════════════════════════');

  const { count: totalCalls } = await supa.from('call_logs').select('*',{count:'exact',head:true});
  const { count: totalMeetings } = await supa.from('meetings').select('*',{count:'exact',head:true});
  console.log('Total call logs:    ' + (totalCalls||0).toLocaleString());
  console.log('Total meetings:     ' + (totalMeetings||0).toLocaleString());

  // ── 8. FINAL SUMMARY ─────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  SUMMARY                                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('  ✅ Businesses:  ' + totalBiz.toLocaleString() + ' total | ' + withPhone.toLocaleString() + ' callable (' + (withPhone/totalBiz*100).toFixed(1) + '%)');
  console.log('  ✅ Reviews:     ' + totalRev.toLocaleString() + ' total | covering ' + coveredCount.toLocaleString() + ' businesses (' + (coveredCount/totalBiz*100).toFixed(1) + '%)');
  console.log('  ✅ PlaceIDs:    ' + withPlaceId.toLocaleString() + '/' + totalBiz.toLocaleString() + ' (' + (withPlaceId/totalBiz*100).toFixed(1) + '%) — review join key');
  console.log('  ⚠  Enrichment: ' + enriched.toLocaleString() + '/' + totalBiz.toLocaleString() + ' (' + (enriched/totalBiz*100).toFixed(1) + '%) — needs more Groq processing');
  console.log('  ⚠  Coverage:   ' + notCovered.toLocaleString() + ' businesses have zero reviews — they exist in DB but not in any CSV review file');
  console.log('');
  console.log('  NEXT STEPS:');
  console.log('  1. Run enrichFast.js to AI-analyze the ' + needsEnrich.toLocaleString() + ' unenriched businesses');
  console.log('  2. The ' + notCovered.toLocaleString() + ' businesses with no reviews = their PlaceIDs weren\'t in any CSV');
  console.log('     → These are real businesses, just less complained-about online');
  console.log('     → They still have phone numbers and are fully callable');
  console.log('');
}

main().catch(console.error);

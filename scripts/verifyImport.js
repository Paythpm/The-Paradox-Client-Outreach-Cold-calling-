'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function go() {
  console.log('\n=== FINAL DATABASE VERIFICATION ===\n');

  const { count: totalRev } = await s.from('business_reviews').select('*', { count: 'exact', head: true });
  const { count: totalBiz } = await s.from('businesses').select('*', { count: 'exact', head: true });

  // Load ALL distinct business_ids from reviews (no early break)
  let from = 0;
  const allBizIds = new Set();
  while (true) {
    const { data } = await s.from('business_reviews').select('business_id').range(from, from + 999);
    if (!data || data.length === 0) break;
    data.forEach(r => allBizIds.add(r.business_id));
    from += 1000;
  }

  console.log('Total reviews in DB:         ' + totalRev.toLocaleString());
  console.log('Total businesses in DB:      ' + totalBiz.toLocaleString());
  console.log('Businesses WITH reviews:     ' + allBizIds.size.toLocaleString() + '  (' + ((allBizIds.size / totalBiz) * 100).toFixed(1) + '%)');
  console.log('Businesses WITHOUT reviews:  ' + (totalBiz - allBizIds.size).toLocaleString() + '  (' + (((totalBiz - allBizIds.size) / totalBiz) * 100).toFixed(1) + '%)');
  console.log('Avg reviews/covered biz:     ' + (totalRev / allBizIds.size).toFixed(1));

  console.log('\n  Country Breakdown:');
  console.log('  CC  | Businesses | Reviews   | Coverage');
  console.log('  ----|------------|-----------|--------');
  for (const cc of ['US', 'AU', 'CA', 'UK']) {
    const { count: b } = await s.from('businesses').select('*', { count: 'exact', head: true }).eq('country_code', cc);
    const { count: r } = await s.from('business_reviews')
      .select('*, businesses!inner(country_code)', { count: 'exact', head: true })
      .eq('businesses.country_code', cc);
    console.log('  ' + cc.padEnd(4) + '| ' + (b || 0).toLocaleString().padEnd(10) + ' | ' + (r || 0).toLocaleString().padEnd(9) + ' | ' + (r && b ? ((r / b)).toFixed(1) : '0') + ' reviews/biz');
  }

  // Pain category breakdown
  console.log('\n  Pain Category Breakdown:');
  const { data: catData } = await s.from('business_reviews')
    .select('pain_category')
    .not('pain_category', 'is', null)
    .limit(500000);
  const cats = {};
  (catData || []).forEach(r => { cats[r.pain_category] = (cats[r.pain_category] || 0) + 1; });
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
    console.log('  ' + cat.padEnd(32) + n.toLocaleString() + '  (' + ((n / totalRev) * 100).toFixed(1) + '%)');
  });

  // Rating distribution
  console.log('\n  Rating Distribution:');
  const { data: rData } = await s.from('business_reviews').select('rating').limit(300000);
  const rd = { '1': 0, '2': 0, '3': 0, 'null': 0 };
  (rData || []).forEach(r => {
    if (r.rating === null) rd['null']++;
    else if (r.rating <= 1.5) rd['1']++;
    else if (r.rating <= 2.5) rd['2']++;
    else rd['3']++;
  });
  Object.entries(rd).forEach(([k, v]) => console.log('  ' + k + ' star: ' + v.toLocaleString()));

  // Spot check — 3 businesses from each country with real review text
  console.log('\n=== SPOT CHECK — Real review samples ===');
  for (const cc of ['US', 'AU', 'CA', 'UK']) {
    console.log('\n  [' + cc + ']');
    const { data: bizList } = await s.from('businesses')
      .select('id,business_name,city,rating,phone')
      .eq('country_code', cc)
      .not('place_id', 'is', null)
      .range(100, 101);
    for (const biz of (bizList || [])) {
      if (!allBizIds.has(biz.id)) continue;
      const { data: revs } = await s.from('business_reviews')
        .select('pain_category,rating,review_text')
        .eq('business_id', biz.id)
        .limit(2);
      if (!revs || revs.length === 0) continue;
      console.log('  Biz: ' + biz.business_name + ' | ' + biz.city + ' | ' + biz.rating + 'star | ' + (biz.phone || 'no phone'));
      revs.forEach(r => {
        const text = (r.review_text || '').substring(0, 100);
        console.log('    [' + (r.pain_category || 'none') + '] ' + (r.rating || '?') + 'star: ' + text);
      });
    }
  }

  console.log('\n=== VERIFICATION COMPLETE ===\n');
}

go().catch(console.error);

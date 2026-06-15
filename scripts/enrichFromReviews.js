/**
 * enrichFromReviews.js — Compute enrichment directly from business_reviews table
 *
 * KEY FIX: negative_pct and health_score are derived from the business's ACTUAL
 * Google Maps overall rating — NOT from our review sample. We only import
 * negative/mediocre reviews, so a sample-based calculation always gives 100%
 * negative which is wrong and misleading for callers.
 *
 * Rating → negative_pct mapping:
 *   5.0★ → 2%   4.8★ → 4%   4.5★ → 8%   4.2★ → 12%  4.0★ → 15%
 *   3.7★ → 20%  3.5★ → 25%  3.2★ → 32%  3.0★ → 40%  2.5★ → 55%
 *   2.0★ → 70%  1.5★ → 82%  1.0★ → 95%
 *
 * Run: node scripts/enrichFromReviews.js
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 300;

function ratingToNegPct(rating) {
  if (!rating || rating <= 0) return 30;
  if (rating >= 5.0) return 2;
  if (rating >= 4.8) return 4;
  if (rating >= 4.5) return 8;
  if (rating >= 4.2) return 12;
  if (rating >= 4.0) return 15;
  if (rating >= 3.7) return 20;
  if (rating >= 3.5) return 25;
  if (rating >= 3.2) return 32;
  if (rating >= 3.0) return 40;
  if (rating >= 2.5) return 55;
  if (rating >= 2.0) return 70;
  if (rating >= 1.5) return 82;
  return 95;
}

async function loadAllWithCursor(table, cols, filterFn) {
  const results = new Map();
  let lastId = '00000000-0000-0000-0000-000000000000';
  while (true) {
    let q = supabase.from(table).select(cols).gt('id', lastId).order('id', { ascending: true }).limit(1000);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    data.forEach(r => results.set(r.id, r));
    lastId = data[data.length - 1].id;
    if (data.length < 1000) break;
  }
  return results;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Enrich from Reviews v2 — Uses actual Google rating          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Load ALL business ratings ────────────────────────────────────────
  console.log('Step 1: Loading all business ratings from DB...');
  const bizRatings = await loadAllWithCursor('businesses', 'id,rating');
  console.log('  ✓ ' + bizRatings.size.toLocaleString() + ' businesses loaded\n');

  // ── Step 2: Load ALL reviews ──────────────────────────────────────────────────
  console.log('Step 2: Loading all reviews from DB...');
  const bizReviews = new Map(); // business_id → { cats: {}, ratings: [] }
  let lastId = '00000000-0000-0000-0000-000000000000';
  let totalLoaded = 0;

  while (true) {
    const { data, error } = await supabase
      .from('business_reviews')
      .select('id,business_id,pain_category,rating')
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(1000);

    if (error || !data || data.length === 0) break;

    for (const r of data) {
      if (!bizReviews.has(r.business_id)) {
        bizReviews.set(r.business_id, { cats: {} });
      }
      const entry = bizReviews.get(r.business_id);
      if (r.pain_category) {
        entry.cats[r.pain_category] = (entry.cats[r.pain_category] || 0) + 1;
      }
    }

    totalLoaded += data.length;
    lastId = data[data.length - 1].id;
    process.stdout.write('\r  Loaded ' + totalLoaded.toLocaleString() + ' reviews...');
  }

  console.log('\r  ✓ ' + totalLoaded.toLocaleString() + ' reviews | ' + bizReviews.size.toLocaleString() + ' businesses\n');

  // ── Step 3: Compute enrichment ────────────────────────────────────────────────
  console.log('Step 3: Computing enrichment values...');
  const updates = [];

  for (const [bizId, reviewData] of bizReviews) {
    // Get ACTUAL Google Maps rating for this business
    const bizRecord = bizRatings.get(bizId);
    const actualRating = bizRecord ? bizRecord.rating : null;

    // Derive negative_pct from actual overall rating — NOT from our review sample
    const negativePct = ratingToNegPct(actualRating);
    const healthScore = Math.max(0, Math.round(100 - (negativePct * 0.7)));

    // Sort pain categories by count
    const sortedCats = Object.entries(reviewData.cats).sort((a, b) => b[1] - a[1]);
    const totalCatCount = sortedCats.reduce((s, [, c]) => s + c, 0);

    const painPoints = sortedCats.map(([category, count]) => ({
      category,
      count,
      pct: totalCatCount > 0 ? Math.round((count / totalCatCount) * 100) : 0,
    }));

    const topPainPoint = sortedCats.length > 0 ? sortedCats[0][0] : null;

    updates.push({ id: bizId, pain_points: painPoints, top_pain_point: topPainPoint, negative_pct: negativePct, health_score: healthScore });
  }

  console.log('  ✓ ' + updates.length.toLocaleString() + ' businesses to update\n');

  // ── Step 4: Batch update ──────────────────────────────────────────────────────
  console.log('Step 4: Updating businesses table...');
  let done = 0, errors = 0;
  const totalBatches = Math.ceil(updates.length / BATCH_SIZE);

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write('\r  Batch ' + batchNum + '/' + totalBatches + ' (' + (i + batch.length).toLocaleString() + '/' + updates.length.toLocaleString() + ')...');

    const results = await Promise.all(
      batch.map(upd => {
        const { id, ...fields } = upd;
        return supabase.from('businesses').update(fields).eq('id', id);
      })
    );

    const batchErrors = results.filter(r => r.error).length;
    errors += batchErrors;
    done += batch.length - batchErrors;
  }

  console.log('\n  ✓ Done — Updated: ' + done.toLocaleString() + ' | Errors: ' + errors);

  // ── Step 5: Verify the fix ────────────────────────────────────────────────────
  console.log('\nStep 5: Verification...');

  // Check the specific business that was wrong
  const { data: checkBiz } = await supabase
    .from('businesses')
    .select('business_name,city,rating,negative_pct,health_score,top_pain_point')
    .ilike('business_name', '%Comprehensive Dental Care%')
    .limit(5);

  console.log('\n  Test: Comprehensive Dental Care businesses:');
  (checkBiz || []).forEach(b => {
    console.log('  ' + b.city + ' | rating=' + b.rating + '★ | neg%=' + b.negative_pct + '% | health=' + b.health_score + ' | top=' + b.top_pain_point);
  });

  // Sample of high-rated businesses — should now show low negative %
  const { data: goodBiz } = await supabase
    .from('businesses')
    .select('business_name,city,rating,negative_pct,health_score,top_pain_point')
    .gte('rating', 4.8)
    .not('top_pain_point', 'is', null)
    .limit(5);

  console.log('\n  5★ businesses (should have low neg%):');
  (goodBiz || []).forEach(b => {
    const ok = (b.negative_pct || 0) <= 10 ? '✅' : '❌';
    console.log('  ' + ok + ' ' + b.business_name?.substring(0, 35) + ' | ' + b.rating + '★ | neg%=' + b.negative_pct + '% | health=' + b.health_score);
  });

  // Sample of low-rated businesses
  const { data: badBiz } = await supabase
    .from('businesses')
    .select('business_name,city,rating,negative_pct,health_score,top_pain_point')
    .lte('rating', 2.5)
    .not('top_pain_point', 'is', null)
    .limit(5);

  console.log('\n  Low-rated businesses (should have high neg%):');
  (badBiz || []).forEach(b => {
    const ok = (b.negative_pct || 0) >= 50 ? '✅' : '❌';
    console.log('  ' + ok + ' ' + b.business_name?.substring(0, 35) + ' | ' + b.rating + '★ | neg%=' + b.negative_pct + '% | health=' + b.health_score);
  });

  // Per-country
  console.log('\n  Per-country enrichment:');
  for (const cc of ['US', 'AU', 'CA', 'UK']) {
    const { count: tot } = await supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('country_code', cc);
    const { count: enr } = await supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('country_code', cc).not('top_pain_point', 'is', null);
    console.log('  ' + cc + ': ' + (enr || 0).toLocaleString() + ' / ' + (tot || 0).toLocaleString() + ' (' + ((enr || 0) / (tot || 1) * 100).toFixed(1) + '%)');
  }

  console.log('\n✅ Enrichment complete. Data is now accurate for callers.\n');
}

main().catch(err => {
  console.error('\n✗ Fatal:', err.message);
  process.exit(1);
});

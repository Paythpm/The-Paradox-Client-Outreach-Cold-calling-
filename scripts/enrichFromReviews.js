/**
 * enrichFromReviews.js — Compute enrichment directly from business_reviews table
 *
 * For each business that has reviews:
 *   - pain_points: array of {category, count, pct} sorted by count DESC
 *   - top_pain_point: the category with the most reviews
 *   - negative_pct: pct of reviews that are 1-2 star
 *   - health_score: 100 - (negative_pct * 0.7) — simple score
 *
 * This replaces the stale review_analysis_cache.json approach.
 * No Groq API calls needed — computes from data already in DB.
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

const BATCH_SIZE = 300; // businesses updated per batch

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Enrich from Reviews — Compute pain points from DB reviews   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Load ALL reviews using cursor pagination ─────────────────────────
  console.log('Loading all reviews from DB...');
  const bizReviews = new Map(); // business_id → { cats: {catName: count}, ratings: [1,2,3,...] }

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
        bizReviews.set(r.business_id, { cats: {}, ratings: [] });
      }
      const entry = bizReviews.get(r.business_id);
      if (r.pain_category) {
        entry.cats[r.pain_category] = (entry.cats[r.pain_category] || 0) + 1;
      }
      if (r.rating !== null) {
        entry.ratings.push(r.rating);
      }
    }

    totalLoaded += data.length;
    lastId = data[data.length - 1].id;
    process.stdout.write('\r  Loaded ' + totalLoaded.toLocaleString() + ' reviews...');
  }

  console.log('\r  ✓ ' + totalLoaded.toLocaleString() + ' reviews loaded | ' + bizReviews.size.toLocaleString() + ' businesses\n');

  // ── Step 2: Compute enrichment for each business ──────────────────────────────
  console.log('Computing enrichment values...');
  const updates = [];

  for (const [bizId, data] of bizReviews) {
    const totalReviews = data.ratings.length;
    const negativeCount = data.ratings.filter(r => r <= 2).length;
    const negativePct = totalReviews > 0 ? Math.round((negativeCount / totalReviews) * 100 * 10) / 10 : 0;
    const healthScore = Math.max(0, Math.round(100 - (negativePct * 0.7)));

    // Sort categories by count
    const sortedCats = Object.entries(data.cats)
      .sort((a, b) => b[1] - a[1]);

    const totalCatCount = sortedCats.reduce((s, [, c]) => s + c, 0);

    const painPoints = sortedCats.map(([category, count]) => ({
      category,
      count,
      pct: totalCatCount > 0 ? Math.round((count / totalCatCount) * 100) : 0,
    }));

    const topPainPoint = sortedCats.length > 0 ? sortedCats[0][0] : null;

    updates.push({
      id: bizId,
      pain_points: painPoints,
      top_pain_point: topPainPoint,
      negative_pct: negativePct,
      health_score: healthScore,
    });
  }

  console.log('  ✓ ' + updates.length.toLocaleString() + ' businesses to update\n');

  // ── Step 3: Batch update into businesses table ────────────────────────────────
  console.log('Updating businesses table...');
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

  // ── Step 4: Verification ──────────────────────────────────────────────────────
  console.log('\nVerifying...');
  const { count: enriched } = await supabase
    .from('businesses')
    .select('*', { count: 'exact', head: true })
    .not('top_pain_point', 'is', null);

  const { count: total } = await supabase
    .from('businesses')
    .select('*', { count: 'exact', head: true });

  console.log('  Enriched: ' + (enriched || 0).toLocaleString() + ' / ' + (total || 0).toLocaleString() + ' businesses (' + ((enriched || 0) / (total || 1) * 100).toFixed(1) + '%)');

  // Sample a few enriched businesses
  console.log('\n  Sample enriched businesses:');
  const { data: samples } = await supabase
    .from('businesses')
    .select('business_name,country_code,city,top_pain_point,health_score,negative_pct,pain_points')
    .not('top_pain_point', 'is', null)
    .limit(5);

  for (const b of (samples || [])) {
    console.log('  ' + (b.country_code || '??') + ' | ' + (b.business_name || '').substring(0, 40).padEnd(40) + ' | Score: ' + b.health_score + ' | Top: ' + b.top_pain_point);
    const pts = (b.pain_points || []).slice(0, 3);
    pts.forEach(p => console.log('       → ' + p.category + ': ' + p.count + ' reviews (' + p.pct + '%)'));
  }

  // Per-country enrichment
  console.log('\n  Per-country enrichment:');
  for (const cc of ['US', 'AU', 'CA', 'UK']) {
    const { count: tot } = await supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('country_code', cc);
    const { count: enr } = await supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('country_code', cc).not('top_pain_point', 'is', null);
    console.log('  ' + cc + ': ' + (enr || 0).toLocaleString() + ' / ' + (tot || 0).toLocaleString() + ' (' + ((enr || 0) / (tot || 1) * 100).toFixed(1) + '%)');
  }

  console.log('\n✅ Enrichment complete. Pain points now visible in the platform.\n');
}

main().catch(err => {
  console.error('\n✗ Fatal:', err.message);
  process.exit(1);
});

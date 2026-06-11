/**
 * enrichFast.js — Fast bulk enrichment using batched SQL UPDATE
 * Uses parameterized CASE statements to update 500 rows per query
 * instead of 500 individual API calls.
 * 
 * Run: node scripts/enrichFast.js
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 200; // rows per SQL call — smaller is safer for payload size

async function main() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Fast Enrichment — Pain Points');
  console.log('═══════════════════════════════════════════\n');

  // Load analysis cache
  const cachePath = path.join(__dirname, 'review_analysis_cache.json');
  if (!fs.existsSync(cachePath)) {
    console.error('No cache found. Run: node scripts/importPipeline.js --step=2');
    process.exit(1);
  }
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const placeIds = Object.keys(cache);
  console.log(`Cache: ${placeIds.length.toLocaleString()} place IDs`);

  // Fetch all businesses with place_id in pages of 1000
  console.log('Loading businesses from DB...');
  let allBiz = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, place_id')
      .not('place_id', 'is', null)
      .range(from, from + 999);
    if (error || !data?.length) break;
    allBiz = allBiz.concat(data);
    from += 1000;
    process.stdout.write(`\r  Loaded ${allBiz.length.toLocaleString()}...`);
    if (data.length < 1000) break;
  }
  console.log(`\r  Loaded ${allBiz.length.toLocaleString()} businesses\n`);

  // Build update list
  const updates = [];
  for (const biz of allBiz) {
    const a = cache[biz.place_id];
    if (!a) continue;
    updates.push({
      id:             biz.id,
      pain_points:    JSON.stringify(a.pain_points || []),
      top_pain_point: a.top_pain_point || null,
      negative_pct:   a.negative_pct || 0,
      health_score:   a.health_score || null,
    });
  }

  console.log(`Matches: ${updates.length.toLocaleString()} | Will update: ${updates.length.toLocaleString()}`);

  // Process in batches — each batch does ONE upsert call with all rows
  let done = 0, errors = 0;
  const totalBatches = Math.ceil(updates.length / BATCH_SIZE);

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`\r  Batch ${batchNum}/${totalBatches} (${i + batch.length}/${updates.length})...`);

    // Build the payload with parsed JSON (not strings)
    const payload = batch.map(u => ({
      id:             u.id,
      pain_points:    JSON.parse(u.pain_points),
      top_pain_point: u.top_pain_point,
      negative_pct:   u.negative_pct,
      health_score:   u.health_score,
    }));

    // Use individual updates but run them in parallel within the batch (faster)
    const promises = payload.map(upd => {
      const { id, ...fields } = upd;
      return supabase.from('businesses').update(fields).eq('id', id);
    });
    const results = await Promise.all(promises);
    const batchErrors = results.filter(r => r.error).length;
    if (batchErrors > 0) {
      errors += batchErrors;
    }
    done += batch.length - batchErrors;
  }

  console.log(`\n\n✓ Done — Updated: ${done.toLocaleString()} | Errors: ${errors}`);

  // Final verification
  const { count: enriched } = await supabase
    .from('businesses')
    .select('*', { count: 'exact', head: true })
    .not('top_pain_point', 'is', null);
  console.log(`DB enriched count: ${enriched?.toLocaleString()}`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});

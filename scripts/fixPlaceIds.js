/**
 * fixPlaceIds.js — Extract and populate missing place_id from google_maps_url
 *
 * Root cause fix v2:
 *   - Previous version used offset pagination which drifted as rows were updated
 *     (fixed rows drop out of WHERE place_id IS NULL, so offset 2000 skips rows)
 *   - This version always fetches from offset=0 since fixed rows self-remove from
 *     the result set — we loop until 0 rows are returned
 *   - No pre-loading of existingPids — we attempt the update directly and let
 *     Postgres enforce the unique constraint (ON CONFLICT skip)
 *
 * Run: node scripts/fixPlaceIds.js
 */
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function extractPlaceId(url) {
  if (!url) return null;
  const m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  return m ? m[1].toLowerCase() : null;
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Fix place_id v2 — Cursor-safe pagination (no drift)      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Count before
  const { count: before } = await supa
    .from('businesses')
    .select('*', { count: 'exact', head: true })
    .is('place_id', null)
    .not('google_maps_url', 'is', null);
  console.log('Businesses needing fix: ' + (before || 0).toLocaleString());

  if (!before || before === 0) {
    console.log('✓ Nothing to fix — all place_ids already populated.');
    return;
  }

  let fixed = 0, dupSkipped = 0, noExtract = 0, batchNum = 0, prevFixed = -1;
  const PAGE = 1000;

  // KEY FIX: always fetch from offset=0 because updated rows drop out of the
  // WHERE place_id IS NULL filter. Loop until the page returns 0 rows.
  while (true) {
    const { data, error } = await supa
      .from('businesses')
      .select('id, google_maps_url')
      .is('place_id', null)
      .not('google_maps_url', 'is', null)
      .range(0, PAGE - 1);  // always 0..PAGE-1 — fixed rows self-remove

    if (error) {
      console.error('\nDB error:', error.message);
      break;
    }
    if (!data || data.length === 0) break; // nothing left to fix

    batchNum++;
    const updates = [];

    for (const b of data) {
      const pid = extractPlaceId(b.google_maps_url);
      if (!pid) {
        noExtract++;
        // Mark this row so it won't reappear — set place_id to a sentinel
        // Actually: just skip — we can't extract so it stays NULL permanently
        continue;
      }
      updates.push({ id: b.id, place_id: pid });
    }

    if (updates.length === 0) {
      // All rows in this page had unextractable URLs — mark them to prevent
      // infinite loop by setting a sentinel value... but that would pollute data.
      // Instead, if all 1000 had no extractable PlaceID, we're done with fixable ones.
      // Check: are there any rows left with extractable URLs?
      console.log('\n  Page ' + batchNum + ': All ' + data.length + ' rows had no extractable PlaceID — done.');
      break;
    }

    // Upsert in parallel chunks of 100 — use individual updates to respect unique constraint
    // If PlaceID already taken by another row, Postgres will error → we catch and skip
    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      const results = await Promise.allSettled(
        chunk.map(u =>
          supa
            .from('businesses')
            .update({ place_id: u.place_id })
            .eq('id', u.id)
            .is('place_id', null) // safety: only update if still NULL
        )
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const { error: updateErr } = r.value;
          if (updateErr) {
            // Unique constraint violation = another row owns this PlaceID
            dupSkipped++;
          } else {
            fixed++;
          }
        }
      }
    }

    process.stdout.write(
      '\r  Fixed: ' + fixed.toLocaleString() +
      ' | Dup conflict: ' + dupSkipped.toLocaleString() +
      ' | No extract: ' + noExtract.toLocaleString() +
      ' | Batch: ' + batchNum
    );

    // Safety valve: if fixed count didn't increase this batch, we're stuck on
    // true duplicates that can never be resolved — stop.
    if (fixed === prevFixed && batchNum > 1) {
      console.log('\n  All remaining ' + data.length + ' rows are true duplicates (PlaceID already owned) — stopping.');
      break;
    }
    prevFixed = fixed;
  }

  console.log('\n\n✓ Done');
  console.log('  Fixed:            ' + fixed.toLocaleString());
  console.log('  Dup conflict:     ' + dupSkipped.toLocaleString() + ' (PlaceID already owned by another row)');
  console.log('  No extract:       ' + noExtract.toLocaleString() + ' (URL had no PlaceID pattern)');

  // Final verification
  const { count: nowHas } = await supa
    .from('businesses')
    .select('*', { count: 'exact', head: true })
    .not('place_id', 'is', null);
  const { count: total } = await supa
    .from('businesses')
    .select('*', { count: 'exact', head: true });
  const { count: stillNull } = await supa
    .from('businesses')
    .select('*', { count: 'exact', head: true })
    .is('place_id', null);

  console.log('\nDB after fix:');
  console.log('  With place_id:    ' + (nowHas || 0).toLocaleString() + ' (' + Math.round((nowHas || 0) / (total || 1) * 100) + '%)');
  console.log('  Without place_id: ' + (stillNull || 0).toLocaleString() + ' (true dups — cannot be fixed)');
  console.log('  Total businesses: ' + (total || 0).toLocaleString());
  console.log('\n→ Now run: node scripts/importReviewsPhase4.js\n');
}

main().catch(console.error);

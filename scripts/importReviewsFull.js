/**
 * importReviewsFull.js — Complete re-import of ALL review data with fixes
 *
 * FIXES applied vs previous pipeline:
 *   1. Rating filter relaxed: keep reviews rated <= 3 (was <= 2.5)
 *      → captures 3-star "mediocre" reviews which contain real complaints
 *   2. MAX_PER_CAT raised to 10 (was 5)
 *      → stores more evidence per pain category per business
 *   3. Uncategorized reviews WITH strong negative sentiment are kept
 *      in a catch-all "General Complaint" category (not dropped)
 *   4. Smart dedup: uses business_id+category+text_hash (not place_id based)
 *      → more robust against place_id changes
 *   5. Processes ALL CSV files across all phases, newest first (phase4 wins)
 *
 * Run: node scripts/importReviewsFull.js
 */
'use strict';

const path    = require('path');
const fs      = require('fs');
const readline = require('readline');
const crypto  = require('crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE   = 500;
const MAX_PER_CAT  = 10;  // INCREASED from 5 — more evidence per category
const MAX_LEN      = 500;

// Expanded pain keywords
const PAIN_KEYWORDS = {
  'Booking & Appointments': [
    'appointment','schedul','cancel','book','available','rescheduled','slot',
    'no availability','wait weeks','wait months','open slot','hard to get','took weeks',
    'fully booked','no opening','waiting list','months out',
  ],
  'Customer Service': [
    'rude','unfriendly','unprofessional','unhelpful','attitude','disrespectful',
    'dismissive','ignored','front desk','receptionist','staff was','terrible service',
    'horrible service','poor service','bad service','awful staff','impolite','condescending',
  ],
  'Pricing & Billing': [
    'expensive','overpriced','charge','billing','invoice','refund','hidden fee',
    'cost','price','overcharge','insurance','unexpected','too much','rip off',
    'ripoff','charged me','extra fee','quoted','overprice','not worth','money',
  ],
  'Quality of Work': [
    'fell out','broken','crown','filling','implant','root canal','bad work','redo',
    'failed','came out','not fixed','still hurts','messed up','cracked','shoddy',
    'poor quality','bad result','not healed','worse after','damaged',
  ],
  'Communication': [
    "no reply","no response","don't answer","didn't answer",'voicemail','email',
    'contact','follow up','not informed','never called back','no callback',
    'left a message','no communication','couldn\'t reach','unreachable',
  ],
  'Waiting Times': [
    'wait','waited','waiting','hour wait','delay','slow','45 min','two hours',
    '2 hours','behind schedule','running late','overbooked','sat there',
    'in the waiting room','late start','made me wait','long time',
  ],
  'Trust & Transparency': [
    'lied','mislead','dishonest','scam','fraud','trust','hide','not what was promised',
    'unnecessary treatment','false','deceived','bait and switch','misleading',
    'not transparent','overtreatment','upsell','pressured',
  ],
  'Facilities': [
    'dirty','clean','hygiene','facility','parking','outdated','broken equipment',
    'filthy','unclean','run down','old equipment','needs update','cramped',
    'smells','odour','not clean','no parking',
  ],
  'General Complaint': [
    // Catch-all for clear negative reviews that don't fit above categories
    'never again','would not recommend','do not go','avoid','worst','terrible',
    'horrible','awful','disgusting','unacceptable','disappointed','waste of time',
    'waste of money','regret','should have','nightmare','disaster',
  ],
};

function detectPainCategory(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [cat, kws] of Object.entries(PAIN_KEYWORDS)) {
    if (kws.some(kw => lower.includes(kw))) return cat;
  }
  return null;
}

function extractPlaceId(url) {
  if (!url) return null;
  const m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  return m ? m[1].toLowerCase() : null;
}

function parseRating(raw) {
  const m = String(raw || '').match(/([0-9.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function contentHash(businessId, text, category) {
  return crypto.createHash('md5')
    .update((businessId || '') + '|' + (category || '') + '|' + text.substring(0, 100))
    .digest('hex');
}

// All CSV files, newest/biggest first (phase4 takes priority for dedup)
const CSV_FILES = [
  // Phase 4 — largest, most recent
  { file: path.join(__dirname, '../../phase 4 data maps review/maps_pain_points_us.csv'), country: 'US' },
  { file: path.join(__dirname, '../../phase 4 data maps review/maps_pain_points_au.csv'), country: 'AU' },
  { file: path.join(__dirname, '../../phase 4 data maps review/maps_pain_points_ca.csv'), country: 'CA' },
  { file: path.join(__dirname, '../../phase 4 data maps review/maps_pain_points_uk.csv'), country: 'UK' },
  // Phase 3
  { file: path.join(__dirname, '../../phase 3 data maps review/maps_pain_points_au.csv'), country: 'AU' },
  { file: path.join(__dirname, '../../phase 3 data maps review/maps_pain_points_ca.csv'), country: 'CA' },
  { file: path.join(__dirname, '../../phase 3 data maps review/maps_pain_points_uk.csv'), country: 'UK' },
  // Phase 2
  { file: path.join(__dirname, '../../phase2 data maps review/maps_pain_points_us.csv'), country: 'US' },
  { file: path.join(__dirname, '../../phase2 data maps review/maps_pain_points_au.csv'), country: 'AU' },
  { file: path.join(__dirname, '../../phase2 data maps review/maps_pain_points_ca.csv'), country: 'CA' },
  { file: path.join(__dirname, '../../phase2 data maps review/maps_pain_points_uk.csv'), country: 'UK' },
  // Root-level files
  { file: path.join(__dirname, '../../maps_pain_points_phase.csv'),          country: 'UK' },
  { file: path.join(__dirname, '../../maps_pain_points_phase1.csv'),         country: 'CA' },
  { file: path.join(__dirname, '../../maps_pain_points_us phase 1.csv'),     country: 'US' },
  { file: path.join(__dirname, '../../maps_reviews_seen_phase1.csv'),        country: 'AU' },
];

function parseCSVLine(line) {
  const result = []; let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const t = await res.text();
    throw new Error('HTTP ' + res.status + ': ' + t.substring(0, 200));
  }
  return res.json();
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Full Review Re-Import — Fixed pipeline (relaxed filters)     ║');
  console.log('║  Rating <= 3 kept | MAX_PER_CAT=10 | General Complaint added  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Build PlaceID → business_id map ──────────────────────────────────
  // IMPORTANT: use supabase-js .range() NOT fetch+offset — the REST API offset
  // can return partial pages due to data gaps, causing early termination.
  console.log('Loading PlaceID → business_id map...');
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const placeIdMap = new Map();
  // CRITICAL: use cursor-based pagination (id > last_id) NOT offset-based.
  // Supabase range() with filtered queries returns variable page sizes due to
  // index gaps — pages mid-table can return 0 rows and stop the loop early,
  // silently missing up to 36,000 rows.
  let lastId = '00000000-0000-0000-0000-000000000000';
  while (true) {
    const { data, error } = await supabase
      .from('businesses')
      .select('id,place_id')
      .not('place_id', 'is', null)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(1000);
    if (error || !data || data.length === 0) break;
    data.forEach(b => placeIdMap.set(b.place_id.toLowerCase(), b.id));
    lastId = data[data.length - 1].id;
    process.stdout.write('\r  Loaded ' + placeIdMap.size.toLocaleString() + ' PlaceIDs...');
  }
  console.log('\r  ✓ ' + placeIdMap.size.toLocaleString() + ' businesses with PlaceID\n');

  // ── Step 2: Load existing fingerprints ───────────────────────────────────────
  // Also use supabase-js range() for consistent pagination
  console.log('Loading existing review fingerprints...');
  const existingHashes = new Set();
  let lastRevId = '00000000-0000-0000-0000-000000000000';
  while (true) {
    const { data, error } = await supabase
      .from('business_reviews')
      .select('id,business_id,pain_category,review_text')
      .gt('id', lastRevId)
      .order('id', { ascending: true })
      .limit(1000);
    if (error || !data || data.length === 0) break;
    data.forEach(r => existingHashes.add(contentHash(r.business_id, r.review_text || '', r.pain_category)));
    lastRevId = data[data.length - 1].id;
    process.stdout.write('\r  ' + existingHashes.size.toLocaleString() + ' fingerprints...');
  }
  console.log('\r  ✓ ' + existingHashes.size.toLocaleString() + ' existing reviews fingerprinted\n');

  // ── Step 3: Process each file ────────────────────────────────────────────────
  const grandResults = [];
  let grandInserted = 0;

  for (const { file, country } of CSV_FILES) {
    if (!fs.existsSync(file)) {
      console.log('⚠ Skipping (not found): ' + path.basename(file));
      continue;
    }

    const label = path.relative(path.join(__dirname, '../..'), file);
    console.log('\n' + '─'.repeat(60));
    console.log('→ [' + country + '] ' + label);
    console.log('─'.repeat(60));

    // Per-business, per-category cap tracking (in-memory for this file)
    // Key: businessId + '|' + catKey → count
    const catCounts = new Map();

    // Load existing per-business counts from DB for this run's businesses
    // (We track in-memory: start at 0, add as we go, also count existing DB entries)
    // For simplicity, just use in-memory tracking (dedup handles true duplicates)

    const reviewMap = new Map(); // businessId → { catKey → [reviews] }
    let lineNum = 0, matched = 0, negative = 0, skippedDup = 0, skippedPos = 0, skippedCols = 0;
    const startTime = Date.now();

    const rl = readline.createInterface({
      input: fs.createReadStream(file, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const rawLine of rl) {
      lineNum++;
      if (lineNum === 1) continue; // header

      const cols = parseCSVLine(rawLine);
      if (cols.length < 5) { skippedCols++; continue; }

      const businessUrl = cols[1]?.trim();
      const ratingRaw   = cols[2]?.trim();
      const reviewText  = cols[4]?.trim();

      if (!reviewText || reviewText.length < 20) continue;

      const placeId = extractPlaceId(businessUrl);
      if (!placeId || !placeIdMap.has(placeId)) continue;
      matched++;

      const rating = parseRating(ratingRaw);

      // FIX 1: Keep reviews rated <= 3 (was <= 2.5 — dropped all 3-star reviews)
      if (rating !== null && rating > 3) { skippedPos++; continue; }
      negative++;

      const category = detectPainCategory(reviewText);
      if (!category) continue; // still skip truly uncategorizable

      const businessId = placeIdMap.get(placeId);
      const hash = contentHash(businessId, reviewText, category);
      if (existingHashes.has(hash)) { skippedDup++; continue; }

      // FIX 2: MAX_PER_CAT=10 per business per category per file pass
      const capKey = businessId + '|' + category;
      const currentCount = catCounts.get(capKey) || 0;
      if (currentCount >= MAX_PER_CAT) continue;

      catCounts.set(capKey, currentCount + 1);
      existingHashes.add(hash); // prevent cross-file dups

      if (!reviewMap.has(businessId)) reviewMap.set(businessId, {});
      const bizMap = reviewMap.get(businessId);
      if (!bizMap[category]) bizMap[category] = [];
      bizMap[category].push({
        text: reviewText.substring(0, MAX_LEN),
        rating,
        date: cols[3]?.trim() || null,
        category,
        hash,
        placeId,
      });

      if (lineNum % 100000 === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(
          '\r  Lines: ' + lineNum.toLocaleString() +
          ' | Matched: ' + matched.toLocaleString() +
          ' | New: ' + negative.toLocaleString() +
          ' | Dups: ' + skippedDup.toLocaleString() +
          ' | Biz: ' + reviewMap.size.toLocaleString() +
          ' | ' + elapsed + 's'
        );
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(
      '\r  Lines: ' + lineNum.toLocaleString() +
      ' | Matched: ' + matched.toLocaleString() +
      ' | New neg: ' + negative.toLocaleString() +
      ' | Dups: ' + skippedDup.toLocaleString() +
      ' | Split lines: ' + skippedCols +
      ' | Pos skipped: ' + skippedPos.toLocaleString() +
      ' | Biz: ' + reviewMap.size.toLocaleString() +
      ' | ' + elapsed + 's'
    );

    // Build insert rows
    const insertRows = [];
    for (const [businessId, catMap] of reviewMap) {
      for (const [cat, reviews] of Object.entries(catMap)) {
        for (const rev of reviews) {
          insertRows.push({
            business_id:   businessId,
            place_id:      rev.placeId,
            rating:        rev.rating,
            review_text:   rev.text,
            pain_category: rev.category,
            review_date:   rev.date,
          });
        }
      }
    }

    console.log('  New rows to insert: ' + insertRows.length.toLocaleString());

    if (insertRows.length === 0) {
      console.log('  ✓ Nothing new');
      grandResults.push({ label, inserted: 0, errors: 0 });
      continue;
    }

    // Batch insert
    let inserted = 0, errors = 0;
    const totalBatches = Math.ceil(insertRows.length / BATCH_SIZE);

    for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
      const batch = insertRows.slice(i, i + BATCH_SIZE);
      const bNum = Math.floor(i / BATCH_SIZE) + 1;
      process.stdout.write('\r  Inserting batch ' + bNum + '/' + totalBatches + '...');

      const res = await fetch(SUPABASE_URL + '/rest/v1/business_reviews', {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: 'Bearer ' + SERVICE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const t = await res.text();
        console.error('\n  Error batch ' + bNum + ' (HTTP ' + res.status + '): ' + t.substring(0, 150));
        errors++;
      } else {
        inserted += batch.length;
        grandInserted += batch.length;
      }
    }
    console.log('\n  ✓ ' + country + ': ' + inserted.toLocaleString() + ' inserted | errors: ' + errors);
    grandResults.push({ label, inserted, errors });
  }

  // ── Final report ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  FULL IMPORT COMPLETE');
  console.log('═'.repeat(60));
  for (const r of grandResults) {
    if (r.inserted > 0 || r.errors > 0) {
      console.log('  ' + r.label + ': ' + r.inserted.toLocaleString() + ' new | errors: ' + r.errors);
    }
  }
  console.log('  Total new this run: ' + grandInserted.toLocaleString());

  // Final DB counts — reuse the supabase client already declared above

  const { count: totalBiz } = await supabase.from('businesses').select('*', { count: 'exact', head: true });

  const countRes = await fetch(SUPABASE_URL + '/rest/v1/business_reviews?select=id', {
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, Prefer: 'count=exact', Range: '0-0' },
  });
  const range = countRes.headers.get('content-range');
  const totalInDB = range ? parseInt(range.split('/')[1]) : 0;

  console.log('\n  Total businesses: ' + (totalBiz || 0).toLocaleString());
  console.log('  Total reviews in DB: ' + totalInDB.toLocaleString());
  console.log('');
  console.log('  CC  | Businesses | Reviews');
  console.log('  ----|------------|--------');
  for (const cc of ['US', 'AU', 'CA', 'UK']) {
    const { count: tot } = await supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('country_code', cc);
    const { count: rev } = await supabase.from('business_reviews')
      .select('*, businesses!inner(country_code)', { count: 'exact', head: true })
      .eq('businesses.country_code', cc);
    console.log('  ' + cc.padEnd(4) + '| ' + (tot || 0).toString().padEnd(10) + ' | ' + (rev || 0).toLocaleString());
  }

  // Category breakdown
  const { data: catData } = await supabase
    .from('business_reviews')
    .select('pain_category')
    .not('pain_category', 'is', null)
    .limit(500000);

  if (catData && catData.length > 0) {
    const cats = {};
    catData.forEach(r => { cats[r.pain_category] = (cats[r.pain_category] || 0) + 1; });
    console.log('\n  Pain Category Breakdown:');
    Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
      console.log('    ' + cat.padEnd(32) + n.toLocaleString());
    });
  }

  console.log('\n  ✅ Done.\n');
}

main().catch(err => {
  console.error('\n✗ Fatal:', err.message);
  process.exit(1);
});

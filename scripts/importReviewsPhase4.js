/**
 * importReviewsPhase4.js — Import Phase 4 review data (4 countries)
 *
 * Files:
 *   maps_pain_points_us.csv  — US  (1.6M lines)
 *   maps_pain_points_au.csv  — AU  (1.1M lines)
 *   maps_pain_points_ca.csv  — CA  (1.3M lines)
 *   maps_pain_points_uk.csv  — UK  (1.2M lines)
 *
 * .txt files are URL-only lists — skipped (no review text)
 *
 * Safety: MD5 fingerprint dedup — nothing already in DB will be re-inserted.
 * Country accuracy: PlaceID is globally unique — AU reviews only link to AU businesses, etc.
 *
 * Run: node scripts/importReviewsPhase4.js
 */
'use strict';

const path     = require('path');
const fs       = require('fs');
const readline = require('readline');
const crypto   = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATA_DIR     = path.join(__dirname, '../../phase 4 data maps review');
const BATCH_SIZE   = 500;
const MAX_PER_CAT  = 5;   // max reviews per pain category per business
const MAX_LEN      = 500; // truncate review text at 500 chars

// Pain category keyword detection
const PAIN_KEYWORDS = {
  'Booking & Appointments': ['appointment','schedul','cancel','book','available','rescheduled','slot','no availability','wait weeks','wait months','open slot'],
  'Customer Service':       ['rude','unfriendly','unprofessional','unhelpful','attitude','disrespectful','dismissive','ignored','front desk','receptionist'],
  'Pricing & Billing':      ['expensive','overpriced','charge','billing','invoice','refund','hidden fee','cost','price','overcharge','insurance','unexpected'],
  'Quality of Work':        ['fell out','broken','crown','filling','implant','root canal','bad work','redo','failed','came out','not fixed','still hurts','messed up'],
  'Communication':          ["no reply","no response","don't answer",'voicemail','email','contact','follow up','not informed','never called back'],
  'Waiting Times':          ['wait','waited','waiting','hour wait','delay','slow','45 min','two hours','2 hours','behind schedule','running late','overbooked'],
  'Trust & Transparency':   ['lied','mislead','dishonest','scam','fraud','trust','hide','not what was promised','unnecessary treatment'],
  'Facilities':             ['dirty','clean','hygiene','facility','parking','outdated','broken equipment','filthy','unclean'],
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

function contentHash(placeId, text, category) {
  return crypto.createHash('md5').update(placeId + '|' + (category || '') + '|' + text.substring(0, 100)).digest('hex');
}

function parseCSVLine(line) {
  const result = []; let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQuotes && line[i+1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += ch;
  }
  result.push(current);
  return result;
}

// All 4 CSV files — US first (largest), then AU, CA, UK
const CSV_FILES = [
  { file: 'maps_pain_points_us.csv', country: 'US', lines: '1.6M' },
  { file: 'maps_pain_points_au.csv', country: 'AU', lines: '1.1M' },
  { file: 'maps_pain_points_ca.csv', country: 'CA', lines: '1.3M' },
  { file: 'maps_pain_points_uk.csv', country: 'UK', lines: '1.2M' },
];

async function main() {
  console.log('\n╔═════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 4 Review Import — US/AU/CA/UK (5.2M rows total)      ║');
  console.log('║  Fingerprint deduplication prevents any duplicate inserts    ║');
  console.log('╚═════════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Build PlaceID → business_id map ──────────────────────────────────
  console.log('Loading PlaceID → business_id map from DB...');
  const placeIdMap = new Map();
  let from = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/businesses?select=id,place_id&place_id=not.is.null&limit=1000&offset=${from}`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
    });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    data.forEach(b => placeIdMap.set(b.place_id.toLowerCase(), b.id));
    from += 1000;
    if (data.length < 1000) break;
    process.stdout.write(`\r  Loaded ${placeIdMap.size.toLocaleString()} PlaceIDs...`);
  }
  console.log(`\r  ✓ ${placeIdMap.size.toLocaleString()} businesses mapped\n`);

  // ── Step 2: Load existing fingerprints (dedup) ───────────────────────────────
  console.log('Loading existing review fingerprints (prevents duplicates)...');
  const existingHashes = new Set();
  let rFrom = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/business_reviews?select=place_id,pain_category,review_text&limit=1000&offset=${rFrom}`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
    });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    data.forEach(r => existingHashes.add(contentHash(r.place_id, r.review_text, r.pain_category)));
    rFrom += 1000;
    if (data.length < 1000) break;
    process.stdout.write(`\r  ${existingHashes.size.toLocaleString()} fingerprints loaded...`);
  }
  console.log(`\r  ✓ ${existingHashes.size.toLocaleString()} existing reviews fingerprinted\n`);

  const runResults = [];

  // ── Step 3: Process each CSV ──────────────────────────────────────────────────
  for (const { file, country, lines } of CSV_FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) { console.log(`⚠ Not found: ${file}`); continue; }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`→ [${country}] ${file} (~${lines} lines)`);
    console.log(`${'─'.repeat(60)}`);

    const reviewMap = new Map(); // placeId → { catKey → [reviews] }
    let lineNum = 0, matched = 0, negative = 0, skippedDup = 0;
    const startTime = Date.now();

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const rawLine of rl) {
      lineNum++;
      if (lineNum === 1) continue; // skip header

      const cols = parseCSVLine(rawLine);
      if (cols.length < 5) continue;

      const businessUrl = cols[1]?.trim();
      const ratingRaw   = cols[2]?.trim();
      const reviewText  = cols[4]?.trim();

      if (!reviewText || reviewText.length < 20) continue;

      const placeId = extractPlaceId(businessUrl);
      if (!placeId || !placeIdMap.has(placeId)) continue;
      matched++;

      const rating = parseRating(ratingRaw);
      if (rating !== null && rating > 2.5) continue; // only negative/neutral reviews
      negative++;

      const category = detectPainCategory(reviewText);
      const hash     = contentHash(placeId, reviewText, category);

      if (existingHashes.has(hash)) { skippedDup++; continue; }

      if (!reviewMap.has(placeId)) reviewMap.set(placeId, {});
      const bizMap = reviewMap.get(placeId);
      const catKey = category || '__uncategorized__';
      if (!bizMap[catKey]) bizMap[catKey] = [];
      if (bizMap[catKey].length < MAX_PER_CAT) {
        bizMap[catKey].push({ text: reviewText.substring(0, MAX_LEN), rating, date: cols[3]?.trim() || null, category, hash });
      }

      if (lineNum % 100000 === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(`\r  Lines: ${lineNum.toLocaleString()} | Matched: ${matched.toLocaleString()} | New negative: ${negative.toLocaleString()} | Skipped dups: ${skippedDup.toLocaleString()} | Businesses: ${reviewMap.size.toLocaleString()} | ${elapsed}s`);
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\r  Lines: ${lineNum.toLocaleString()} | Matched: ${matched.toLocaleString()} | New neg: ${negative.toLocaleString()} | Dups skipped: ${skippedDup.toLocaleString()} | Businesses: ${reviewMap.size.toLocaleString()} | ${elapsed}s`);

    // Build insert rows (exclude uncategorized)
    const insertRows = [];
    for (const [placeId, catMap] of reviewMap) {
      const businessId = placeIdMap.get(placeId);
      if (!businessId) continue;
      for (const [catKey, reviews] of Object.entries(catMap)) {
        if (catKey === '__uncategorized__') continue;
        for (const rev of reviews) {
          existingHashes.add(rev.hash); // prevent cross-file duplication
          insertRows.push({
            business_id:   businessId,
            place_id:      placeId,
            rating:        rev.rating,
            review_text:   rev.text,
            pain_category: rev.category,
            review_date:   rev.date,
          });
        }
      }
    }

    console.log(`  New rows to insert: ${insertRows.length.toLocaleString()}`);

    if (insertRows.length === 0) {
      console.log(`  ✓ Nothing new — all ${country} data already in DB`);
      runResults.push({ country, inserted: 0, errors: 0 });
      continue;
    }

    // Batch insert via direct fetch (bypasses PostgREST schema cache)
    let inserted = 0, errors = 0;
    const totalBatches = Math.ceil(insertRows.length / BATCH_SIZE);

    for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
      const batch  = insertRows.slice(i, i + BATCH_SIZE);
      const bNum   = Math.floor(i / BATCH_SIZE) + 1;
      process.stdout.write(`\r  Inserting batch ${bNum}/${totalBatches} (${(i + batch.length).toLocaleString()}/${insertRows.length.toLocaleString()})...`);

      const res = await fetch(`${SUPABASE_URL}/rest/v1/business_reviews`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal',
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const t = await res.text();
        console.error(`\n  Error batch ${bNum} (HTTP ${res.status}): ${t.substring(0, 150)}`);
        errors++;
      } else {
        inserted += batch.length;
      }
    }

    console.log(`\n  ✓ ${country}: ${inserted.toLocaleString()} new reviews inserted | errors: ${errors}`);
    runResults.push({ country, inserted, errors });
  }

  // ── Final report ──────────────────────────────────────────────────────────────
  const grandTotal = runResults.reduce((s, r) => s + r.inserted, 0);

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  PHASE 4 IMPORT COMPLETE');
  console.log(`${'═'.repeat(60)}`);
  for (const r of runResults) {
    console.log(`  ${r.country}: ${r.inserted.toLocaleString()} new | errors: ${r.errors}`);
  }
  console.log(`  Total new this run: ${grandTotal.toLocaleString()}`);

  // Get total in DB
  const countRes = await fetch(`${SUPABASE_URL}/rest/v1/business_reviews?select=id`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Prefer': 'count=exact', 'Range': '0-0' }
  });
  const range = countRes.headers.get('content-range');
  const totalInDB = range ? parseInt(range.split('/')[1]) : 0;
  console.log(`  Total reviews in DB: ${totalInDB.toLocaleString()}`);

  // Full database analysis
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  FULL DATABASE ANALYSIS');
  console.log(`${'═'.repeat(60)}`);

  const supabase = require('@supabase/supabase-js').createClient(SUPABASE_URL, SERVICE_KEY);
  const { count: totalBiz } = await supabase.from('businesses').select('*',{count:'exact',head:true});

  console.log(`\n  Total businesses: ${totalBiz.toLocaleString()}`);
  console.log(`  Total review quotes: ${totalInDB.toLocaleString()}`);
  console.log('');
  console.log('  CC  | Total    | Callable | Phone%  | Enriched | Enrich% | Rev Quotes');
  console.log('  ----|----------|----------|---------|----------|---------|----------');

  for (const cc of ['US','AU','CA','UK']) {
    const { count: tot }  = await supabase.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc);
    const { count: ph }   = await supabase.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc).not('phone','is',null);
    const { count: enr }  = await supabase.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc).not('top_pain_point','is',null);
    const revRes = await fetch(`${SUPABASE_URL}/rest/v1/business_reviews?select=id,businesses!inner(country_code)&businesses.country_code=eq.${cc}`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Prefer': 'count=exact', 'Range': '0-0' }
    });
    const revRange = revRes.headers.get('content-range');
    const revCount = revRange ? parseInt(revRange.split('/')[1]) : 0;
    const phonePct = tot > 0 ? ((ph/tot)*100).toFixed(1)+'%' : '0%';
    const enrichPct = tot > 0 ? ((enr/tot)*100).toFixed(1)+'%' : '0%';
    console.log(`  ${cc.padEnd(4)}| ${tot.toLocaleString().padEnd(8)} | ${ph.toLocaleString().padEnd(8)} | ${phonePct.padEnd(7)} | ${enr.toLocaleString().padEnd(8)} | ${enrichPct.padEnd(7)} | ${revCount.toLocaleString()}`);
  }

  // Category breakdown
  const catRes = await fetch(`${SUPABASE_URL}/rest/v1/business_reviews?select=pain_category&pain_category=not.is.null&limit=200000`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  });
  const catData = await catRes.json();
  if (Array.isArray(catData) && catData.length > 0) {
    const cats = {};
    catData.forEach(r => { cats[r.pain_category] = (cats[r.pain_category] || 0) + 1; });
    console.log('\n  Pain Category Breakdown (all countries):');
    Object.entries(cats).sort((a,b)=>b[1]-a[1]).forEach(([cat,n]) => {
      console.log(`    ${cat.padEnd(30)} ${n.toLocaleString()}`);
    });
  }

  console.log('\n  ✅ Phase 4 import complete. All data injected safely.\n');
}

main().catch(err => {
  console.error('\n✗ Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});

/**
 * importReviewsPhase2.js — Import Phase 2 review data
 * 
 * Processes 4 new CSV files from "phase2 data maps review" folder:
 *   - maps_pain_points_au.csv  (AU, 542K lines)
 *   - maps_pain_points_ca.csv  (CA, 644K lines)
 *   - maps_pain_points_uk.csv  (UK, 541K lines)
 *   - maps_pain_points_us.csv  (US, 1.1M lines)
 * 
 * Strategy:
 *   - Extracts PlaceID from URL → matches to businesses table
 *   - Only keeps negative reviews (rating ≤ 2.5)
 *   - Detects pain category per review
 *   - Keeps top 5 per category per business
 *   - Does NOT delete existing reviews — ADDS new ones (upsert by content hash)
 *   - Safe to re-run — won't duplicate
 * 
 * Run: node scripts/importReviewsPhase2.js
 */
'use strict';

const path     = require('path');
const fs       = require('fs');
const readline = require('readline');
const crypto   = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DATA_DIR     = path.join(__dirname, '../../phase2 data maps review');
const BATCH_SIZE   = 500;
const MAX_PER_CAT  = 5;
const MAX_LEN      = 500;

// ─── Pain keyword detection (same as Phase 1) ────────────────────────────────
const PAIN_KEYWORDS = {
  'Booking & Appointments': ['appointment','schedul','cancel','book','available','rescheduled','slot','no availability','wait weeks','wait months','open slot'],
  'Customer Service':       ['rude','unfriendly','unprofessional','unhelpful','attitude','disrespectful','dismissive','ignored','front desk','receptionist'],
  'Pricing & Billing':      ['expensive','overpriced','charge','billing','invoice','refund','hidden fee','cost','price','overcharge','insurance','unexpected'],
  'Quality of Work':        ['fell out','broken','crown','filling','implant','root canal','bad work','redo','failed','came out','not fixed','still hurts','messed up'],
  'Communication':          ['no reply','no response','don\'t answer','voicemail','email','contact','follow up','didn\'t tell','not informed','never called back'],
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
  const result = [];
  let current = '';
  let inQuotes = false;
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

async function dbFetch(path, opts = {}) {
  const res = await fetch(SUPABASE_URL + path, {
    ...opts,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (opts.method === 'POST' && opts.headers?.Prefer === 'return=minimal') return res;
  return res.json();
}

const CSV_FILES = [
  { file: 'maps_pain_points_us.csv', country: 'US' },
  { file: 'maps_pain_points_au.csv', country: 'AU' },
  { file: 'maps_pain_points_ca.csv', country: 'CA' },
  { file: 'maps_pain_points_uk.csv', country: 'UK' },
];

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 2 Review Import — 4 country CSV files              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Load PlaceID → business_id map ───────────────────────────────────
  console.log('Loading PlaceID → business_id map...');
  const placeIdMap = new Map();
  let from = 0;
  while (true) {
    const data = await dbFetch(`/rest/v1/businesses?select=id,place_id&place_id=not.is.null&limit=1000&offset=${from}`);
    if (!Array.isArray(data) || data.length === 0) break;
    data.forEach(b => placeIdMap.set(b.place_id.toLowerCase(), b.id));
    from += 1000;
    if (data.length < 1000) break;
    process.stdout.write(`\r  Loaded ${placeIdMap.size.toLocaleString()}...`);
  }
  console.log(`\r  ${placeIdMap.size.toLocaleString()} businesses with PlaceID\n`);

  // ── Step 2: Load existing review hashes to avoid duplicates ─────────────────
  console.log('Loading existing review fingerprints...');
  // We use a Set of (place_id + pain_category + first 100 chars) hashes
  // to avoid re-inserting reviews that are already in the DB
  const existingHashes = new Set();
  let rFrom = 0;
  while (true) {
    const data = await dbFetch(`/rest/v1/business_reviews?select=place_id,pain_category,review_text&limit=1000&offset=${rFrom}`);
    if (!Array.isArray(data) || data.length === 0) break;
    data.forEach(r => existingHashes.add(contentHash(r.place_id, r.review_text, r.pain_category)));
    rFrom += 1000;
    if (data.length < 1000) break;
    process.stdout.write(`\r  Loaded ${existingHashes.size.toLocaleString()} existing fingerprints...`);
  }
  console.log(`\r  ${existingHashes.size.toLocaleString()} existing reviews fingerprinted\n`);

  let grandTotal = 0;

  // ── Step 3: Process each CSV file ────────────────────────────────────────────
  for (const { file, country } of CSV_FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) { console.log(`⚠ Not found: ${file}`); continue; }

    console.log(`\n→ [${country}] ${file}`);

    // Map: placeId → { catKey → [{text,rating,date,category}] }
    const reviewMap = new Map();
    let lineNum = 0, matched = 0, negative = 0;

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const rawLine of rl) {
      lineNum++;
      if (lineNum === 1) continue; // skip header

      const cols = parseCSVLine(rawLine);
      if (cols.length < 5) continue;

      const businessUrl  = cols[1]?.trim();
      const ratingRaw    = cols[2]?.trim();
      const reviewText   = cols[4]?.trim();

      if (!reviewText || reviewText.length < 20) continue;

      const placeId = extractPlaceId(businessUrl);
      if (!placeId || !placeIdMap.has(placeId)) continue;
      matched++;

      const rating = parseRating(ratingRaw);
      if (rating !== null && rating > 2.5) continue;
      negative++;

      const category = detectPainCategory(reviewText);
      const hash = contentHash(placeId, reviewText, category);

      // Skip if already exists
      if (existingHashes.has(hash)) continue;

      if (!reviewMap.has(placeId)) reviewMap.set(placeId, {});
      const bizMap = reviewMap.get(placeId);
      const catKey = category || '__uncategorized__';
      if (!bizMap[catKey]) bizMap[catKey] = [];
      if (bizMap[catKey].length < MAX_PER_CAT) {
        bizMap[catKey].push({ text: reviewText.substring(0, MAX_LEN), rating, date: cols[3]?.trim() || null, category, hash });
      }

      if (lineNum % 100000 === 0) {
        process.stdout.write(`\r  Lines: ${lineNum.toLocaleString()} | Matched: ${matched.toLocaleString()} | Negative new: ${negative.toLocaleString()} | Businesses: ${reviewMap.size.toLocaleString()}`);
      }
    }
    console.log(`\r  Lines: ${lineNum.toLocaleString()} | Matched: ${matched.toLocaleString()} | Negative new: ${negative.toLocaleString()} | Businesses: ${reviewMap.size.toLocaleString()}`);

    // Build insert rows
    const insertRows = [];
    for (const [placeId, catMap] of reviewMap) {
      const businessId = placeIdMap.get(placeId);
      if (!businessId) continue;
      for (const [catKey, reviews] of Object.entries(catMap)) {
        if (catKey === '__uncategorized__') continue;
        for (const rev of reviews) {
          existingHashes.add(rev.hash); // prevent re-insert in next file
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

    console.log(`  New reviews to insert: ${insertRows.length.toLocaleString()}`);
    if (insertRows.length === 0) { console.log('  Nothing new to insert.'); continue; }

    // Insert in batches
    let inserted = 0, errors = 0;
    const totalBatches = Math.ceil(insertRows.length / BATCH_SIZE);
    for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
      const batch = insertRows.slice(i, i + BATCH_SIZE);
      const bnum  = Math.floor(i / BATCH_SIZE) + 1;
      process.stdout.write(`\r  Batch ${bnum}/${totalBatches} (${(i+batch.length).toLocaleString()}/${insertRows.length.toLocaleString()})...`);

      const res = await fetch(SUPABASE_URL + '/rest/v1/business_reviews', {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': 'Bearer ' + SERVICE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const t = await res.text();
        console.error(`\n  Error batch ${bnum}: ${t.substring(0, 150)}`);
        errors++;
      } else {
        inserted += batch.length;
      }
    }
    console.log(`\n  ✓ ${country}: inserted ${inserted.toLocaleString()} | errors: ${errors}`);
    grandTotal += inserted;
  }

  // ── Final stats ───────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Grand total new reviews inserted: ${grandTotal.toLocaleString()}`);

  const countRes = await fetch(SUPABASE_URL + '/rest/v1/business_reviews?select=id', {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Prefer': 'count=exact', 'Range': '0-0' }
  });
  const range = countRes.headers.get('content-range');
  console.log(`Total reviews in DB now: ${range?.split('/')[1] || '?'}`);
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });

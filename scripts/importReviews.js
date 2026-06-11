/**
 * importReviews.js — Import real review quotes into business_reviews table
 * 
 * Reads the 4 review CSV files, extracts negative reviews (rating ≤ 2.5),
 * detects their pain category, keeps top 5 per category per business,
 * matches to businesses via PlaceID, and inserts into business_reviews.
 * 
 * Run: node scripts/importReviews.js
 */
'use strict';

const path     = require('path');
const fs       = require('fs');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DATA_DIR = path.join(__dirname, '../..');
const BATCH_SIZE = 500;
const MAX_REVIEWS_PER_CATEGORY = 5; // keep top 5 per pain category per business
const MAX_REVIEW_LENGTH = 500;      // truncate at 500 chars

const CSV_FILES = [
  'maps_pain_points_us phase 1.csv',
  'maps_pain_points_phase3.csv',
  'maps_pain_points_phase3 copy.csv',
  'maps_reviews_seen_phase2.csv',
];

// ─── Pain category detection ──────────────────────────────────────────────────
const PAIN_KEYWORDS = {
  'Booking & Appointments': ['appointment','schedul','cancel','book','available','rescheduled','slot','no availability','wait weeks','wait months','open slot','couldn\'t get in'],
  'Customer Service':       ['rude','unfriendly','unprofessional','unhelpful','attitude','disrespectful','dismissive','ignored','front desk','receptionist','staff','horrible','terrible'],
  'Pricing & Billing':      ['expensive','overpriced','charge','billing','invoice','refund','hidden fee','cost','price','overcharge','upsell','unexpected','insurance','surprise'],
  'Quality of Work':        ['fell out','broken','crown','filling','implant','root canal','bad work','redo','failed','came out','not fixed','still hurts','worse after','messed up','wrong tooth'],
  'Communication':          ['no reply','no response','don\'t answer','voicemail','email','contact','follow up','update','didn\'t tell','not informed','never called back'],
  'Waiting Times':          ['wait','waited','waiting','hour wait','delay','slow','45 min','two hours','2 hours','behind schedule','running late','overbooked','kept waiting'],
  'Trust & Transparency':   ['lied','mislead','dishonest','scam','fraud','trust','honest','transparent','hide','not what was promised','unnecessary treatment','upsell'],
  'Facilities':             ['dirty','clean','hygiene','facility','parking','outdated','broken equipment','old equipment','filthy','unclean'],
};

function detectPainCategory(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(PAIN_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return null;
}

function extractPlaceId(url) {
  if (!url) return null;
  const m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  return m ? m[1].toLowerCase() : null;
}

function parseRating(raw) {
  if (!raw) return null;
  const m = String(raw).match(/([0-9.]+)/);
  return m ? parseFloat(m[1]) : null;
}

// Simple CSV line parser
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
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

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Import Business Reviews → business_reviews table      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Load all PlaceIDs from businesses table ──────────────────────────
  console.log('Loading PlaceID → business_id map from DB...');
  const placeIdMap = new Map(); // placeId -> business_id
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('businesses')
      .select('id, place_id')
      .not('place_id', 'is', null)
      .range(from, from + 999);
    if (!data?.length) break;
    data.forEach(b => placeIdMap.set(b.place_id.toLowerCase(), b.id));
    from += 1000;
    if (data.length < 1000) break;
  }
  console.log(`  ${placeIdMap.size.toLocaleString()} businesses with PlaceID in DB\n`);

  // ── Step 2: Process each CSV file ─────────────────────────────────────────────
  // Map: placeId -> { categoryKey -> [{text, rating, date}] }
  const reviewMap = new Map();
  let totalLines = 0, matched = 0, negativeReviews = 0;

  for (const file of CSV_FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) { console.log(`⚠ Not found: ${file}`); continue; }

    console.log(`→ ${file}`);
    let lineNum = 0;

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
      if (!placeId) continue;

      // Only keep this placeId if it matches a business we have
      if (!placeIdMap.has(placeId)) continue;
      matched++;

      const rating = parseRating(ratingRaw);

      // Only keep negative reviews (≤ 2.5 stars) for the Quotes tab
      if (rating !== null && rating > 2.5) continue;
      negativeReviews++;

      const category = detectPainCategory(reviewText);

      // Store under placeId → category
      if (!reviewMap.has(placeId)) reviewMap.set(placeId, {});
      const bizMap = reviewMap.get(placeId);
      const catKey = category || '__uncategorized__';

      if (!bizMap[catKey]) bizMap[catKey] = [];

      // Keep max N per category (prefer longer reviews — more useful as quotes)
      if (bizMap[catKey].length < MAX_REVIEWS_PER_CATEGORY) {
        bizMap[catKey].push({
          text: reviewText.substring(0, MAX_REVIEW_LENGTH),
          rating,
          date: cols[3]?.trim() || null,
          category,
        });
      }

      totalLines++;
      if (lineNum % 50000 === 0) {
        process.stdout.write(`\r  Lines: ${lineNum.toLocaleString()} | Matched: ${matched.toLocaleString()} | Negative: ${negativeReviews.toLocaleString()} | Businesses with reviews: ${reviewMap.size.toLocaleString()}`);
      }
    }

    console.log(`\r  Lines: ${lineNum.toLocaleString()} | Matched: ${matched.toLocaleString()} | Negative: ${negativeReviews.toLocaleString()} | Businesses: ${reviewMap.size.toLocaleString()}`);
  }

  console.log(`\nTotal businesses with negative reviews: ${reviewMap.size.toLocaleString()}`);

  // ── Step 3: Build insert rows ─────────────────────────────────────────────────
  console.log('\nBuilding insert rows...');
  const insertRows = [];

  for (const [placeId, catMap] of reviewMap) {
    const businessId = placeIdMap.get(placeId);
    if (!businessId) continue;

    for (const [catKey, reviews] of Object.entries(catMap)) {
      for (const rev of reviews) {
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

  console.log(`Total rows to insert: ${insertRows.length.toLocaleString()}`);

  // ── Step 4: Clear existing reviews and insert fresh ──────────────────────────
  console.log('\nClearing existing reviews...');
  // Delete in batches by created_at to avoid timeout
  await supabase.from('business_reviews').delete().lt('created_at', new Date(Date.now() + 1000).toISOString());

  console.log('Inserting in batches...');
  let inserted = 0, errors = 0;
  const totalBatches = Math.ceil(insertRows.length / BATCH_SIZE);

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
    const batch = insertRows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`\r  Batch ${batchNum}/${totalBatches} (${(i + batch.length).toLocaleString()}/${insertRows.length.toLocaleString()})...`);

    // Use direct fetch to bypass PostgREST schema cache issue
    const res = await fetch(supabaseUrl + '/rest/v1/business_reviews', {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`\n  Error batch ${batchNum} (HTTP ${res.status}): ${errText.substring(0, 200)}`);
      errors++;
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\n\n✓ Done — Inserted: ${inserted.toLocaleString()} | Errors: ${errors}`);

  // ── Final stats ───────────────────────────────────────────────────────────────
  const countRes = await fetch(
    process.env.REACT_APP_SUPABASE_URL + '/rest/v1/business_reviews?select=id',
    { headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY, 'Prefer': 'count=exact', 'Range': '0-0' } }
  );
  const countHeader = countRes.headers.get('content-range');
  const totalCount = countHeader ? countHeader.split('/')[1] : '?';
  console.log(`\nTotal reviews in DB: ${totalCount}`);

  // Category breakdown via fetch
  const catRes = await fetch(
    process.env.REACT_APP_SUPABASE_URL + '/rest/v1/business_reviews?select=pain_category&pain_category=not.is.null&limit=100000',
    { headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY } }
  );
  const catData = await catRes.json();
  if (Array.isArray(catData)) {
    const cats = {};
    catData.forEach(r => { cats[r.pain_category] = (cats[r.pain_category] || 0) + 1; });
    console.log('\nBy pain category:');
    Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
      console.log(`  ${cat.padEnd(30)} ${n.toLocaleString()}`);
    });
  }
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});

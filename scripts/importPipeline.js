#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DentIQ Data Import Pipeline
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * STEP 1 — Import master_leads Excel files into businesses table
 *   • Normalizes phone numbers to E.164
 *   • Maps city → IANA timezone
 *   • Extracts PlaceID from Google Maps URL
 *   • Batches upsert (safe to re-run)
 *
 * STEP 2 — Process review CSV files into pain point summaries
 *   • Groups reviews by PlaceID (stable, reliable join key)
 *   • Runs keyword-based pain point categorization
 *   • Outputs a summary map: placeId → analysis
 *
 * STEP 3 — Enrich businesses with pain point data
 *   • Matches by PlaceID only (never corrupts non-matching rows)
 *   • Updates: pain_points, top_pain_point, negative_pct, health_score
 *
 * Usage:
 *   node scripts/importPipeline.js --step=1     # import leads only
 *   node scripts/importPipeline.js --step=2     # analyze reviews only
 *   node scripts/importPipeline.js --step=3     # enrich from analysis
 *   node scripts/importPipeline.js --step=all   # run everything
 *   node scripts/importPipeline.js --dry-run    # preview without writing
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const XLSX   = require('xlsx');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { normalizePhone }   = require('./phoneNormalizer');
const { getCityTimezone }  = require('./cityTimezoneMap');

// ─── Config ───────────────────────────────────────────────────────────────────
const DATA_DIR   = path.join(__dirname, '../..');  // d:\Desktop\The Paradox Dental Clinics INFO
const BATCH_SIZE = 500;
const DRY_RUN    = process.argv.includes('--dry-run');
const STEP       = (process.argv.find(a => a.startsWith('--step=')) || '--step=all').split('=')[1];

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role — bypasses RLS for bulk insert
);

// ─── File manifest ────────────────────────────────────────────────────────────
const EXCEL_FILES = [
  { file: 'master_leads_us_cleaned.xlsx', country: 'US' },
  { file: 'master_leads_au_cleaned.xlsx', country: 'AU' },
  { file: 'master_leads_ca_cleaned.xlsx', country: 'CA' },
  { file: 'master_leads_uk_cleaned.xlsx', country: 'UK' },
];

const CSV_FILES = [
  { file: 'maps_pain_points_us phase 1.csv',  country: 'US' },
  { file: 'maps_pain_points_phase3.csv',       country: 'US' },  // mixed — phase3 had US law firms
  { file: 'maps_pain_points_phase3 copy.csv',  country: 'UK' },
  { file: 'maps_reviews_seen_phase2.csv',      country: 'AU' },
];

// ─── PlaceID extractor ────────────────────────────────────────────────────────
// Extracts the stable Google Place ID from any Maps URL
// Format inside URL: !1s0xABCDEF:0x123456
function extractPlaceId(url) {
  if (!url) return null;
  const m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  return m ? m[1].toLowerCase() : null;
}

// ─── Pain point keywords ──────────────────────────────────────────────────────
const PAIN_CATEGORIES = {
  'Booking & Appointments': ['wait', 'appointment', 'book', 'cancel', 'schedule', 'reschedule', 'queue', 'delay', 'late', 'hour', 'never call back', 'no show'],
  'Customer Service':       ['rude', 'unfriendly', 'unprofessional', 'unhelpful', 'attitude', 'disrespectful', 'dismissive', 'ignored', 'staff', 'receptionist', 'front desk'],
  'Pricing & Billing':      ['expensive', 'overpriced', 'charge', 'billing', 'invoice', 'refund', 'hidden fee', 'cost', 'price', 'overcharge', 'upsell'],
  'Quality of Work':        ['poor quality', 'mistake', 'error', 'wrong', 'redo', 'fix', 'damage', 'botched', 'incompetent', 'bad result', 'not happy', 'didn\'t work'],
  'Communication':          ['no reply', 'no response', 'don\'t answer', 'voicemail', 'email', 'contact', 'follow up', 'update', 'inform', 'communication', 'lack of communication'],
  'Waiting Times':          ['wait too long', 'waiting room', '1 hour', '2 hour', '3 hour', 'hour wait', 'long wait', 'kept waiting', 'rushed'],
  'Trust & Transparency':   ['lied', 'mislead', 'dishonest', 'scam', 'fraud', 'trust', 'honest', 'transparent', 'hide', 'not what was promised'],
  'Facilities':             ['dirty', 'clean', 'hygiene', 'facility', 'parking', 'location', 'access', 'equipment', 'outdated', 'broken'],
};

function analyzeSentiment(rating) {
  if (!rating) return 'neutral';
  const r = parseFloat(String(rating).replace(/[^0-9.]/g, ''));
  if (isNaN(r)) return 'neutral';
  if (r <= 2) return 'negative';
  if (r >= 4) return 'positive';
  return 'neutral';
}

function extractPainPoints(reviews) {
  // reviews: [{rating, text}]
  const negative = reviews.filter(r => analyzeSentiment(r.rating) === 'negative');
  const total    = reviews.length;
  const negCount = negative.length;
  const negPct   = total > 0 ? Math.round((negCount / total) * 100 * 10) / 10 : 0;

  // Count pain categories across negative reviews
  const catCounts = {};
  for (const rev of negative) {
    const text = (rev.text || '').toLowerCase();
    for (const [cat, keywords] of Object.entries(PAIN_CATEGORIES)) {
      if (keywords.some(kw => text.includes(kw))) {
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      }
    }
  }

  // Sort by frequency
  const painPoints = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({
      category,
      count,
      pct: negCount > 0 ? Math.round((count / negCount) * 100) : 0,
    }));

  const topPainPoint = painPoints[0]?.category || null;

  // Average rating
  const avgRating = total > 0
    ? Math.round(reviews.reduce((s, r) => {
        const v = parseFloat(String(r.rating).replace(/[^0-9.]/g, ''));
        return s + (isNaN(v) ? 0 : v);
      }, 0) / total * 100) / 100
    : null;

  // Health score: 0-100
  // Higher rating + lower neg% = better health
  const healthScore = avgRating !== null
    ? Math.round(((avgRating / 5) * 0.5 + ((100 - negPct) / 100) * 0.5) * 100)
    : null;

  return {
    pain_points: painPoints,
    top_pain_point: topPainPoint,
    negative_pct: negPct,
    health_score: healthScore,
    avg_rating: avgRating,
    review_count: total,
  };
}

// ─── STEP 1: Import Excel lead files ─────────────────────────────────────────
async function importLeads() {
  console.log('\n' + '═'.repeat(60));
  console.log('STEP 1 — Importing master lead files');
  console.log('═'.repeat(60));

  let totalInserted = 0, totalUpdated = 0, totalSkipped = 0, totalErrors = 0;

  for (const { file, country } of EXCEL_FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ File not found: ${file} — skipping`);
      continue;
    }

    console.log(`\n→ ${file} (${country})`);
    const wb = XLSX.readFile(filePath, { cellText: true, cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

    console.log(`  ${rows.length.toLocaleString()} rows to process`);

    // Detect column names dynamically (case-insensitive)
    const sampleRow = rows[0] || {};
    const colMap = {};
    for (const key of Object.keys(sampleRow)) {
      const k = key.toLowerCase().trim();
      colMap[k] = key; // lowercase → original
    }

    const getCol = (row, ...names) => {
      for (const n of names) {
        const key = colMap[n.toLowerCase()];
        if (key && row[key] !== null && row[key] !== undefined) return String(row[key]).trim();
      }
      return null;
    };

    const businesses = [];
    let skipped = 0;

    for (const row of rows) {
      const rawName  = getCol(row, 'business name', 'name');
      const rawPhone = getCol(row, 'phone');
      const rawCity  = getCol(row, 'city');
      const rawUrl   = getCol(row, 'google maps url', 'google_maps_url', 'url');

      // Skip rows with no business name
      if (!rawName) { skipped++; continue; }

      // Normalize phone
      const phone = normalizePhone(rawPhone, country);

      // Extract PlaceID from Maps URL
      const placeId = extractPlaceId(rawUrl);

      // Skip if neither phone nor placeId — we can't call or match this row
      if (!phone && !placeId) { skipped++; continue; }

      // Get timezone
      const timezone = getCityTimezone(rawCity, country);

      // Build the business record
      const biz = {
        business_name:  rawName,
        country_code:   country,
        phone:          phone,
        google_maps_url: rawUrl ? rawUrl.substring(0, 500) : null, // cap URL length
        place_id:       placeId,
        city:           rawCity,
        timezone:       timezone,
        category:       getCol(row, 'category')?.toLowerCase() || null,
        email:          getCol(row, 'email')?.toLowerCase() || null,
        whatsapp:       getCol(row, 'whatsapp') || null,
        website:        getCol(row, 'website') || null,
        address:        getCol(row, 'address', 'street address') || null,
        instagram:      getCol(row, 'instagram') || null,
        facebook:       getCol(row, 'facebook') || null,
        linkedin:       getCol(row, 'linkedin') || null,
        twitter:        getCol(row, 'twitter') || null,
        rating:         parseFloatSafe(getCol(row, 'rating')),
        reviews:        parseIntSafe(getCol(row, 'reviews', 'reviews count')),
        notes:          getCol(row, 'notes', 'additional notes') || null,
        call_status:    'not_called',
        data_source:    'excel_import',
        scraped_at:     new Date().toISOString(),
      };

      businesses.push(biz);
    }

    console.log(`  Valid: ${businesses.length.toLocaleString()} | Skipped: ${skipped.toLocaleString()}`);
    totalSkipped += skipped;

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would upsert ${businesses.length} rows`);
      console.log(`  Sample:`, JSON.stringify(businesses[0], null, 2));
      continue;
    }

    // Batch upsert — deduplicate within each batch first
    let batchNum = 0;
    for (let i = 0; i < businesses.length; i += BATCH_SIZE) {
      const raw = businesses.slice(i, i + BATCH_SIZE);
      batchNum++;

      // Deduplicate within batch: last occurrence of phone+country wins
      const phoneKey = b => b.phone ? `${b.phone}::${b.country_code}` : null;
      const placeKey = b => b.place_id ? `pid::${b.place_id}` : null;
      const seen = new Map();
      for (const b of raw) {
        const key = phoneKey(b) || placeKey(b) || b.business_name;
        seen.set(key, b); // later entry overwrites earlier
      }
      const batch = Array.from(seen.values());

      process.stdout.write(`\r  Batch ${batchNum}/${Math.ceil(businesses.length/BATCH_SIZE)} (${i+raw.length}/${businesses.length})...`);

      // Split into phone-keyed and placeId-only batches
      const withPhone   = batch.filter(b => b.phone);
      const placeIdOnly = batch.filter(b => !b.phone && b.place_id);

      // Upsert by phone+country
      if (withPhone.length > 0) {
        const { error } = await supabase
          .from('businesses')
          .upsert(withPhone, { onConflict: 'phone,country_code', ignoreDuplicates: false });
        if (error) {
          console.error(`\n  Error batch ${batchNum}:`, error.message);
          totalErrors++;
        } else {
          totalInserted += withPhone.length;
        }
      }

      // Insert placeId-only (no phone) — skip if already exists
      if (placeIdOnly.length > 0) {
        const { error } = await supabase
          .from('businesses')
          .insert(placeIdOnly);
        if (error && !error.message.includes('duplicate') && !error.message.includes('unique')) {
          totalErrors++;
        } else {
          totalInserted += placeIdOnly.length;
        }
      }
    }

    console.log(`\n  ✓ Done`);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`STEP 1 COMPLETE`);
  console.log(`  Inserted/Updated: ${totalInserted.toLocaleString()}`);
  console.log(`  Skipped:          ${totalSkipped.toLocaleString()}`);
  console.log(`  Errors:           ${totalErrors}`);
}

// ─── STEP 2: Process review CSVs into pain point analysis ────────────────────
async function analyzeReviews() {
  console.log('\n' + '═'.repeat(60));
  console.log('STEP 2 — Processing review CSV files');
  console.log('═'.repeat(60));

  // Map: placeId → { businessName, reviews: [] }
  const reviewMap = new Map();

  for (const { file, country } of CSV_FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ File not found: ${file} — skipping`);
      continue;
    }

    console.log(`\n→ ${file}`);
    let lineCount = 0, matched = 0, skipped = 0;

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    let headers = null;
    let lineBuffer = '';

    for await (const rawLine of rl) {
      lineBuffer += rawLine;
      lineCount++;

      if (lineCount === 1) {
        headers = parseCSVLine(lineBuffer);
        lineBuffer = '';
        continue;
      }

      const cols = parseCSVLine(lineBuffer);
      lineBuffer = '';

      if (!cols || cols.length < 3) { skipped++; continue; }

      // CSV structure: business_name, business_url, rating, date, review_text
      const businessName = cols[0]?.trim() || '';
      const businessUrl  = cols[1]?.trim() || '';
      const rating       = cols[2]?.trim() || '';
      const reviewText   = cols[4]?.trim() || '';

      const placeId = extractPlaceId(businessUrl);
      if (!placeId) { skipped++; continue; }

      if (!reviewMap.has(placeId)) {
        reviewMap.set(placeId, { businessName, reviews: [] });
      }

      reviewMap.get(placeId).reviews.push({ rating, text: reviewText });
      matched++;

      if (lineCount % 100000 === 0) {
        process.stdout.write(`\r  Lines: ${lineCount.toLocaleString()} | Unique businesses: ${reviewMap.size.toLocaleString()}`);
      }
    }

    console.log(`\r  Lines: ${lineCount.toLocaleString()} | Unique businesses: ${reviewMap.size.toLocaleString()} | Skipped: ${skipped.toLocaleString()}`);
  }

  console.log(`\n  Total unique PlaceIDs with reviews: ${reviewMap.size.toLocaleString()}`);

  // Run pain point analysis on each business
  console.log('  Running pain point analysis...');
  const analysisMap = new Map();
  let processed = 0;

  for (const [placeId, { businessName, reviews }] of reviewMap) {
    const analysis = extractPainPoints(reviews);
    analysisMap.set(placeId, { businessName, ...analysis });
    processed++;
    if (processed % 1000 === 0) {
      process.stdout.write(`\r  Analyzed: ${processed.toLocaleString()} / ${reviewMap.size.toLocaleString()}`);
    }
  }

  console.log(`\r  Analyzed: ${processed.toLocaleString()} businesses`);

  // Save to a JSON cache file for step 3
  const cachePath = path.join(__dirname, 'review_analysis_cache.json');
  const cacheData = {};
  for (const [placeId, data] of analysisMap) {
    cacheData[placeId] = data;
  }
  fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 0));
  console.log(`  ✓ Analysis cached to scripts/review_analysis_cache.json (${Object.keys(cacheData).length.toLocaleString()} entries)`);

  return analysisMap;
}

// ─── STEP 3: Enrich businesses with pain point data ───────────────────────────
async function enrichBusinesses() {
  console.log('\n' + '═'.repeat(60));
  console.log('STEP 3 — Enriching businesses with pain point data');
  console.log('═'.repeat(60));

  const cachePath = path.join(__dirname, 'review_analysis_cache.json');
  if (!fs.existsSync(cachePath)) {
    console.error('  ✗ No analysis cache found. Run --step=2 first.');
    process.exit(1);
  }

  const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const placeIds  = Object.keys(cacheData);
  console.log(`  ${placeIds.length.toLocaleString()} PlaceIDs in analysis cache`);

  if (DRY_RUN) {
    const sample = placeIds.slice(0, 3);
    sample.forEach(id => console.log(`  Sample: ${id} →`, JSON.stringify(cacheData[id], null, 2)));
    return;
  }

  // Fetch all businesses that have a place_id
  console.log('  Fetching businesses with place_id from database...');
  let allBiz = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, place_id')
      .not('place_id', 'is', null)
      .range(from, from + PAGE - 1);

    if (error) { console.error('  DB error:', error.message); break; }
    if (!data || data.length === 0) break;
    allBiz = allBiz.concat(data);
    from += PAGE;
    process.stdout.write(`\r  Loaded ${allBiz.length.toLocaleString()} businesses with place_id...`);
    if (data.length < PAGE) break;
  }

  console.log(`\r  Loaded ${allBiz.length.toLocaleString()} businesses with place_id`);

  // Match businesses to analysis data
  let matched = 0, unmatched = 0;

  const updateBatch = [];
  for (const biz of allBiz) {
    const analysis = cacheData[biz.place_id];
    if (!analysis) { unmatched++; continue; }

    updateBatch.push({
      id:              biz.id,
      pain_points:     analysis.pain_points || [],
      top_pain_point:  analysis.top_pain_point || null,
      negative_pct:    analysis.negative_pct || 0,
      health_score:    analysis.health_score || null,
      industry_avg_rating: null, // calculated separately
    });
    matched++;
  }

  console.log(`  Matches: ${matched.toLocaleString()} | Unmatched: ${unmatched.toLocaleString()}`);
  console.log(`  Applying updates in batches of ${BATCH_SIZE}...`);

  let batchNum = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < updateBatch.length; i += BATCH_SIZE) {
    const batch = updateBatch.slice(i, i + BATCH_SIZE);
    batchNum++;
    process.stdout.write(`\r  Batch ${batchNum}/${Math.ceil(updateBatch.length/BATCH_SIZE)} (${i+batch.length}/${updateBatch.length})...`);

    // Use upsert with id as the conflict key — much faster than individual updates
    const { error } = await supabase
      .from('businesses')
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });

    if (error) {
      // Fall back to individual updates for this batch
      for (const upd of batch) {
        const { id, ...fields } = upd;
        const { error: ue } = await supabase.from('businesses').update(fields).eq('id', id);
        if (ue) errors++; else updated++;
      }
    } else {
      updated += batch.length;
    }
  }

  console.log(`\n  ✓ Enrichment complete`);
  console.log(`  Updated: ${updated.toLocaleString()} | Errors: ${errors}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseFloatSafe(v) {
  if (!v) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function parseIntSafe(v) {
  if (!v) return null;
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? null : n;
}

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Main entry point ─────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          DentIQ Data Import Pipeline                     ║');
  console.log(`║  Step: ${STEP.padEnd(10)} ${DRY_RUN ? '[DRY RUN]' : '           '} ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!process.env.REACT_APP_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('\n✗ Missing REACT_APP_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    if (STEP === '1' || STEP === 'all') await importLeads();
    if (STEP === '2' || STEP === 'all') await analyzeReviews();
    if (STEP === '3' || STEP === 'all') await enrichBusinesses();
  } catch (err) {
    console.error('\n✗ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✓ Pipeline complete in ${elapsed}s`);
  console.log('═'.repeat(60) + '\n');
}

main();

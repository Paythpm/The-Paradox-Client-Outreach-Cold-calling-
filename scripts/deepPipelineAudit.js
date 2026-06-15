/**
 * deepPipelineAudit.js — Deep analysis of the review import pipeline
 * Finds exactly why reviews aren't matching businesses
 */
'use strict';
const path = require('path');
const fs   = require('fs');
const readline = require('readline');
const XLSX = require('xlsx');
const { normalizePhone } = require('./phoneNormalizer');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function extractPlaceId(url) {
  if (!url) return null;
  const m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  return m ? m[1].toLowerCase() : null;
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║  DEEP PIPELINE AUDIT                          ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  // ── 1. DB state ──────────────────────────────────────────────────────────────
  console.log('=== 1. DATABASE STATE ===');
  const { count: totalBiz } = await supa.from('businesses').select('*',{count:'exact',head:true});
  const { count: withPlace } = await supa.from('businesses').select('*',{count:'exact',head:true}).not('place_id','is',null);
  const { count: noPlace } = await supa.from('businesses').select('*',{count:'exact',head:true}).is('place_id',null);
  const { count: withPhone } = await supa.from('businesses').select('*',{count:'exact',head:true}).not('phone','is',null);
  const { count: withEnrich } = await supa.from('businesses').select('*',{count:'exact',head:true}).not('top_pain_point','is',null);
  const { count: totalReviews } = await supa.from('business_reviews').select('*',{count:'exact',head:true});

  console.log('Total businesses:          ' + totalBiz.toLocaleString());
  console.log('With PlaceID:              ' + withPlace.toLocaleString() + ' (' + Math.round(withPlace/totalBiz*100) + '%)');
  console.log('WITHOUT PlaceID:           ' + noPlace.toLocaleString() + ' ← these CANNOT match reviews');
  console.log('With phone:                ' + withPhone.toLocaleString());
  console.log('With pain point analysis:  ' + withEnrich.toLocaleString());
  console.log('Total review quotes:       ' + totalReviews.toLocaleString());

  // ── 2. Excel file analysis ────────────────────────────────────────────────────
  console.log('\n=== 2. EXCEL FILE ANALYSIS ===');
  const xlFiles = [
    { f: 'master_leads_au_cleaned.xlsx', cc: 'AU' },
    { f: 'master_leads_ca_cleaned.xlsx', cc: 'CA' },
    { f: 'master_leads_uk_cleaned.xlsx', cc: 'UK' },
    { f: 'master_leads_us_cleaned.xlsx', cc: 'US' },
  ];

  for (const { f, cc } of xlFiles) {
    const p = path.join(__dirname, '../../', f);
    if (!fs.existsSync(p)) { console.log(cc + ': file not found'); continue; }
    const wb = XLSX.readFile(p, { cellText: true, raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
    const cols = Object.keys(rows[0] || {});
    const urlCol = cols.find(c => /google|maps|url/i.test(c) && !/twitter|facebook|instagram|linkedin/i.test(c));
    const phoneCol = cols.find(c => c.toLowerCase() === 'phone');

    let hasPlace = 0, noPlace2 = 0, hasPhone = 0, noPhone = 0, invalidPhone = 0;
    for (const row of rows) {
      const url = String(row[urlCol] || '').trim();
      const ph  = String(row[phoneCol] || '').trim();
      extractPlaceId(url) ? hasPlace++ : noPlace2++;
      if (!ph) { noPhone++; continue; }
      normalizePhone(ph, cc) ? hasPhone++ : invalidPhone++;
    }

    console.log('\n' + cc + ' (' + f + '): ' + rows.length.toLocaleString() + ' rows');
    console.log('  Has PlaceID in URL: ' + hasPlace.toLocaleString() + ' | No PlaceID: ' + noPlace2.toLocaleString());
    console.log('  Valid phone: ' + hasPhone.toLocaleString() + ' | No phone: ' + noPhone + ' | Invalid phone: ' + invalidPhone);
    console.log('  URL column used: "' + urlCol + '"');
  }

  // ── 3. CSV review file analysis ───────────────────────────────────────────────
  console.log('\n=== 3. CSV REVIEW FILE MATCH RATE ANALYSIS ===');

  // Load PlaceID map
  const placeIdMap = new Map();
  let from = 0;
  while (true) {
    const { data } = await supa.from('businesses').select('id,place_id').not('place_id','is',null).range(from, from+999);
    if (!data?.length) break;
    data.forEach(b => placeIdMap.set(b.place_id.toLowerCase(), b.id));
    from += 1000;
    if (data.length < 1000) break;
  }
  console.log('PlaceIDs in DB: ' + placeIdMap.size.toLocaleString());

  // Check a sample from each CSV file — how many PlaceIDs match?
  const csvDirs = [
    'phase 4 data maps review',
    'phase 3 data maps review',
    'phase2 data maps review',
  ];

  for (const dir of csvDirs) {
    const dirPath = path.join(__dirname, '../../', dir);
    if (!fs.existsSync(dirPath)) continue;
    const csvFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv'));

    for (const file of csvFiles) {
      const filePath = path.join(dirPath, file);
      let lines = 0, matched = 0, unmatched = 0, noPlaceInCsv = 0;
      const unmatchedSamples = [];

      const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
      for await (const line of rl) {
        lines++;
        if (lines === 1 || lines > 50000) continue; // sample first 50K lines
        const cols = line.split(',');
        const url = (cols[1] || '').trim();
        const placeId = extractPlaceId(url);
        if (!placeId) { noPlaceInCsv++; continue; }
        if (placeIdMap.has(placeId)) { matched++; }
        else {
          unmatched++;
          if (unmatchedSamples.length < 3) unmatchedSamples.push(placeId);
        }
      }

      const sampleLines = Math.min(lines, 50000);
      const matchRate = sampleLines > 0 ? ((matched / (sampleLines - 1)) * 100).toFixed(1) : '0';
      console.log('\n' + dir + '/' + file);
      console.log('  Sampled: ' + sampleLines.toLocaleString() + ' lines | Match rate: ' + matchRate + '% | Matched: ' + matched + ' | Unmatched: ' + unmatched + ' | No PlaceID: ' + noPlaceInCsv);
      if (unmatchedSamples.length > 0) {
        console.log('  Sample unmatched PlaceIDs: ' + unmatchedSamples.join(', '));
      }
    }
  }

  // ── 4. Why businesses have no PlaceID ─────────────────────────────────────────
  console.log('\n=== 4. BUSINESSES WITHOUT PLACE_ID (cannot match reviews) ===');
  const { data: sampleNoPlace } = await supa.from('businesses').select('business_name,city,country_code,google_maps_url').is('place_id',null).limit(10);
  console.log('Sample businesses with no place_id:');
  for (const b of (sampleNoPlace||[])) {
    const hasUrl = b.google_maps_url ? 'HAS URL' : 'NO URL';
    const placeId = extractPlaceId(b.google_maps_url);
    console.log('  ' + b.country_code + ' | ' + b.business_name?.substring(0,40) + ' | ' + hasUrl + ' | PlaceID: ' + (placeId || 'CANNOT EXTRACT'));
  }

  // ── 5. Fix: populate place_id from google_maps_url where missing ──────────────
  console.log('\n=== 5. POTENTIAL FIX: populate place_id from existing google_maps_url ===');
  const { data: fixable } = await supa.from('businesses').select('id,google_maps_url').is('place_id',null).not('google_maps_url','is',null).limit(5);
  let fixableCount = 0;
  for (const b of (fixable||[])) {
    const pid = extractPlaceId(b.google_maps_url);
    if (pid) fixableCount++;
  }
  
  // Count total fixable
  const { count: totalFixable } = await supa.from('businesses').select('*',{count:'exact',head:true}).is('place_id',null).not('google_maps_url','is',null);
  console.log('Businesses with no place_id but HAVE google_maps_url: ' + totalFixable.toLocaleString());
  console.log('→ These can have place_id extracted and populated right now');
  console.log('→ This would dramatically increase review match rate');

  console.log('\n=== AUDIT COMPLETE ===\n');
}

main().catch(console.error);

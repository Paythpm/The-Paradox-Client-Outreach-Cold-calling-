/**
 * reimportMissing.js
 * Re-imports only the rows that are missing from the DB.
 * Uses ONLY phone-keyed upsert — no place_id index involved.
 * Safe to re-run — existing rows just get updated.
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { normalizePhone }  = require('./phoneNormalizer');
const { getCityTimezone } = require('./cityTimezoneMap');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 200;

function extractPlaceId(url) {
  if (!url) return null;
  const m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  return m ? m[1].toLowerCase() : null;
}

function parseFloatSafe(v) { const n = parseFloat(String(v||'').replace(/[^0-9.]/g,'')); return isNaN(n)?null:n; }
function parseIntSafe(v)   { const n = parseInt(String(v||'').replace(/[^0-9]/g,''),10); return isNaN(n)?null:n; }

const DATA_DIR = path.join(__dirname, '../..');

const FILES = [
  { file: 'master_leads_us_cleaned.xlsx', country: 'US' },
  { file: 'master_leads_au_cleaned.xlsx', country: 'AU' },
  { file: 'master_leads_ca_cleaned.xlsx', country: 'CA' },
  { file: 'master_leads_uk_cleaned.xlsx', country: 'UK' },
];

async function reimport() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║  Re-import Missing Businesses (phone-keyed)   ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  for (const { file, country } of FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) { console.log('⚠ Not found:', file); continue; }

    console.log(`\n→ ${country}: ${file}`);

    // 1. Load all existing phones from DB for this country
    process.stdout.write('  Loading existing DB phones...');
    const existing = new Set();
    let from = 0;
    while (true) {
      const { data } = await supabase.from('businesses').select('phone').eq('country_code', country).not('phone','is',null).range(from, from + 999);
      if (!data?.length) break;
      data.forEach(r => existing.add(r.phone));
      from += 1000;
      if (data.length < 1000) break;
    }
    console.log(' ' + existing.size.toLocaleString() + ' in DB');

    // 2. Parse Excel
    const wb = XLSX.readFile(filePath, { cellText: true, raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

    // 3. Deduplicate Excel rows by phone (last wins)
    const excelMap = new Map(); // phone -> row
    for (const row of rows) {
      const rawPhone = String(row['Phone'] || row['phone'] || '').trim();
      const phone = normalizePhone(rawPhone, country);
      if (!phone) continue;
      const name = String(row['Business Name'] || row['business_name'] || row['name'] || '').trim();
      if (!name) continue;
      excelMap.set(phone, { ...row, _phone: phone, _name: name });
    }

    // 4. Find missing
    const missing = [];
    for (const [phone, row] of excelMap) {
      if (!existing.has(phone)) missing.push({ phone, row });
    }
    console.log('  Excel unique phones:', excelMap.size.toLocaleString(), '| Missing from DB:', missing.length.toLocaleString());

    if (missing.length === 0) { console.log('  ✓ All rows already in DB'); continue; }

    // 5. Build business objects for missing rows
    const businesses = missing.map(({ phone, row }) => {
      const city = String(row['City'] || row['city'] || '').trim() || null;
      const getCol = (...names) => {
        for (const n of names) {
          const keys = Object.keys(row);
          const match = keys.find(k => k.toLowerCase().trim() === n.toLowerCase());
          if (match && row[match] !== null && row[match] !== undefined) return String(row[match]).trim() || null;
        }
        return null;
      };

      return {
        business_name:  row._name,
        country_code:   country,
        phone,
        google_maps_url: getCol('google maps url', 'google_maps_url') || null,
        place_id:       extractPlaceId(getCol('google maps url', 'google_maps_url')),
        city,
        timezone:       getCityTimezone(city, country),
        category:       getCol('category')?.toLowerCase() || null,
        email:          getCol('email')?.toLowerCase() || null,
        whatsapp:       getCol('whatsapp') || null,
        website:        getCol('website') || null,
        address:        getCol('street address', 'address') || null,
        instagram:      getCol('instagram') || null,
        facebook:       getCol('facebook') || null,
        linkedin:       getCol('linkedin') || null,
        twitter:        getCol('twitter') || null,
        rating:         parseFloatSafe(getCol('rating')),
        reviews:        parseIntSafe(getCol('reviews', 'reviews count')),
        notes:          getCol('notes', 'additional notes') || null,
        call_status:    'not_called',
        data_source:    'excel_import',
        scraped_at:     new Date().toISOString(),
      };
    });

    // 6. Upsert in batches — phone+country conflict only, NO place_id
    let inserted = 0, errors = 0;
    const totalBatches = Math.ceil(businesses.length / BATCH_SIZE);

    for (let i = 0; i < businesses.length; i += BATCH_SIZE) {
      const batch = businesses.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      process.stdout.write(`\r  Batch ${batchNum}/${totalBatches} (${i + batch.length}/${businesses.length})...`);

      // Strip place_id to avoid the unique index issue entirely
      const batchClean = batch.map(b => {
        const { place_id, ...rest } = b;
        return rest;
      });

      const { error } = await supabase
        .from('businesses')
        .upsert(batchClean, { onConflict: 'phone,country_code', ignoreDuplicates: false });

      if (error) {
        console.error(`\n  Error batch ${batchNum}: ${error.message}`);
        errors++;
        // Try individual inserts for this batch
        for (const b of batchClean) {
          const { error: e2 } = await supabase.from('businesses').upsert([b], { onConflict: 'phone,country_code' });
          if (!e2) inserted++;
          else errors++;
        }
      } else {
        inserted += batch.length;
      }
    }

    console.log(`\n  ✓ Inserted/updated: ${inserted.toLocaleString()} | Errors: ${errors}`);
  }

  // Final count
  console.log('\n═══ FINAL COUNTS ═══');
  for (const cc of ['US','AU','CA','UK']) {
    const { count } = await supabase.from('businesses').select('*',{count:'exact',head:true}).eq('country_code',cc);
    console.log(cc + ':', count?.toLocaleString());
  }
  const { count: total } = await supabase.from('businesses').select('*',{count:'exact',head:true});
  console.log('Total:', total?.toLocaleString());
}

reimport().catch(console.error);

import * as XLSX from 'xlsx';
import supabase from '../lib/supabase';

const BATCH_SIZE = 500;

// Normalize a header name for loose matching
function normalizeHeader(h) {
  return (h || '').toLowerCase().replace(/[\s_\-().]+/g, '');
}

// All recognized column name variants → database field name
const COLUMN_MAP = {
  // business identity
  businessname: 'business_name',
  name: 'business_name',
  business: 'business_name',
  clinicname: 'business_name',
  practicename: 'business_name',

  // contact
  category: 'category',
  type: 'category',
  speciality: 'category',
  specialty: 'category',
  city: 'city',
  suburb: 'city',
  town: 'city',
  phone: 'phone',
  phonenumber: 'phone',
  mobile: 'phone',
  contactnumber: 'phone',
  email: 'email',
  emailaddress: 'email',
  whatsapp: 'whatsapp',
  website: 'website',
  websiteurl: 'website',

  // social
  instagram: 'instagram',
  instagramurl: 'instagram',
  linkedin: 'linkedin',
  linkedinurl: 'linkedin',
  facebook: 'facebook',
  facebookurl: 'facebook',
  twitter: 'twitter',
  twitterurl: 'twitter',

  // location
  address: 'address',
  fulladdress: 'address',
  streetaddress: 'address',
  googlemapsurl: 'google_maps_url',
  googlemaps: 'google_maps_url',
  mapsurl: 'google_maps_url',
  maplink: 'google_maps_url',
  url: 'google_maps_url',

  // review data
  rating: 'rating',
  googlerating: 'rating',
  starrating: 'rating',
  reviews: 'reviews',
  reviewcount: 'reviews',
  numberofreviews: 'reviews',
  totalreviews: 'reviews',
  notes: 'notes',
  comments: 'notes',

  // pain point / analysis data (second file scenario)
  painpoints: 'pain_points',
  pain_points: 'pain_points',
  toppainpoint: 'top_pain_point',
  top_pain_point: 'top_pain_point',
  mainissue: 'top_pain_point',
  negativepct: 'negative_pct',
  negative_pct: 'negative_pct',
  negativereviewpct: 'negative_pct',
  negativepercent: 'negative_pct',
  healthscore: 'health_score',
  health_score: 'health_score',
  score: 'health_score',
  industryavgrating: 'industry_avg_rating',
  industryaverage: 'industry_avg_rating',
  industryratingavg: 'industry_avg_rating',
  avgrating: 'industry_avg_rating',
};

// Numeric fields that need parsing
const NUMERIC_FLOAT_FIELDS = new Set(['rating', 'negative_pct', 'industry_avg_rating']);
const NUMERIC_INT_FIELDS = new Set(['reviews', 'health_score']);
// JSON fields (arrays/objects stored as strings in Excel)
const JSON_FIELDS = new Set(['pain_points']);

function cleanValue(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === '' || s.toLowerCase() === 'nan' || s.toLowerCase() === 'none' || s.toLowerCase() === 'null') return null;
  return s;
}

function parseField(field, rawVal) {
  const cleaned = cleanValue(rawVal);
  if (cleaned === null) return null;

  if (NUMERIC_FLOAT_FIELDS.has(field)) return parseFloat(cleaned) || null;
  if (NUMERIC_INT_FIELDS.has(field)) return parseInt(cleaned, 10) || null;
  if (JSON_FIELDS.has(field)) {
    try { return JSON.parse(cleaned); } catch { return null; }
  }
  if (field === 'email') return cleaned.toLowerCase();
  if (field === 'category') return cleaned.toLowerCase();
  return cleaned;
}

/**
 * Run a migration from an Excel file into the businesses table.
 *
 * Smart merge behaviour:
 *   - Only columns present in the file are sent to Supabase.
 *   - Null values are NEVER sent — they will not overwrite existing data.
 *   - So you can safely run File 1 (10 cols) then File 2 (4 cols) and the
 *     rows will be progressively filled in without clobbering anything.
 *
 * @param {File}     file        Browser File object (.xlsx)
 * @param {string}   countryCode 'AU' | 'CA' | 'UK'
 * @param {Function} onProgress  Optional callback({ current, processed, batch })
 * @param {object}   options     { mode: 'insert_only' | 'update_only' | 'upsert' (default) }
 */
export async function runMigration(file, countryCode, onProgress, options = {}) {
  const mode = options.mode || 'upsert'; // upsert = insert new + update existing

  const result = {
    success: false,
    totalRows: 0,
    inserted: 0,
    updated: 0,
    skippedNoPhone: 0,
    skippedNoName: 0,
    duplicates: 0,
    errors: 0,
    errorDetails: [],
    columnsDetected: [],
  };

  try {
    // ── STEP 1: Parse Excel ─────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rawRows.length < 2) {
      result.errorDetails.push('File appears empty or has no data rows');
      return result;
    }

    // ── STEP 2: Detect which columns are in this file ───────────────
    const headerRow = rawRows[0].map(h => normalizeHeader(h));
    const colIndex = {}; // dbField → column index in this file

    headerRow.forEach((h, i) => {
      const dbField = COLUMN_MAP[h];
      if (dbField && !(dbField in colIndex)) {
        colIndex[dbField] = i;
      }
    });

    result.columnsDetected = Object.keys(colIndex);

    // phone is always required to identify the row
    if (!colIndex['phone'] && !colIndex['business_name']) {
      result.errorDetails.push(
        'File must have at least a "phone" column (to match existing rows) ' +
        'or "business_name" + "phone" (to insert new rows). ' +
        'Detected headers: ' + rawRows[0].join(', ')
      );
      return result;
    }

    const isUpdateFile = colIndex['phone'] && !colIndex['business_name'];
    const dataRows = rawRows.slice(1);
    result.totalRows = dataRows.length;

    // ── STEP 3: Build row objects — only include present columns ────
    const businesses = [];

    for (const row of dataRows) {
      const get = (field) => {
        const idx = colIndex[field];
        return idx !== undefined ? parseField(field, row[idx]) : undefined; // undefined = not in file
      };

      const phone = get('phone');
      if (!phone) {
        result.skippedNoPhone++;
        continue;
      }

      // For pure update files, business_name is optional
      const business_name = get('business_name');
      if (!isUpdateFile && !business_name) {
        result.skippedNoName++;
        continue;
      }

      // Build the row — ONLY include fields that exist in this file AND have a real value
      const bizRow = { phone, country_code: countryCode };

      for (const [dbField, colIdx] of Object.entries(colIndex)) {
        if (dbField === 'phone') continue; // already added
        const val = parseField(dbField, row[colIdx]);
        if (val !== null && val !== undefined) {
          bizRow[dbField] = val;
        }
        // If val is null, we deliberately skip it — don't overwrite good data with null
      }

      // Only set these defaults when inserting brand new rows
      if (!isUpdateFile) {
        bizRow.scraped_at = bizRow.scraped_at || new Date().toISOString();
        bizRow.data_source = bizRow.data_source || 'excel_import';
        bizRow.call_status = bizRow.call_status || 'not_called';
      }

      businesses.push(bizRow);
    }

    if (businesses.length === 0) {
      result.errorDetails.push('No valid rows found after filtering. Check phone column exists and has data.');
      return result;
    }

    // ── STEP 4: Batch upsert ────────────────────────────────────────
    const totalBatches = Math.ceil(businesses.length / BATCH_SIZE);

    for (let i = 0; i < businesses.length; i += BATCH_SIZE) {
      const batch = businesses.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      if (onProgress) {
        onProgress({
          current: `${countryCode} — Batch ${batchNum}/${totalBatches} (${mode})`,
          processed: i + batch.length,
          batch: batchNum,
        });
      }

      // Track which phones already exist (for reporting only)
      const phones = batch.map(b => b.phone).filter(Boolean);
      const { data: existingData } = await supabase
        .from('businesses')
        .select('phone')
        .in('phone', phones)
        .eq('country_code', countryCode);

      const existingPhones = new Set((existingData || []).map(e => e.phone));
      const newInBatch = batch.filter(b => !existingPhones.has(b.phone)).length;
      const updatedInBatch = batch.filter(b => existingPhones.has(b.phone)).length;

      result.duplicates += updatedInBatch;

      let error;

      if (mode === 'insert_only') {
        // Only insert rows that don't exist yet
        const newRows = batch.filter(b => !existingPhones.has(b.phone));
        if (newRows.length > 0) {
          ({ error } = await supabase.from('businesses').insert(newRows));
          if (!error) result.inserted += newRows.length;
        }

      } else if (mode === 'update_only') {
        // Only update rows that already exist — never create new ones
        for (const row of batch) {
          if (!existingPhones.has(row.phone)) continue;
          const { phone, country_code, ...updates } = row;
          const { error: updateErr } = await supabase
            .from('businesses')
            .update(updates)
            .eq('phone', phone)
            .eq('country_code', country_code);
          if (updateErr) {
            result.errors++;
            result.errorDetails.push(`Update ${phone}: ${updateErr.message}`);
          } else {
            result.updated++;
          }
        }

      } else {
        // Default: upsert — insert new, update existing, never overwrite with null
        ({ error } = await supabase
          .from('businesses')
          .upsert(batch, {
            onConflict: 'phone,country_code',
            ignoreDuplicates: false, // false = update existing rows
          }));

        if (!error) {
          result.inserted += newInBatch;
          result.updated += updatedInBatch;
        }
      }

      if (error) {
        result.errors++;
        result.errorDetails.push(`Batch ${batchNum}: ${error.message}`);
      }
    }

    result.success = result.errors === 0;

  } catch (err) {
    result.errors++;
    result.errorDetails.push(`Fatal error: ${err.message}`);
  }

  return result;
}

-- ═══════════════════════════════════════════════════════════════════
-- DentIQ Schema Patch 002 — Run AFTER schema_patch_001.sql
-- Adds place_id and timezone columns needed by the import pipeline
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Add place_id column ───────────────────────────────────────────
-- Stores the stable Google Maps Place ID (0xABC:0xDEF format)
-- Used as a reliable join key between master leads and review data
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS place_id TEXT;

-- Unique index on place_id (allows NULL, enforces uniqueness for non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_place_id
  ON businesses(place_id)
  WHERE place_id IS NOT NULL;

-- Fast lookup index for enrichment queries
CREATE INDEX IF NOT EXISTS idx_businesses_place_id_lookup
  ON businesses(place_id)
  WHERE place_id IS NOT NULL;

-- ── 2. Add timezone column ───────────────────────────────────────────
-- Stores the IANA timezone for the business (e.g. 'America/New_York')
-- Derived from city+country at import time, used for calling hours
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS timezone TEXT;

-- ── 3. Populate timezone from existing city+country data ────────────
-- For any existing rows that already have city data, we can't easily
-- compute timezone in SQL, so the import pipeline will handle this.
-- For now just ensure the column exists.

-- ── 4. Update RLS — authenticated users can read new columns ────────
-- RLS policies already cover SELECT/UPDATE on businesses table,
-- no new policies needed since we're adding columns not tables.

-- ── 5. Grant to service_role (for pipeline script) ──────────────────
-- Service role already bypasses RLS so no explicit grant needed.
-- This is just documentation.

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'businesses' AND column_name IN ('place_id','timezone');

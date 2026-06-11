-- ═══════════════════════════════════════════════════════════════════
-- DentIQ Schema Patch 003 — business_reviews table
-- Stores curated negative review quotes for the Quotes tab
-- Run AFTER schema_patch_002.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── Table: business_reviews ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  place_id      TEXT NOT NULL,          -- Google Maps Place ID (join key)
  rating        NUMERIC(2,1),           -- 1.0 – 5.0
  review_text   TEXT NOT NULL,          -- actual review content (truncated to 500 chars)
  pain_category TEXT,                   -- detected pain category (may be null)
  review_date   TEXT,                   -- raw date string from scrape ("3 months ago" etc)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_reviews_business_id
  ON business_reviews(business_id);

CREATE INDEX IF NOT EXISTS idx_reviews_place_id
  ON business_reviews(place_id);

CREATE INDEX IF NOT EXISTS idx_reviews_pain_category
  ON business_reviews(pain_category)
  WHERE pain_category IS NOT NULL;

-- RLS — authenticated users can read reviews
ALTER TABLE business_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read reviews"
  ON business_reviews FOR SELECT
  USING (auth.role() = 'authenticated');

-- Verify:
-- SELECT count(*) FROM business_reviews;

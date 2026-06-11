-- ═══════════════════════════════════════════════════════════════════
-- DentIQ Schema Patch 004 — Phase 3 Upgrades
-- Run in Supabase SQL Editor after schema_patch_003.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Contact name on businesses ───────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS contact_name TEXT;

COMMENT ON COLUMN businesses.contact_name IS
  'Optional: first name of owner/manager — used to personalise AI scripts';

CREATE INDEX IF NOT EXISTS idx_businesses_contact_name
  ON businesses(contact_name) WHERE contact_name IS NOT NULL;

-- ── 2. Script variant system on ai_scripts ───────────────────────────
ALTER TABLE ai_scripts
  ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'primary'
    CHECK (variant IN ('primary', 'alternative')),
  ADD COLUMN IF NOT EXISTS variant_angle TEXT,
  ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_converted INTEGER DEFAULT 0;

-- Conversion rate as generated column (Postgres 12+)
ALTER TABLE ai_scripts
  ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC(5,2)
    GENERATED ALWAYS AS (
      CASE WHEN times_used > 0
        THEN ROUND((times_converted::numeric / times_used) * 100, 2)
        ELSE NULL
      END
    ) STORED;

-- Allow one active primary AND one active alternative per business
DROP INDEX IF EXISTS idx_ai_scripts_business;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_scripts_active_variant
  ON ai_scripts(business_id, variant) WHERE is_active = true;

-- ── 3. Script variant tracking on call_logs ──────────────────────────
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS ai_script_variant TEXT DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS ai_script_id UUID REFERENCES ai_scripts(id);

-- ── 4. Atomic increment RPC for script usage ─────────────────────────
CREATE OR REPLACE FUNCTION increment_script_usage(
  p_script_id UUID,
  p_converted BOOLEAN DEFAULT false
) RETURNS void AS $$
BEGIN
  UPDATE ai_scripts
  SET
    times_used      = times_used + 1,
    times_converted = times_converted + CASE WHEN p_converted THEN 1 ELSE 0 END
  WHERE id = p_script_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_script_usage(UUID, BOOLEAN) TO service_role;

-- ── 5. Script tier detection SQL function (optional, for analytics) ──
CREATE OR REPLACE FUNCTION get_script_tier(
  p_rating NUMERIC,
  p_neg_pct NUMERIC,
  p_health_score INTEGER
) RETURNS TEXT AS $$
BEGIN
  IF p_rating >= 4.8 AND p_neg_pct <= 8 AND p_health_score >= 85 THEN
    RETURN 'elite';
  ELSIF p_rating >= 4.0 AND p_neg_pct <= 20 AND p_health_score >= 60 THEN
    RETURN 'grow';
  ELSIF p_rating >= 3.0 AND p_neg_pct <= 50 AND p_health_score >= 35 THEN
    RETURN 'improve';
  ELSE
    RETURN 'rescue';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Verify ───────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name IN ('businesses','ai_scripts','call_logs')
--   AND column_name IN ('contact_name','variant','times_used','conversion_rate','ai_script_id');

-- ═══════════════════════════════════════════════════════════════════
-- DentIQ Schema Patch 001 — Run AFTER schema.sql
-- Adds missing functions, constraints, and columns
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. ATOMIC GROQ USAGE INCREMENT ──────────────────────────────────
-- Called by the groq-key-manager edge function to safely increment
-- calls_today and tokens_today without race conditions

CREATE OR REPLACE FUNCTION increment_groq_usage(p_key_id UUID, p_tokens INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE groq_keys
  SET
    calls_today       = calls_today + 1,
    tokens_today      = tokens_today + p_tokens,
    last_used_at      = NOW(),
    consecutive_errors = 0
  WHERE id = p_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. ATOMIC GROQ ERROR INCREMENT WITH AUTO-DEACTIVATION ───────────
-- Increments consecutive_errors and deactivates key if threshold reached

CREATE OR REPLACE FUNCTION increment_groq_errors(p_key_id UUID, p_threshold INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE groq_keys
  SET
    consecutive_errors = consecutive_errors + 1,
    is_active = CASE
      WHEN consecutive_errors + 1 >= p_threshold THEN false
      ELSE is_active
    END
  WHERE id = p_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. UNIQUE CONSTRAINT FOR MIGRATION UPSERT ───────────────────────
-- The migrationRunner.js uses upsert with onConflict: 'phone, country_code'
-- This requires a real unique constraint (not just an index)

ALTER TABLE businesses
  ADD CONSTRAINT businesses_phone_country_unique UNIQUE (phone, country_code);

-- ── 4. TWILIO STATUS FIELDS ON CALL_LOGS ────────────────────────────
-- The twilio-status-callback edge function tracks live call state

ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS call_status TEXT DEFAULT 'initiated';

-- Friendly index for looking up calls by Twilio SID quickly
-- (twilio_call_sid index may already exist via UNIQUE constraint — safe to skip if so)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'call_logs' AND indexname = 'idx_call_logs_twilio_sid'
  ) THEN
    CREATE INDEX idx_call_logs_twilio_sid ON call_logs(twilio_call_sid)
      WHERE twilio_call_sid IS NOT NULL;
  END IF;
END $$;

-- ── 5. GRANT EXECUTE ON NEW FUNCTIONS TO SERVICE ROLE ───────────────
GRANT EXECUTE ON FUNCTION increment_groq_usage(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION increment_groq_errors(UUID, INTEGER) TO service_role;

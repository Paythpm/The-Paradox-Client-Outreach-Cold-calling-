-- ═══════════════════════════════════════════════════════════════════
-- DentIQ — Patch 006: Add 'meeting_booked' to the call_outcome enum
-- Run this in: Supabase Dashboard > SQL Editor > New Query
--
-- WHY: The CallPanel offers a "📅 Book Meeting" outcome whose key is
-- 'meeting_booked', but the call_outcome enum never included that value.
-- Saving that outcome threw "invalid input value for enum call_outcome",
-- so the entire Save & Continue failed and no status/meeting was recorded.
-- ═══════════════════════════════════════════════════════════════════

ALTER TYPE call_outcome ADD VALUE IF NOT EXISTS 'meeting_booked';

-- Verify:
-- SELECT unnest(enum_range(NULL::call_outcome));

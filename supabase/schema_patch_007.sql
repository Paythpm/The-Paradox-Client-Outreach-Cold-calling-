-- ═══════════════════════════════════════════════════════════════════
-- DentIQ — Patch 007: Atomic lead locking
-- Run this in: Supabase Dashboard > SQL Editor > New Query
--
-- WHY: With multiple agents calling concurrently, two agents could open and
-- call the same business. The previous useBusinessLock hook did a SELECT then a
-- separate UPDATE (check-then-act) which races. These functions claim the lock
-- in a SINGLE atomic conditional UPDATE, so exactly one agent can hold a lead.
--
-- A lock is considered free if: nobody holds it, the caller already holds it,
-- or the existing lock is stale (older than 10 minutes — covers crashes / closed
-- tabs where release never ran).
--
-- SECURITY DEFINER is required so the function can (a) update businesses despite
-- RLS and (b) read another caller's full_name (patch 005 restricts callers reads
-- to own-or-admin).
-- ═══════════════════════════════════════════════════════════════════

-- ── try_lock_business ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION try_lock_business(p_business_id UUID, p_caller_id UUID)
RETURNS TABLE(acquired BOOLEAN, locked_by UUID, locked_by_name TEXT, locked_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale TIMESTAMPTZ := now() - interval '10 minutes';
  v_locked_at TIMESTAMPTZ;
  v_holder UUID;
BEGIN
  IF p_business_id IS NULL OR p_caller_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Atomic claim: succeeds only if free, already ours, or stale.
  UPDATE businesses b
     SET locked_by = p_caller_id, locked_at = now()
   WHERE b.id = p_business_id
     AND (b.locked_by IS NULL OR b.locked_by = p_caller_id OR b.locked_at < v_stale)
  RETURNING b.locked_at INTO v_locked_at;

  IF FOUND THEN
    RETURN QUERY SELECT true, p_caller_id, NULL::TEXT, v_locked_at;
  ELSE
    -- Held by someone else — report the current holder.
    SELECT b.locked_by, b.locked_at INTO v_holder, v_locked_at
      FROM businesses b WHERE b.id = p_business_id;
    RETURN QUERY
      SELECT false, v_holder,
             (SELECT c.full_name FROM callers c WHERE c.id = v_holder),
             v_locked_at;
  END IF;
END;
$$;

-- ── release_business_lock ────────────────────────────────────────────
-- Only releases if the caller actually owns the lock (never steals).
CREATE OR REPLACE FUNCTION release_business_lock(p_business_id UUID, p_caller_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE businesses
     SET locked_by = NULL, locked_at = NULL
   WHERE id = p_business_id AND locked_by = p_caller_id;
$$;

GRANT EXECUTE ON FUNCTION try_lock_business(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION release_business_lock(UUID, UUID) TO authenticated;

-- Verify:
-- SELECT * FROM try_lock_business('<some-business-uuid>', auth.uid());

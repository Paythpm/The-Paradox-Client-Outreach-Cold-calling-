-- ═══════════════════════════════════════════════════════════════════
-- DentIQ — Patch 005: Role-based access control (server-enforced)
-- Run this entire file in: Supabase Dashboard > SQL Editor > New Query
--
-- WHY: Admin was previously determined only in the browser (hardcoded email
-- list). RLS treated every authenticated user identically, so an agent could
-- read other agents' call logs / meetings and pull team data via the API.
-- This patch moves the admin flag into the database and tightens RLS so agents
-- can only see their OWN activity. Admins keep full visibility.
--
-- NOTE: Business lead data (businesses / business_reviews / ai_scripts) stays
-- readable by all authenticated users on purpose — agents must see leads to
-- call them. The UI export controls remain admin-only.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Role column on callers ───────────────────────────────────────
ALTER TABLE callers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'agent'
  CHECK (role IN ('admin', 'agent'));

-- Seed the two owner accounts as admins (idempotent)
UPDATE callers SET role = 'admin'
  WHERE email IN ('ramakantsharma2103@gmail.com', 'ramakantkaus@gmail.com');

-- ── 2. is_admin() helper ─────────────────────────────────────────────
-- SECURITY DEFINER so it bypasses RLS on `callers` (avoids infinite
-- recursion when used inside callers' own policies). STABLE + fixed
-- search_path for safety.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM callers
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- ── 3. call_logs — agents see only their own, admins see all ─────────
DROP POLICY IF EXISTS "Authenticated can read call_logs" ON call_logs;
CREATE POLICY "Read own or admin call_logs"
  ON call_logs FOR SELECT
  USING (auth.uid() = caller_id OR is_admin());

DROP POLICY IF EXISTS "Authenticated can insert call_logs" ON call_logs;
CREATE POLICY "Insert own call_logs"
  ON call_logs FOR INSERT
  WITH CHECK (auth.uid() = caller_id OR is_admin());

DROP POLICY IF EXISTS "Authenticated can update own call_logs" ON call_logs;
CREATE POLICY "Update own or admin call_logs"
  ON call_logs FOR UPDATE
  USING (auth.uid() = caller_id OR is_admin());

-- ── 4. meetings — agents see only meetings they booked ───────────────
DROP POLICY IF EXISTS "Authenticated can read meetings" ON meetings;
CREATE POLICY "Read own or admin meetings"
  ON meetings FOR SELECT
  USING (auth.uid() = booked_by OR is_admin());

DROP POLICY IF EXISTS "Authenticated can insert meetings" ON meetings;
CREATE POLICY "Insert own meetings"
  ON meetings FOR INSERT
  WITH CHECK (auth.uid() = booked_by OR is_admin());

DROP POLICY IF EXISTS "Authenticated can update meetings" ON meetings;
CREATE POLICY "Update own or admin meetings"
  ON meetings FOR UPDATE
  USING (auth.uid() = booked_by OR is_admin());

-- ── 5. callers — agents see only their own record, admins see all ────
DROP POLICY IF EXISTS "Authenticated can read callers" ON callers;
CREATE POLICY "Read own or admin callers"
  ON callers FOR SELECT
  USING (auth.uid() = id OR is_admin());

-- (Existing "Callers can update own record" policy is unchanged.)

-- ── 6. Verify ────────────────────────────────────────────────────────
-- SELECT email, role FROM callers ORDER BY role;
-- SELECT is_admin();  -- run while authenticated as each account to confirm

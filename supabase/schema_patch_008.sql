-- ═══════════════════════════════════════════════════════════════════
-- DentIQ — Patch 008: Seed the second admin account
-- Run this in: Supabase Dashboard > SQL Editor > New Query
--
-- WHY: The audit found only ramakantkaus@gmail.com was seeded as admin.
-- ramakantsharma2103@gmail.com was still 'agent' (or had no callers row).
-- This makes it admin if the row exists. If that account has never logged in,
-- a callers row won't exist yet — re-run this after its first login.
-- ═══════════════════════════════════════════════════════════════════

UPDATE callers SET role = 'admin'
  WHERE email = 'ramakantsharma2103@gmail.com';

-- Verify both owners are admins:
-- SELECT email, role FROM callers WHERE role = 'admin' ORDER BY email;

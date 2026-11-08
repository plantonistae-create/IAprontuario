-- G15 — TEMPLATE NOT EXECUTED / NOT APPROVED.
-- Do not run this on a hosted database without a NEW, EXPLICIT authorization.
-- Generic public PostgreSQL catalog names ONLY: NO project-specific RPC IDs,
-- no real ACL results, no function bodies, no data-table reads, no PHI.
-- Phase A: review the first two read-only SELECT statements in a PRIVATE
-- authorized session. Operator MUST inspect output only in private storage.
-- Postgres transaction mode is read-only, but it is NOT an authorization.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';

-- A1: count candidates in the public schema; stop if more than 250.
-- Security Advisor findings can include other schemas, which are OUT OF SCOPE.
SELECT
  COUNT(*)::integer AS candidate_public_definer_routines,
  COUNT(*) <= 250 AS within_explicit_review_cap
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND (
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
  );

-- G16.3 SAFETY CORRECTION: THIS FILE NOW CONTAINS A1 ONLY.
-- A2 moved into separate catalog-phase-a2.G16-NOT-AUTHORIZED.sql.
-- STOP after A1. Do not execute A2 unless separately approved and the
-- private A1 result passes phase-a-count-gate.G16-REVIEW-ONLY.mjs.
-- A1 output is not evidence of tenant auth, privileged reachability, or GO.

ROLLBACK;
-- No A2 included here. Not authorized to execute any hosted SQL.

-- NEXA P0 / Gate C — REVIEW ONLY, NOT APPLIED.
--
-- Exact hosted function definition retrieved from pg_catalog:
--   public.get_audit_queue(queue_status text DEFAULT 'pending')
--   RETURNS TABLE(id uuid, status text, submitted_at timestamptz,
--     deidentified_fields jsonb, reviewed_fields jsonb,
--     review_note text, reviewed_at timestamptz).
-- Hosted function owner: postgres; SECURITY DEFINER; SET search_path=public.
-- Hosted ACL includes PUBLIC/anon/authenticated/service_role EXECUTE.
-- Its original predicate checks public.nexa_is_reviewer() but lacks a
-- source-owner filter. It returns audit-case clinical information.
--
-- Frontend callers at PR #177 starting HEAD c52b84bef011ac00af11d7da1801f5d017f8943d:
--   nexa-auditor-panel-queue-v18.9.2.js
--   nexa-auditor-functional-v18.9.1.js
-- Both invoke rpc('get_audit_queue',{queue_status:null}).
--
-- CANDIDATE BEHAVIOR:
-- * Preserve identity, arguments, defaults, return fields and ordering.
-- * Preserve the EXISTING reviewer predicate; additionally require current
--   active clinical access and matching authenticated actor.
-- * Require BOTH owner of the consultation and original audit submitter.
-- * SECURITY INVOKER means no postgres privilege/RLS bypass for table reads.
-- * No client-supplied doctor/tenant identity, authorization, or delegation.
-- * No SELECT/GRANT/policy changes. Because authenticated direct SELECT on
--   audit_cases is currently denied, this candidate is expected to fail
--   closed when called until separately approved owner-only RLS/ACL exist.
-- * Existing PUBLIC/anon EXECUTE ACL is explicitly NOT changed here.
-- * Exact current nexa_is_reviewer() implementation not reverified in this
--   task. This candidate does not attest to it or to effective anonymity.
-- * No consent, final physician ACK or pre-egress authorizations proven.
--
-- HARD STOP: an unconditional exception inside BEGIN aborts the transaction
-- before any definition could be created. Never delete this guard in Draft.
BEGIN;
DO $nexa_legacy_queue_stop$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE='42501',
    MESSAGE='STOP_NOT_AUTHORIZED_FOR_SQL_OR_DEPLOY';
END
$nexa_legacy_queue_stop$;

CREATE OR REPLACE FUNCTION public.get_audit_queue(queue_status text DEFAULT 'pending'::text)
RETURNS TABLE(
  id uuid,
  status text,
  submitted_at timestamp with time zone,
  deidentified_fields jsonb,
  reviewed_fields jsonb,
  review_note text,
  reviewed_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $nexa_owner_only_queue$
  SELECT a.id,
         a.status,
         a.submitted_at,
         a.deidentified_fields,
         a.reviewed_fields,
         a.review_note,
         a.reviewed_at
  FROM public.audit_cases AS a
  WHERE auth.uid() IS NOT NULL
    AND public.nexa_is_reviewer()
    AND coalesce(public.has_active_clinical_access(), false)
    AND a.submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.consultation_history AS source
      WHERE source.encounter_id = a.source_consultation_id
        AND source.user_id = auth.uid()
    )
    AND (queue_status IS NULL OR a.status = queue_status)
  ORDER BY a.submitted_at ASC;
$nexa_owner_only_queue$;

-- Never execute. No new permissions, roles, RLS/ACL, CI or deploy.
-- C01-C10 / N01-N09: NOT_RUN. Gate C: NO-GO 0/19.
COMMIT;

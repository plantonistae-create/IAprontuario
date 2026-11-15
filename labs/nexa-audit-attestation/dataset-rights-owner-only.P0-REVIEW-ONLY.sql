-- NEXA Gate C / P0 — REVIEW-ONLY; NOT A DEPLOYABLE MIGRATION.
-- Function source (versioned): supabase/migrations/20261017140000_nexa_core_commercial_dataset_rights_gate.sql
-- Source Git blob SHA: 74c2169077a44159684ab3f971f9e99abbd17d00
-- Existing function: SECURITY DEFINER and admin-only, but no source-owner
-- or audit-submitter checks before rights approval. This candidate replaces
-- only this function, without granting or modifying rights/RLS/ACL.
--
-- Owner-only candidate: authenticated active clinical physician + admin
-- AND both server-authoritative links (audit_cases.submitted_by and
-- consultation_history.user_id via UNIQUE encounter_id) must match actor.
-- Lock case, source and core rows before any subsequent approval upsert.
-- Missing, NULL-owner or foreign cases fail closed indistinguishably.
-- Retains audited status / core quality, mandatory deidentification for
-- approval, documented rights reference and policy version checks.
-- No claim that policy/version values are independently verified, that
-- consent or physician ACK exists, or that training is authorized.
--
-- SECURITY INVOKER does NOT bypass RLS. Existing ACL/RLS may block even
-- owner-approved calls: that is an expected NO-GO pending separate review.
-- No new SECURITY DEFINER, GRANT, REVOKE, policy, role or secret.
-- The unconditional DO exception ABORTS the transaction BEFORE CREATE.
-- Never remove this barrier inside a review-only Draft.
BEGIN;
DO $nexa_dataset_rights_stop$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE='42501',
    MESSAGE='STOP_NOT_AUTHORIZED_FOR_SQL_OR_DEPLOY';
END
$nexa_dataset_rights_stop$;

create or replace function public.review_nexa_core_dataset_rights(
  p_audit_case_id uuid,
  p_approved boolean,
  p_deidentified boolean,
  p_rights_basis_reference text,
  p_policy_version text
)
returns void
language plpgsql security invoker set search_path=pg_catalog,pg_temp
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not coalesce(public.has_active_clinical_access(), false) or not exists(
    select 1 from public.profiles p
    where p.id=v_actor and p.is_admin is true and p.access_status='active'
      and p.clinical_access is true
  ) then raise sqlstate '42501' using message='DATASET_ADMIN_REQUIRED'; end if;

  -- Fail closed before any rights mutation. The case ID is a selector only:
  -- actor, submitter and consultation owner must match DB-authoritative rows.
  -- Inner joins also deny orphaned or NULL-owner historical records.
  -- Row locks keep these owner/status checks stable through the upsert.
  perform a.id
    from public.audit_cases a
    join public.consultation_history source
      on source.encounter_id=a.source_consultation_id
    join public.nexa_core_cases c on c.audit_case_id=a.id
    where a.id=p_audit_case_id
      and a.submitted_by=v_actor
      and source.user_id=v_actor
      and a.status in ('approved','corrected')
      and c.quality_status in ('approved','corrected')
    for update of a,source,c;
  if not found then
    raise sqlstate '22023' using message='AUDITED_CASE_REQUIRED';
  end if;

  if p_approved and not p_deidentified then
    raise sqlstate '22023' using message='DEIDENTIFICATION_REVIEW_REQUIRED';
  end if;
  if length(btrim(coalesce(p_rights_basis_reference,''))) not between 4 and 160
      or length(btrim(coalesce(p_policy_version,''))) not between 1 and 80 then
    raise sqlstate '22023' using message='DOCUMENTED_RIGHTS_BASIS_REQUIRED';
  end if;

  insert into public.nexa_core_dataset_approvals(
    audit_case_id,approved,deidentification_reviewed,rights_basis_reference,
    policy_version,reviewed_by,reviewed_at,revoked_at
  ) values(
    p_audit_case_id,p_approved,p_deidentified,
    btrim(p_rights_basis_reference),btrim(p_policy_version),v_actor,now(),
    case when p_approved then null else now() end
  )
  on conflict(audit_case_id) do update set
    approved=excluded.approved,
    deidentification_reviewed=excluded.deidentification_reviewed,
    rights_basis_reference=excluded.rights_basis_reference,
    policy_version=excluded.policy_version,
    reviewed_by=excluded.reviewed_by,
    reviewed_at=excluded.reviewed_at,
    revoked_at=excluded.revoked_at;
end;
$$;
-- No original migration, deployed function, endpoint or clinical data touched.
-- C01-C10 / N01-N09 NOT_RUN. Gate C NO-GO 0/19.
COMMIT;

-- NEXA Gate C P0 -- REVIEW-ONLY candidate, NEVER EXECUTE.
-- Generated from Git supabase/migrations/20261017173000_nexa_core_audit_learning_v2.sql
-- Source blob SHA 92e08dae931fbb845da0e61887d51db2ce26df08.
-- Observed legacy get_audit_queue(text): referenced by UI and GRANTed in
-- versioned migrations, but implementation/return contract was NOT found
-- in the 14 versioned SQL migrations. Never invent the RPC's definition.
-- The separately reviewed 3 audit read candidates remain untouched.
--
-- Concrete independent leak:
-- public.get_nexa_audit_annotations() is SECURITY DEFINER, returns annotation
-- rows across all audit cases for any active admin/reviewer, no owner check.
-- This candidate checks current authenticated clinical reviewer access and
-- joins audit_cases + consultation_history on server-side identifiers.
-- Source owner AND audit submitter must match auth.uid(), not client input.
--
-- Crucially this is SECURITY INVOKER and there are NO GRANT, REVOKE,
-- policies, or role changes. Since nexa_core_audit_annotations already has
-- RLS enabled and direct authenticated table access revoked, the candidate
-- is expected to FAIL CLOSED until a separately approved owner-only ACL/RLS
-- design exists. Never bypass those permissions to make a query work.
-- This is not a deployable migration or a passing test.
-- BEGIN and unconditional exception abort the transaction *before* CREATE.
BEGIN;
DO $nexa_owner_only_annotations_stop$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE='42501',
    MESSAGE='STOP_NOT_AUTHORIZED_FOR_SQL_OR_DEPLOY';
END
$nexa_owner_only_annotations_stop$;

create or replace function public.get_nexa_audit_annotations()
returns table(audit_case_id uuid,error_codes text[],evaluation_candidate boolean,updated_at timestamptz)
language plpgsql stable security invoker
set search_path=pg_catalog,pg_temp
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists(select 1 from public.profiles p
    where p.id=v_actor and p.access_status='active'
    and p.clinical_access is true
    and (p.is_admin is true or p.is_reviewer is true)
    and coalesce(public.has_active_clinical_access(),false)) then
    raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN';
  end if;
  return query select n.audit_case_id,n.error_codes,n.evaluation_candidate,n.updated_at
    from public.nexa_core_audit_annotations n
    join public.audit_cases a on a.id=n.audit_case_id
    join public.consultation_history source
      on source.encounter_id=a.source_consultation_id
    where a.submitted_by=v_actor
      and source.user_id=v_actor;
end;
$$;

-- No production SQL, no RLS/ACL change, no CI. Gate C NO-GO 0/19.
COMMIT;

-- NEXA Core commercial export gate. No raw audio or full transcript is stored.
-- All eligible data must have passed clinical audit, rights review and manual de-identification review.
begin;

create table if not exists public.nexa_core_dataset_approvals (
  audit_case_id uuid primary key references public.audit_cases(id) on delete cascade,
  approved boolean not null default false,
  deidentification_reviewed boolean not null default false,
  rights_basis_reference text not null,
  policy_version text not null,
  reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint nexa_core_rights_ref_check check (length(btrim(rights_basis_reference)) between 4 and 160),
  constraint nexa_core_policy_version_check check (length(btrim(policy_version)) between 1 and 80)
);
create index if not exists nexa_core_dataset_approval_status_idx
  on public.nexa_core_dataset_approvals (approved,reviewed_at desc);
alter table public.nexa_core_dataset_approvals enable row level security;
revoke all on public.nexa_core_dataset_approvals from public,anon,authenticated;

create table if not exists public.nexa_core_dataset_export_events (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  dataset_version text not null,
  case_count integer not null check(case_count >= 0),
  exporter_version text not null,
  exported_at timestamptz not null default now()
);
alter table public.nexa_core_dataset_export_events enable row level security;
revoke all on public.nexa_core_dataset_export_events from public,anon,authenticated;

create or replace function public.review_nexa_core_dataset_rights(
  p_audit_case_id uuid,
  p_approved boolean,
  p_deidentified boolean,
  p_rights_basis_reference text,
  p_policy_version text
)
returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists(
    select 1 from public.profiles p
    where p.id=v_actor and p.is_admin is true and p.access_status='active'
  ) then raise sqlstate '42501' using message='DATASET_ADMIN_REQUIRED'; end if;

  if not exists(
    select 1 from public.audit_cases a
    join public.nexa_core_cases c on c.audit_case_id=a.id
    where a.id=p_audit_case_id
      and a.status in ('approved','corrected')
      and c.quality_status in ('approved','corrected')
  ) then raise sqlstate '22023' using message='AUDITED_CASE_REQUIRED'; end if;

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
revoke all on function public.review_nexa_core_dataset_rights(uuid,boolean,boolean,text,text) from public,anon;
grant execute on function public.review_nexa_core_dataset_rights(uuid,boolean,boolean,text,text) to authenticated;

commit;

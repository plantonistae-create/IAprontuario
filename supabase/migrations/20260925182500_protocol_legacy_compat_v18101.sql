begin;

do $$
begin
  if to_regclass('public.nexa_protocols') is not null
     and to_regclass('public.nexa_clinical_protocols') is null then
    alter table public.nexa_protocols rename to nexa_clinical_protocols;
  end if;
end $$;

alter table public.nexa_clinical_protocols
  add column if not exists created_by uuid;

alter table public.nexa_protocol_versions
  add column if not exists published_by uuid;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='nexa_protocol_audit_log' and column_name='detail'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='nexa_protocol_audit_log' and column_name='details'
  ) then
    alter table public.nexa_protocol_audit_log rename column detail to details;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='nexa_protocol_audit_log' and column_name='created_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='nexa_protocol_audit_log' and column_name='occurred_at'
  ) then
    alter table public.nexa_protocol_audit_log rename column created_at to occurred_at;
  end if;
end $$;

alter table public.nexa_protocol_audit_log
  alter column protocol_id drop not null;

alter table public.nexa_protocol_versions
  drop constraint if exists nexa_protocol_versions_created_by_fkey,
  drop constraint if exists nexa_protocol_versions_reviewed_by_fkey,
  drop constraint if exists nexa_protocol_versions_published_by_fkey;

alter table public.nexa_protocol_versions
  add constraint nexa_protocol_versions_created_by_fkey
    foreign key(created_by) references auth.users(id) on delete set null,
  add constraint nexa_protocol_versions_reviewed_by_fkey
    foreign key(reviewed_by) references auth.users(id) on delete set null,
  add constraint nexa_protocol_versions_published_by_fkey
    foreign key(published_by) references auth.users(id) on delete set null;

alter table public.nexa_clinical_protocols
  drop constraint if exists nexa_clinical_protocols_created_by_fkey;

alter table public.nexa_clinical_protocols
  add constraint nexa_clinical_protocols_created_by_fkey
    foreign key(created_by) references auth.users(id) on delete set null;

alter table public.nexa_protocol_audit_log
  drop constraint if exists nexa_protocol_audit_log_protocol_id_fkey,
  drop constraint if exists nexa_protocol_audit_log_actor_id_fkey;

alter table public.nexa_protocol_audit_log
  add constraint nexa_protocol_audit_log_protocol_id_fkey
    foreign key(protocol_id) references public.nexa_clinical_protocols(id) on delete set null,
  add constraint nexa_protocol_audit_log_actor_id_fkey
    foreign key(actor_id) references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.nexa_protocol_versions'::regclass
      and conname='nexa_protocol_versions_prescription_items_array'
  ) then
    alter table public.nexa_protocol_versions
      add constraint nexa_protocol_versions_prescription_items_array
      check (jsonb_typeof(prescription_items)='array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.nexa_protocol_versions'::regclass
      and conname='nexa_protocol_versions_version_positive'
  ) then
    alter table public.nexa_protocol_versions
      add constraint nexa_protocol_versions_version_positive
      check (version_no>0);
  end if;
end $$;

create unique index if not exists nexa_clinical_protocols_diagnosis_key_uidx
  on public.nexa_clinical_protocols(lower(diagnosis_key));

commit;

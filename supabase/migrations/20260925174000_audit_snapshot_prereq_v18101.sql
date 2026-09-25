begin;

alter table public.audit_cases
  add column if not exists snapshot_version text not null default 'final-v1';

update public.audit_cases
set snapshot_version='final-v1'
where snapshot_version is null or btrim(snapshot_version)='';

alter table public.audit_cases
  alter column snapshot_version set default 'final-v1',
  alter column snapshot_version set not null;

alter table public.audit_cases
  drop constraint if exists audit_cases_source_consultation_id_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.audit_cases'::regclass
      and conname='audit_cases_source_snapshot_key'
  ) then
    alter table public.audit_cases
      add constraint audit_cases_source_snapshot_key
      unique(source_consultation_id,snapshot_version);
  end if;
end $$;

commit;

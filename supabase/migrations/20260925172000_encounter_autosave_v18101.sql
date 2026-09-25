begin;

alter table public.consultation_history
  add column if not exists encounter_id uuid,
  add column if not exists encounter_state text not null default 'draft',
  add column if not exists audit_priority smallint not null default 0,
  add column if not exists audit_ready_at timestamptz,
  add column if not exists last_client_saved_at timestamptz,
  add column if not exists sync_version bigint not null default 0;

update public.consultation_history
set encounter_id = case
  when id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then id::uuid
  else gen_random_uuid()
end
where encounter_id is null;

alter table public.consultation_history
  alter column encounter_id set default gen_random_uuid(),
  alter column encounter_id set not null;

create unique index if not exists consultation_history_encounter_id_uidx
  on public.consultation_history(encounter_id);

create index if not exists consultation_history_user_state_updated_idx
  on public.consultation_history(user_id, encounter_state, updated_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.consultation_history'::regclass
      and conname='consultation_history_encounter_state_check'
  ) then
    alter table public.consultation_history
      add constraint consultation_history_encounter_state_check
      check (encounter_state in ('draft','ready_for_audit','audited','discarded'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.consultation_history'::regclass
      and conname='consultation_history_audit_priority_check'
  ) then
    alter table public.consultation_history
      add constraint consultation_history_audit_priority_check
      check (audit_priority between 0 and 2);
  end if;
end $$;

create or replace function public.touch_consultation_history_encounter()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.sync_version := coalesce(old.sync_version,0) + 1;

  if old.encounter_state='ready_for_audit' and new.encounter_state='draft' then
    new.encounter_state := 'ready_for_audit';
  end if;

  if new.encounter_state='ready_for_audit' and old.encounter_state is distinct from 'ready_for_audit' then
    new.audit_ready_at := coalesce(new.audit_ready_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists consultation_history_encounter_touch on public.consultation_history;
create trigger consultation_history_encounter_touch
before update on public.consultation_history
for each row execute function public.touch_consultation_history_encounter();

grant select, insert, update, delete on public.consultation_history to authenticated;
revoke all on public.consultation_history from anon;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='consultation_history'
      and policyname='consultations_insert_own'
  ) then
    create policy consultations_insert_own
      on public.consultation_history
      for insert
      to authenticated
      with check (
        (select auth.uid()) is not null
        and has_active_clinical_access()
        and (select auth.uid()) = user_id
        and encounter_state in ('draft','ready_for_audit')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='consultation_history'
      and policyname='consultations_update_own'
  ) then
    create policy consultations_update_own
      on public.consultation_history
      for update
      to authenticated
      using (
        (select auth.uid()) is not null
        and has_active_clinical_access()
        and (select auth.uid()) = user_id
        and encounter_state in ('draft','ready_for_audit')
      )
      with check (
        (select auth.uid()) is not null
        and has_active_clinical_access()
        and (select auth.uid()) = user_id
        and encounter_state in ('draft','ready_for_audit')
      );
  end if;
end $$;

commit;

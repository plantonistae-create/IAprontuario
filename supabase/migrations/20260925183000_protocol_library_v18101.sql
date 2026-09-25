begin;

create table if not exists public.nexa_clinical_protocols(
  id uuid primary key default gen_random_uuid(),
  title text not null,
  diagnosis_key text not null,
  cid10 text[] not null default '{}',
  match_terms text[] not null default '{}',
  active_version_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists nexa_clinical_protocols_diagnosis_key_uidx
  on public.nexa_clinical_protocols(lower(diagnosis_key));
create index if not exists nexa_clinical_protocols_cid10_gin
  on public.nexa_clinical_protocols using gin(cid10);
create index if not exists nexa_clinical_protocols_match_terms_gin
  on public.nexa_clinical_protocols using gin(match_terms);

create table if not exists public.nexa_protocol_versions(
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.nexa_clinical_protocols(id) on delete cascade,
  version_no integer not null,
  status text not null default 'draft',
  clinical_scope text not null default '',
  source_label text not null default '',
  source_page text not null default '',
  change_note text not null default '',
  prescription_text text not null default '',
  prescription_items jsonb not null default '[]'::jsonb,
  guidance_text text not null default '',
  criteria_text text not null default '',
  contraindications_text text not null default '',
  required_data_text text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  constraint nexa_protocol_versions_version_positive check(version_no>0),
  constraint nexa_protocol_versions_status_check check(status in ('draft','review','approved','archived')),
  constraint nexa_protocol_versions_prescription_items_array check(jsonb_typeof(prescription_items)='array'),
  unique(protocol_id,version_no)
);

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.nexa_clinical_protocols'::regclass
      and conname='nexa_clinical_protocols_active_version_fkey'
  ) then
    alter table public.nexa_clinical_protocols
      add constraint nexa_clinical_protocols_active_version_fkey
      foreign key(active_version_id) references public.nexa_protocol_versions(id) on delete set null;
  end if;
end $$;

create index if not exists nexa_protocol_versions_protocol_status_idx
  on public.nexa_protocol_versions(protocol_id,status,version_no desc);
create index if not exists nexa_clinical_protocols_active_version_idx
  on public.nexa_clinical_protocols(active_version_id);
create index if not exists nexa_clinical_protocols_created_by_idx
  on public.nexa_clinical_protocols(created_by);
create index if not exists nexa_protocol_versions_created_by_idx
  on public.nexa_protocol_versions(created_by);
create index if not exists nexa_protocol_versions_reviewed_by_idx
  on public.nexa_protocol_versions(reviewed_by);
create index if not exists nexa_protocol_versions_published_by_idx
  on public.nexa_protocol_versions(published_by);

create table if not exists public.nexa_protocol_audit_log(
  id bigint generated always as identity primary key,
  protocol_id uuid references public.nexa_clinical_protocols(id) on delete set null,
  version_id uuid references public.nexa_protocol_versions(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists nexa_protocol_audit_log_protocol_idx
  on public.nexa_protocol_audit_log(protocol_id,occurred_at desc);
create index if not exists nexa_protocol_audit_log_version_idx
  on public.nexa_protocol_audit_log(version_id);
create index if not exists nexa_protocol_audit_log_actor_idx
  on public.nexa_protocol_audit_log(actor_id);

alter table public.consultation_history
  add column if not exists protocol_usage jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.consultation_history'::regclass
      and conname='consultation_history_protocol_usage_array'
  ) then
    alter table public.consultation_history
      add constraint consultation_history_protocol_usage_array
      check(jsonb_typeof(protocol_usage)='array');
  end if;
end $$;

alter table public.nexa_clinical_protocols enable row level security;
alter table public.nexa_protocol_versions enable row level security;
alter table public.nexa_protocol_audit_log enable row level security;

revoke all on public.nexa_clinical_protocols from anon,authenticated;
revoke all on public.nexa_protocol_versions from anon,authenticated;
revoke all on public.nexa_protocol_audit_log from anon,authenticated;

create or replace function public.touch_nexa_protocol()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin new.updated_at=now();return new;end;$$;
drop trigger if exists nexa_clinical_protocols_touch on public.nexa_clinical_protocols;
create trigger nexa_clinical_protocols_touch before update on public.nexa_clinical_protocols
for each row execute function public.touch_nexa_protocol();

commit;

-- LAB-ONLY. Run only in a disposable PostgreSQL container without external data.
-- This file models the minimum Supabase role contract; never run in production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.profiles (
  id uuid primary key,
  clinical_access boolean not null default false
);
create table public.consultation_history (
  user_id uuid not null,
  encounter_id uuid not null,
  primary key(user_id,encounter_id)
);
grant usage on schema public to service_role;
grant select on public.profiles,public.consultation_history to service_role;
revoke all on public.profiles,public.consultation_history from anon,authenticated;

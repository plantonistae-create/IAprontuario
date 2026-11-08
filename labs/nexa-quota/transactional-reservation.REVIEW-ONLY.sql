-- INERT REVIEW CANDIDATE. DO NOT APPLY TO HOSTED SUPABASE.
-- Requires migration review, authenticated caller and independent admin authority.
-- No existing table, function, JWT policy, Edge version, or secret is modified.
begin;
create schema if not exists nexa_quota;
revoke all on schema nexa_quota from public, anon, authenticated;
grant usage on schema nexa_quota to service_role;

-- Only a trusted administrator/bootstrap may insert approvers. No web/API grants.
create table nexa_quota.tenant_admin_approvers (
  tenant_id uuid not null,
  admin_user_id uuid not null,
  active boolean not null default false,
  primary key(tenant_id,admin_user_id)
);
alter table nexa_quota.tenant_admin_approvers enable row level security;

create table nexa_quota.tenant_memberships (
  user_id uuid primary key,
  tenant_id uuid not null,
  active boolean not null default false,
  authorized_by uuid not null,
  authorized_at timestamptz not null,
  foreign key(tenant_id,authorized_by)
    references nexa_quota.tenant_admin_approvers(tenant_id,admin_user_id)
);
create index on nexa_quota.tenant_memberships (tenant_id, user_id) where active;
alter table nexa_quota.tenant_memberships enable row level security;

create table nexa_quota.tenant_limits (
  tenant_id uuid primary key,
  max_user_calls_per_minute integer not null check(max_user_calls_per_minute between 1 and 1000),
  max_tenant_calls_per_minute integer not null check(max_tenant_calls_per_minute between 1 and 100000),
  max_encounter_calls_per_minute integer not null check(max_encounter_calls_per_minute between 1 and 1000),
  max_encounter_reserved_tokens bigint not null check(max_encounter_reserved_tokens between 1 and 10000000),
  max_input_tokens_per_call integer not null check(max_input_tokens_per_call between 1 and 200000),
  max_output_tokens_per_call integer not null check(max_output_tokens_per_call between 1 and 16384)
);
alter table nexa_quota.tenant_limits enable row level security;

create table nexa_quota.radar_reservations (
  request_id uuid primary key,
  tenant_id uuid not null,
  user_id uuid not null,
  encounter_id uuid not null,
  reserved_input_tokens integer not null check(reserved_input_tokens between 1 and 200000),
  reserved_output_tokens integer not null check(reserved_output_tokens between 1 and 16384),
  created_at timestamptz not null default clock_timestamp()
);
create index on nexa_quota.radar_reservations(tenant_id, created_at);
create index on nexa_quota.radar_reservations(tenant_id, user_id, created_at);
create index on nexa_quota.radar_reservations(tenant_id, encounter_id, created_at);
alter table nexa_quota.radar_reservations enable row level security;

revoke all on all tables in schema nexa_quota from public, anon, authenticated;
-- SELECT ... FOR SHARE requires column UPDATE, but INSERT and DELETE stay disallowed.
grant select, update (active) on nexa_quota.tenant_admin_approvers to service_role;
grant select on nexa_quota.tenant_memberships to service_role;
-- PostgreSQL SELECT ... FOR SHARE also requires an UPDATE privilege.
-- Limit it to the active flag; do not give INSERT/DELETE or tenant reassignment.
grant update (active) on nexa_quota.tenant_memberships to service_role;
grant select, update on nexa_quota.tenant_limits to service_role;
grant select, insert on nexa_quota.radar_reservations to service_role;

-- The Edge must derive p_user_id from validated auth.getUser() and obtain
-- p_tenant_id from trusted membership, never the request JSON or user_metadata.
-- Only service_role may execute this private-schema RPC; never pass its key to a browser.
create function nexa_quota.reserve_radar_call(
  p_user_id uuid,
  p_tenant_id uuid,
  p_encounter_id uuid,
  p_request_id uuid,
  p_input_tokens integer,
  p_output_tokens integer
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lim nexa_quota.tenant_limits%rowtype;
  prior nexa_quota.radar_reservations%rowtype;
  cut timestamptz;
  seen_user bigint;
  seen_tenant bigint;
  seen_encounter bigint;
  reserved_encounter bigint;
begin
  if p_user_id is null or p_tenant_id is null or p_encounter_id is null or p_request_id is null
     or p_input_tokens is null or p_output_tokens is null
     or p_input_tokens < 1 or p_input_tokens > 200000
     or p_output_tokens < 1 or p_output_tokens > 16384 then
    return jsonb_build_object('allowed',false,'reason','INVALID_ADMISSION');
  end if;

  -- The row lock makes tenant membership revocation orderable with admissions.
  perform 1 from nexa_quota.tenant_memberships m
    join nexa_quota.tenant_admin_approvers a
      on a.tenant_id=m.tenant_id and a.admin_user_id=m.authorized_by
    where m.user_id=p_user_id and m.tenant_id=p_tenant_id
      and m.active=true and a.active=true
    for share of m,a;
  if not found then return jsonb_build_object('allowed',false,'reason','TENANT_NOT_VERIFIED'); end if;

  perform 1 from public.profiles p where p.id=p_user_id and p.clinical_access=true;
  if not found then return jsonb_build_object('allowed',false,'reason','CLINICAL_ACCESS_REQUIRED'); end if;

  -- Encounter ownership is DB-derived. Never trust an encounter supplied by another user.
  perform 1 from public.consultation_history c
    where c.user_id=p_user_id and c.encounter_id=p_encounter_id;
  if not found then return jsonb_build_object('allowed',false,'reason','ENCOUNTER_NOT_OWNED'); end if;

  -- THIS LOCK SERIALIZES EVERY RESERVATION IN THE TENANT. No count-then-insert race.
  -- One invocation = one Postgres transaction; failed requests do not reserve.
  select * into lim from nexa_quota.tenant_limits
    where tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('allowed',false,'reason','BUDGET_NOT_CONFIGURED'); end if;

  select * into prior from nexa_quota.radar_reservations
    where request_id=p_request_id;
  if found then
    if prior.tenant_id=p_tenant_id and prior.user_id=p_user_id and
       prior.encounter_id=p_encounter_id and prior.reserved_input_tokens=p_input_tokens and
       prior.reserved_output_tokens=p_output_tokens then
      return jsonb_build_object('allowed',true,'reason','ALREADY_RESERVED');
    end if;
    return jsonb_build_object('allowed',false,'reason','IDEMPOTENCY_CONFLICT');
  end if;

  if p_input_tokens>lim.max_input_tokens_per_call or
     p_output_tokens>lim.max_output_tokens_per_call then
    return jsonb_build_object('allowed',false,'reason','PER_CALL_TOKEN_CAP');
  end if;

  cut := date_trunc('minute',clock_timestamp());
  select count(*) filter(where r.user_id=p_user_id and r.created_at>=cut),
         count(*) filter(where r.created_at>=cut),
         count(*) filter(where r.encounter_id=p_encounter_id and r.created_at>=cut),
         coalesce(sum(r.reserved_input_tokens::bigint+r.reserved_output_tokens::bigint)
           filter(where r.encounter_id=p_encounter_id),0)
    into seen_user,seen_tenant,seen_encounter,reserved_encounter
    from nexa_quota.radar_reservations r
    where r.tenant_id=p_tenant_id and (r.created_at>=cut or r.encounter_id=p_encounter_id);

  if seen_user>=lim.max_user_calls_per_minute or
     seen_tenant>=lim.max_tenant_calls_per_minute or
     seen_encounter>=lim.max_encounter_calls_per_minute or
     reserved_encounter + p_input_tokens::bigint + p_output_tokens::bigint>
       lim.max_encounter_reserved_tokens then
    return jsonb_build_object('allowed',false,'reason','BUDGET_EXCEEDED');
  end if;

  -- Requests sharing an ID across distinct tenant row locks can race.
  -- ON CONFLICT prevents a global-UUID collision from escaping as SQL 23505.
  insert into nexa_quota.radar_reservations(
    request_id,tenant_id,user_id,encounter_id,reserved_input_tokens,reserved_output_tokens
  ) values(
    p_request_id,p_tenant_id,p_user_id,p_encounter_id,p_input_tokens,p_output_tokens
  ) on conflict (request_id) do nothing;
  if not found then return jsonb_build_object('allowed',false,'reason','IDEMPOTENCY_CONFLICT'); end if;
  return jsonb_build_object('allowed',true,'reason','RESERVED');
end;
$$;
revoke execute on function nexa_quota.reserve_radar_call(uuid,uuid,uuid,uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function nexa_quota.reserve_radar_call(uuid,uuid,uuid,uuid,integer,integer)
  to service_role;
commit;

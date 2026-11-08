-- G8 STRICTLY DISPOSABLE Postgres 16. RUN ONLY AFTER G4–G7 LAB FIXTURES.
-- The new administrative RPC takes NO admin_user_id parameter. A separate
-- PostgreSQL login authenticates the operator; SECURITY DEFINER may read
-- session_user, which SET ROLE alone cannot forge. These test passwords are
-- fabricated and must NEVER be reused outside this throwaway container.
begin;
do $do$
begin
 if not exists(select 1 from pg_catalog.pg_roles where rolname='nexa_g8_tenant_a') then
   create role nexa_g8_tenant_a login password 'synthetic-g8-t1-only';
 end if;
 if not exists(select 1 from pg_catalog.pg_roles where rolname='nexa_g8_tenant_b') then
   create role nexa_g8_tenant_b login password 'synthetic-g8-t2-only';
 end if;
end
$do$;

create table nexa_quota.operator_role_bindings (
 principal_role text primary key check(length(principal_role) between 4 and 63),
 tenant_id uuid not null,
 admin_user_id uuid not null,
 active boolean not null default false,
 foreign key(tenant_id,admin_user_id)
   references nexa_quota.tenant_admin_approvers(tenant_id,admin_user_id)
);
alter table nexa_quota.operator_role_bindings enable row level security;
revoke all on nexa_quota.operator_role_bindings
 from public,anon,authenticated,service_role,nexa_g8_tenant_a,nexa_g8_tenant_b;

-- Created exclusively by fixture bootstrap role postgres, not by service_role.
insert into nexa_quota.operator_role_bindings
 (principal_role,tenant_id,admin_user_id,active) values
 ('nexa_g8_tenant_a','77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111',true),
 ('nexa_g8_tenant_b','88888888-8888-4888-8888-888888888888',
  '44444444-4444-4444-8444-444444444444',true);

create function nexa_quota.reconcile_stale_as_session_operator_g8(
  p_tenant_id uuid,p_min_age_seconds integer,p_batch_size integer
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_count integer:=0;
begin
  if p_tenant_id is null or p_min_age_seconds is null or
     p_min_age_seconds not between 60 and 86400 or p_batch_size is null or
     p_batch_size not between 1 and 100 then
    return jsonb_build_object('reconciled',false,'reason','INVALID_RECONCILIATION');
  end if;

  -- SECURE TEST BOUNDARY: session_user is the authenticated DB login,
  -- not an admin ID or JWT property supplied in the request payload.
  -- SECURITY DEFINER means current_user is the function owner, so do NOT
  -- use current_user, client-settable GUCs, or user_metadata as authority.
  perform 1 from nexa_quota.operator_role_bindings b
  join nexa_quota.tenant_admin_approvers a
    on a.tenant_id=b.tenant_id and a.admin_user_id=b.admin_user_id
  where b.principal_role=session_user::text and b.tenant_id=p_tenant_id
    and b.active=true and a.active=true
  for share of b,a;
  if not found then
    return jsonb_build_object('reconciled',false,'reason','SESSION_ADMIN_NOT_VERIFIED');
  end if;

  with targets as (
   select c.request_id
   from nexa_quota.radar_dispatch_claims c
   join nexa_quota.radar_reservations r on r.request_id=c.request_id
   where r.tenant_id=p_tenant_id and c.state='claimed'
     and c.claimed_at < clock_timestamp()-make_interval(secs=>p_min_age_seconds)
   order by c.claimed_at,c.request_id
   limit p_batch_size
   for update of c skip locked
  ), changed as (
   update nexa_quota.radar_dispatch_claims c
      set state='outcome_unknown',completed_at=clock_timestamp()
   from targets t
   where c.request_id=t.request_id and c.state='claimed'
   returning c.request_id
  )
  select count(*)::integer into v_count from changed;

  return jsonb_build_object('reconciled',true,
    'reason','STALE_CLAIMS_CLOSED_UNKNOWN',
    'closed_unknown_count',v_count,
    'automatic_paid_retry',false,
    'provider_charge_verified',false);
end;
$$;

revoke all on function nexa_quota.reconcile_stale_as_session_operator_g8(uuid,integer,integer)
 from public,anon,authenticated,service_role;
grant usage on schema nexa_quota to nexa_g8_tenant_a,nexa_g8_tenant_b;
grant execute on function nexa_quota.reconcile_stale_as_session_operator_g8(uuid,integer,integer)
 to nexa_g8_tenant_a,nexa_g8_tenant_b;
commit;

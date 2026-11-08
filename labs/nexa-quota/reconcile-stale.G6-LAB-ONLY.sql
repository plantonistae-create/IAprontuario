-- G6 LAB-ONLY. Add after G5 claim ledger in DISPOSABLE Postgres container.
-- Do NOT execute in hosted Supabase. No provider API or real data.
begin;
create function nexa_quota.reconcile_stale_radar_claims(
  p_tenant_id uuid,
  p_admin_user_id uuid,
  p_min_age_seconds integer,
  p_batch_size integer
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  settled integer := 0;
begin
  if p_tenant_id is null or p_admin_user_id is null or
     p_min_age_seconds is null or p_min_age_seconds not between 60 and 86400 or
     p_batch_size is null or p_batch_size not between 1 and 100 then
    return jsonb_build_object('reconciled',false,'reason','INVALID_RECONCILIATION');
  end if;

  -- Only an administrator from an active bootstrap-controlled tenant registry
  -- can request reconciliation; never use user_metadata or caller JSON.
  perform 1 from nexa_quota.tenant_admin_approvers a
    where a.tenant_id=p_tenant_id and a.admin_user_id=p_admin_user_id
      and a.active=true for share;
  if not found then
    return jsonb_build_object('reconciled',false,'reason','ADMIN_NOT_VERIFIED');
  end if;

  -- A stale claim is a previously authorized attempt with UNKNOWN remote result.
  -- Closing it cannot infer whether the provider charged for the attempt.
  -- SKIP LOCKED allows independent reconcilers without double settlement.
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
  select count(*)::integer into settled from changed;

  return jsonb_build_object('reconciled',true,'reason','STALE_CLAIMS_CLOSED_UNKNOWN',
    'closed_unknown_count',settled,'automatic_paid_retry',false);
end;
$$;
revoke execute on function nexa_quota.reconcile_stale_radar_claims(uuid,uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function nexa_quota.reconcile_stale_radar_claims(uuid,uuid,integer,integer)
  to service_role;
commit;

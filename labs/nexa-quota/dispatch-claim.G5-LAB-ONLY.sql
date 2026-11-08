-- G5 DISPOSABLE POSTGRES ONLY. NOT a hosted Supabase migration.
-- Must be loaded AFTER G4 reservation schema and synthetic fixture/seed.
-- This is an isolated claim/terminal-outcome ledger, not a billing ledger.
begin;
create table nexa_quota.radar_dispatch_claims (
  request_id uuid primary key
    references nexa_quota.radar_reservations(request_id) on delete restrict,
  state text not null default 'claimed'
    check(state in ('claimed','confirmed_response','outcome_unknown')),
  claimed_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check ((state='claimed' and completed_at is null) or
         (state<>'claimed' and completed_at is not null))
);
alter table nexa_quota.radar_dispatch_claims enable row level security;
revoke all on nexa_quota.radar_dispatch_claims from public,anon,authenticated;
grant select,insert,update(state,completed_at) on nexa_quota.radar_dispatch_claims to service_role;

-- A reservation is never permission to dispatch twice. Atomic PK claim is the
-- authoritative dispatch lease; abandoned claims become UNKNOWN on reconciliation,
-- not candidates for automatic retries.
create function nexa_quota.claim_radar_dispatch(
 p_user_id uuid,p_tenant_id uuid,p_encounter_id uuid,p_request_id uuid
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
begin
 if p_user_id is null or p_tenant_id is null or p_encounter_id is null or p_request_id is null then
   return jsonb_build_object('dispatch',false,'reason','INVALID_IDENTITY');
 end if;
 -- Hold shared membership/admin locks until claim transaction completes,
 -- to order an administrative revocation against a new dispatch claim.
 perform 1 from nexa_quota.tenant_memberships m
 join nexa_quota.tenant_admin_approvers a
   on a.tenant_id=m.tenant_id and a.admin_user_id=m.authorized_by
 where m.user_id=p_user_id and m.tenant_id=p_tenant_id
   and m.active=true and a.active=true
 for share of m,a;
 if not found then return jsonb_build_object('dispatch',false,'reason','TENANT_NOT_VERIFIED'); end if;
 perform 1 from public.profiles p
 where p.id=p_user_id and p.clinical_access=true;
 if not found then return jsonb_build_object('dispatch',false,'reason','CLINICAL_ACCESS_REQUIRED'); end if;
 perform 1 from public.consultation_history c
 where c.user_id=p_user_id and c.encounter_id=p_encounter_id;
 if not found then return jsonb_build_object('dispatch',false,'reason','ENCOUNTER_NOT_OWNED'); end if;

 insert into nexa_quota.radar_dispatch_claims(request_id)
 select r.request_id from nexa_quota.radar_reservations r
 where r.request_id=p_request_id and r.user_id=p_user_id and
       r.tenant_id=p_tenant_id and r.encounter_id=p_encounter_id
 on conflict(request_id) do nothing;
 if found then
   return jsonb_build_object('dispatch',true,'reason','CLAIMED_ONCE');
 end if;
 -- Never expose whether an inaccessible foreign request exists.
 return jsonb_build_object('dispatch',false,'reason','MISSING_OR_ALREADY_CLAIMED');
end;
$$;
revoke execute on function nexa_quota.claim_radar_dispatch(uuid,uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function nexa_quota.claim_radar_dispatch(uuid,uuid,uuid,uuid) to service_role;

-- A confirmed HTTP response is NOT proof of a successful clinical assessment
-- or an official bill. An exception after claim means UNKNOWN, not free to retry.
create function nexa_quota.record_radar_dispatch_outcome(
 p_user_id uuid,p_tenant_id uuid,p_request_id uuid,p_state text
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare prior text;
begin
 if p_user_id is null or p_tenant_id is null or p_request_id is null or
    p_state not in ('confirmed_response','outcome_unknown') or p_state is null then
   return jsonb_build_object('recorded',false,'reason','INVALID_OUTCOME');
 end if;
 update nexa_quota.radar_dispatch_claims c
 set state=p_state,completed_at=clock_timestamp()
 from nexa_quota.radar_reservations r
 where c.request_id=r.request_id and c.request_id=p_request_id
   and r.user_id=p_user_id and r.tenant_id=p_tenant_id and c.state='claimed';
 if found then return jsonb_build_object('recorded',true,'reason','RECORDED'); end if;
 select c.state into prior from nexa_quota.radar_dispatch_claims c
 join nexa_quota.radar_reservations r on r.request_id=c.request_id
 where c.request_id=p_request_id and r.user_id=p_user_id and r.tenant_id=p_tenant_id;
 if prior=p_state then return jsonb_build_object('recorded',true,'reason','ALREADY_RECORDED'); end if;
 return jsonb_build_object('recorded',false,'reason','NO_CLAIM_OR_TERMINAL_CONFLICT');
end;
$$;
revoke execute on function nexa_quota.record_radar_dispatch_outcome(uuid,uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function nexa_quota.record_radar_dispatch_outcome(uuid,uuid,uuid,text)
 to service_role;
commit;

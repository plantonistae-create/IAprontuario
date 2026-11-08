-- G7 DISPOSABLE-ONLY. Apply after G4 reservation, G5 claim, G6 reaper.
-- Pure read-only crash-boundary inspection; NOT a provider receipt or a hosted migration.
begin;
create function nexa_quota.inspect_dispatch_crash_boundary(
 p_user_id uuid,p_tenant_id uuid,p_encounter_id uuid,p_request_id uuid
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_state text; v_reserved boolean;
begin
 if p_user_id is null or p_tenant_id is null or p_encounter_id is null or p_request_id is null then
  return jsonb_build_object('status','INVALID_IDENTITY','automatic_paid_retry',false);
 end if;

 -- No response reveals a reservation across an unverified tenant or encounter.
 perform 1 from nexa_quota.tenant_memberships m
 join nexa_quota.tenant_admin_approvers a
   on m.tenant_id=a.tenant_id and m.authorized_by=a.admin_user_id
 where m.user_id=p_user_id and m.tenant_id=p_tenant_id and m.active and a.active
 for share of m,a;
 if not found then
  return jsonb_build_object('status','AUTHORITY_NOT_VERIFIED','automatic_paid_retry',false);
 end if;
 perform 1 from public.profiles p where p.id=p_user_id and p.clinical_access;
 if not found then
  return jsonb_build_object('status','AUTHORITY_NOT_VERIFIED','automatic_paid_retry',false);
 end if;
 perform 1 from public.consultation_history h
 where h.user_id=p_user_id and h.encounter_id=p_encounter_id;
 if not found then
  return jsonb_build_object('status','AUTHORITY_NOT_VERIFIED','automatic_paid_retry',false);
 end if;

 select true,c.state into v_reserved,v_state
 from nexa_quota.radar_reservations r
 left join nexa_quota.radar_dispatch_claims c on c.request_id=r.request_id
 where r.request_id=p_request_id and r.tenant_id=p_tenant_id
   and r.user_id=p_user_id and r.encounter_id=p_encounter_id;

 if not found then
  return jsonb_build_object('status','NO_VISIBLE_RESERVATION','automatic_paid_retry',false);
 end if;
 return jsonb_build_object(
  'status',case
    when v_state is null then 'RESERVED_NOT_CLAIMED'
    when v_state='claimed' then 'CLAIMED_REMOTE_UNVERIFIED'
    when v_state='outcome_unknown' then 'TERMINAL_OUTCOME_UNKNOWN'
    when v_state='confirmed_response' then 'TERMINAL_RESPONSE_RECORDED'
    else 'UNEXPECTED_STATE'
   end,
  'automatic_paid_retry',false,
  'provider_charge_verified',false,
  'safe_to_promote_live',false
 );
end;
$$;
revoke execute on function nexa_quota.inspect_dispatch_crash_boundary(uuid,uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function nexa_quota.inspect_dispatch_crash_boundary(uuid,uuid,uuid,uuid)
 to service_role;
commit;

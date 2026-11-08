-- G10 DISPOSABLE POSTGRES 16 ONLY. Load after G9, NEVER hosted Supabase.
-- PostgreSQL session_user represents a synthetic DB login, NOT Supabase Auth.
-- No clinical payload, provider receipts or real API keys anywhere in this SQL.
begin;
create table nexa_quota.operator_credential_epochs_g10 (
 principal_role text primary key references nexa_quota.operator_role_bindings(principal_role),
 tenant_id uuid not null,
 key_epoch integer not null check(key_epoch between 1 and 100000),
 active boolean not null default true,
 revoked_at timestamptz,
 check ((active and revoked_at is null) or (not active and revoked_at is not null))
);
insert into nexa_quota.operator_credential_epochs_g10(principal_role,tenant_id,key_epoch)
 select principal_role,tenant_id,1 from nexa_quota.operator_role_bindings;
alter table nexa_quota.operator_credential_epochs_g10 enable row level security;
revoke all on nexa_quota.operator_credential_epochs_g10
 from public,anon,authenticated,service_role,nexa_g8_tenant_a,nexa_g8_tenant_b;

create table nexa_quota.consumed_nonces_g10 (
 tenant_id uuid not null,
 nonce text not null check(nonce ~ '^[0-9a-f]{32}$'),
 principal_role text not null,
 key_epoch integer not null check(key_epoch>=1),
 consumed_at timestamptz not null default clock_timestamp(),
 primary key (tenant_id,nonce)
);
alter table nexa_quota.consumed_nonces_g10 enable row level security;
revoke all on nexa_quota.consumed_nonces_g10
 from public,anon,authenticated,service_role,nexa_g8_tenant_a,nexa_g8_tenant_b;

-- SECURITY DEFINER authenticates by DB login session_user, not service_role
-- or an admin ID passed in an API JSON request. The signature must be
-- independently verified in the offline application BEFORE invoking this RPC.
-- Epoch is provided by a *signed* claim upstream: SQL checks it against
-- a private registry but cannot cryptographically verify that claim itself.
create function nexa_quota.consume_operator_nonce_g10(
 p_tenant_id uuid,p_nonce text,p_expiry timestamptz,p_key_epoch integer
) returns jsonb
language plpgsql security definer set search_path=''
as $$
begin
 if p_tenant_id is null or p_nonce is null or
    p_nonce !~ '^[0-9a-f]{32}$' or p_expiry is null or
    p_expiry<=clock_timestamp() or
    p_expiry>clock_timestamp()+interval '2 minutes' or
    p_key_epoch is null or p_key_epoch<1 then
  return jsonb_build_object('accepted',false,'reason','INVALID_OR_EXPIRED_GRANT',
   'automatic_paid_retry',false);
 end if;
 perform 1 from nexa_quota.operator_role_bindings b
 join nexa_quota.tenant_admin_approvers a
   on a.tenant_id=b.tenant_id and a.admin_user_id=b.admin_user_id
 join nexa_quota.operator_credential_epochs_g10 e
   on e.principal_role=b.principal_role and e.tenant_id=b.tenant_id
 where b.principal_role=session_user::text and b.tenant_id=p_tenant_id
  and b.active and a.active and e.active and e.key_epoch=p_key_epoch
 for share of b,a,e;
 if not found then
  return jsonb_build_object('accepted',false,'reason','REVOKED_OR_WRONG_OPERATOR',
   'automatic_paid_retry',false);
 end if;
 insert into nexa_quota.consumed_nonces_g10
  (tenant_id,nonce,principal_role,key_epoch)
 values (p_tenant_id,p_nonce,session_user::text,p_key_epoch)
 on conflict(tenant_id,nonce) do nothing;
 if found then
  return jsonb_build_object('accepted',true,'reason','CONSUMED_ONCE_OFFLINE',
   'automatic_paid_retry',false,'real_user_auth_verified',false);
 end if;
 return jsonb_build_object('accepted',false,'reason','REPLAY_BLOCKED_DURABLY',
  'automatic_paid_retry',false);
end;
$$;
revoke all on function nexa_quota.consume_operator_nonce_g10(uuid,text,timestamptz,integer)
 from public,anon,authenticated,service_role;
grant execute on function nexa_quota.consume_operator_nonce_g10(uuid,text,timestamptz,integer)
 to nexa_g8_tenant_a,nexa_g8_tenant_b;

-- Read-only crash inspection for a lab-only signed mock receipt. It NEVER
-- changes claim state; "not found" is NOT proof the provider did not charge.
create function nexa_quota.inspect_receipt_after_crash_g10(
 p_tenant_id uuid,p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare s text;mock_exists boolean;
begin
 if p_tenant_id is null or p_request_id is null then
  return jsonb_build_object('status','INVALID_INPUT',
   'automatic_paid_retry',false);
 end if;
 perform 1 from nexa_quota.operator_role_bindings b
 join nexa_quota.tenant_admin_approvers a
   on a.tenant_id=b.tenant_id and a.admin_user_id=b.admin_user_id
 join nexa_quota.operator_credential_epochs_g10 e
   on e.principal_role=b.principal_role and e.tenant_id=b.tenant_id
 where b.principal_role=session_user::text and b.tenant_id=p_tenant_id
  and b.active and a.active and e.active
 for share of b,a,e;
 if not found then return jsonb_build_object('status','AUTHORITY_NOT_VERIFIED',
   'automatic_paid_retry',false); end if;
 select c.state,(m.request_id is not null) into s,mock_exists
 from nexa_quota.radar_reservations r
 join nexa_quota.radar_dispatch_claims c on c.request_id=r.request_id
 left join nexa_quota.synthetic_receipt_evidence_g9 m
   on m.request_id=r.request_id and m.tenant_id=r.tenant_id
 where r.tenant_id=p_tenant_id and r.request_id=p_request_id;
 if not found then return jsonb_build_object('status','NO_VISIBLE_DISPATCH',
   'automatic_paid_retry',false); end if;
 return jsonb_build_object('status',
   case when s='outcome_unknown' and mock_exists
    then 'UNKNOWN_WITH_SIGNED_MOCK_DIGEST'
    when s='outcome_unknown' then 'UNKNOWN_WITHOUT_MOCK'
    when s='confirmed_response' then 'CONFIRMED_HTTP_NOT_BILLING'
    when s='claimed' then 'CLAIMED_REMOTE_UNVERIFIED'
    else 'INVALID_STATE' end,
   'automatic_paid_retry',false,'official_provider_bill_verified',false,
   'provider_no_charge_proven',false,'clinical_validation_proven',false);
end;
$$;
revoke all on function nexa_quota.inspect_receipt_after_crash_g10(uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function nexa_quota.inspect_receipt_after_crash_g10(uuid,uuid)
 to nexa_g8_tenant_a,nexa_g8_tenant_b;
commit;

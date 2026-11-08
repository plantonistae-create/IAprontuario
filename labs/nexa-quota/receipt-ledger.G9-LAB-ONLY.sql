-- G9 DISPOSABLE POSTGRES ONLY. No hosted migration, provider API or real data.
-- Must be loaded AFTER G8. This table is NOT an official billing ledger.
begin;
create table nexa_quota.synthetic_receipt_evidence_g9(
 request_id uuid primary key references nexa_quota.radar_dispatch_claims(request_id) on delete restrict,
 tenant_id uuid not null,
 observation text not null check(observation in ('seen','not_found','indeterminate')),
 receipt_digest text not null check(receipt_digest ~ '^[0-9a-f]{64}$'),
 inserted_at timestamptz not null default clock_timestamp()
);
alter table nexa_quota.synthetic_receipt_evidence_g9 enable row level security;
revoke all on nexa_quota.synthetic_receipt_evidence_g9 from public,anon,authenticated,service_role,
 nexa_g8_tenant_a,nexa_g8_tenant_b;
-- Synthetic evidence is inserted by fixture bootstrap postgres only. The
-- signature is verified by a separate offline Ed25519 verifier BEFORE this
-- function is invoked; SQL alone cannot prove the signer or invoice.
create function nexa_quota.record_synthetic_receipt_g9(
 p_request_id uuid,p_tenant_id uuid,p_observation text,p_receipt_digest text
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare previous nexa_quota.synthetic_receipt_evidence_g9%rowtype;
begin
 if p_request_id is null or p_tenant_id is null or p_observation is null or
    p_observation not in ('seen','not_found','indeterminate') or
    p_receipt_digest is null or p_receipt_digest !~ '^[0-9a-f]{64}$' then
  return jsonb_build_object('stored',false,'reason','INVALID_MOCK_EVIDENCE');
 end if;
 insert into nexa_quota.synthetic_receipt_evidence_g9
  (request_id,tenant_id,observation,receipt_digest)
 select r.request_id,r.tenant_id,p_observation,p_receipt_digest
 from nexa_quota.radar_reservations r
 join nexa_quota.radar_dispatch_claims c on c.request_id=r.request_id
 where r.request_id=p_request_id and r.tenant_id=p_tenant_id
  and c.state in ('claimed','outcome_unknown','confirmed_response')
 on conflict(request_id) do nothing;
 if found then
  return jsonb_build_object('stored',true,'reason','STORED_SYNTHETIC_ONLY',
   'automatic_paid_retry',false);
 end if;
 select * into previous from nexa_quota.synthetic_receipt_evidence_g9
 where request_id=p_request_id and tenant_id=p_tenant_id;
 if found then
  if previous.observation=p_observation and previous.receipt_digest=p_receipt_digest then
   return jsonb_build_object('stored',true,'reason','ALREADY_STORED_SYNTHETIC',
    'automatic_paid_retry',false);
  end if;
  return jsonb_build_object('stored',false,'reason','IMMUTABLE_RECEIPT_CONFLICT');
 end if;
 return jsonb_build_object('stored',false,'reason','CLAIM_NOT_FOUND_IN_TENANT');
end;
$$;
revoke all on function nexa_quota.record_synthetic_receipt_g9(uuid,uuid,text,text)
 from public,anon,authenticated,service_role,nexa_g8_tenant_a,nexa_g8_tenant_b;
commit;

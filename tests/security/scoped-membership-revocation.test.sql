-- Regression tests for the scoped revocation candidate.
-- Run ONLY in an isolated staging transaction with synthetic authenticated users.
-- Replace placeholders with test fixture UUIDs; NEVER use patient data.
-- Requires psql variables: admin_a, doctor_a, doctor_b, membership_a, membership_b, last_owner_a.
-- Use actual JWT auth.uid() context via request.jwt.claim.sub; postgres SQL here
-- is a harness and does not replace HTTP tests with separate authenticated tokens.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_a', true);
-- Positive path rolls back with the enclosing transaction.
select public.revoke_organization_membership(:'membership_a'::uuid);
-- Assert target is revoked inside transaction (fixture should be active).
do $$ begin
 if not exists(select 1 from public.organization_memberships where id=:'membership_a'::uuid and status='revoked') then
  raise exception 'EXPECTED_REVOKED';
 end if;
end $$;
rollback;

-- Negative test driver must invoke each RPC in an independent transaction and
-- expect SQLSTATE 42501, then verify row unchanged with service-side inspection:
-- admin_a -> membership_b (cross-org)
-- doctor_a -> membership_a (non-admin)
-- doctor_b -> membership_a (cross-org)
-- admin_a -> last_owner_a (last owner)
-- admin_a -> own membership (self revocation)
-- unaffiliated -> membership_a
-- Also assert no global profile.is_admin flags change.
-- Use dedicated Supabase Auth test identities for final staging signoff.

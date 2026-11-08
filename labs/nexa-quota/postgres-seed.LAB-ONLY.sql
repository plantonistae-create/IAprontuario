-- All IDs and entries are fabricated. No production connection.
insert into public.profiles(id,clinical_access) values
 ('11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222222',true),
 ('33333333-3333-4333-8333-333333333333',false),
 ('44444444-4444-4444-8444-444444444444',true);
insert into public.consultation_history(user_id,encounter_id) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('33333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
 ('44444444-4444-4444-8444-444444444444','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
-- Synthetic administrator registry is loaded only by the bootstrap actor (postgres).
insert into nexa_quota.tenant_admin_approvers(tenant_id,admin_user_id,active) values
 ('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111',true),
 ('88888888-8888-4888-8888-888888888888','44444444-4444-4444-8444-444444444444',true);
insert into nexa_quota.tenant_memberships(user_id,tenant_id,active,authorized_by,authorized_at) values
 ('11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777',true,'11111111-1111-4111-8111-111111111111','2026-11-08T00:00:00Z'),
 ('22222222-2222-4222-8222-222222222222','77777777-7777-4777-8777-777777777777',true,'11111111-1111-4111-8111-111111111111','2026-11-08T00:00:00Z'),
 ('33333333-3333-4333-8333-333333333333','77777777-7777-4777-8777-777777777777',true,'11111111-1111-4111-8111-111111111111','2026-11-08T00:00:00Z'),
 ('44444444-4444-4444-8444-444444444444','88888888-8888-4888-8888-888888888888',true,'44444444-4444-4444-8444-444444444444','2026-11-08T00:00:00Z');
insert into nexa_quota.tenant_limits(
 tenant_id,max_user_calls_per_minute,max_tenant_calls_per_minute,
 max_encounter_calls_per_minute,max_encounter_reserved_tokens,
 max_input_tokens_per_call,max_output_tokens_per_call
) values
 ('77777777-7777-4777-8777-777777777777',4,5,4,3000,600,200),
 ('88888888-8888-4888-8888-888888888888',3,4,3,1000,500,120);

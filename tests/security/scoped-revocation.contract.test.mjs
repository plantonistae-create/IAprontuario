import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/20261027125243_nexa_scoped_membership_revocation_candidate.sql',import.meta.url),'utf8');
test('migration has no literal escaped line breaks and preserves restricted definer search_path',()=>{
 assert.ok(!sql.includes(String.fromCharCode(92,110)),'SQL accidentally contains escaped line breaks');
 assert.match(sql,/SECURITY DEFINER[\s\S]*SET search_path = ''/);
 assert.match(sql,/REVOKE ALL ON FUNCTION .* FROM PUBLIC, anon/i);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION .* TO authenticated/i);
});
test('authorization scopes to authenticated active institution membership',()=>{
 assert.match(sql,/v_actor uuid := auth\.uid\(\)/i);
 assert.match(sql,/p\.id=v_actor AND p\.access_status='active'/i);
 assert.match(sql,/private\.org_has_any_role\(\s*v_org,v_actor,ARRAY\['owner','admin'\]/i);
 assert.match(sql,/IF v_target\.user_id=v_actor/i);
 assert.match(sql,/IF 'owner'=ANY\(v_target\.roles\) AND NOT v_owns/i);
});
test('concurrent owner revocations lock the same organization before target row',()=>{
 const org=sql.indexOf('FROM public.organizations AS o');
 const target=sql.indexOf('WHERE m.id=p_membership_id AND m.organization_id=v_org FOR UPDATE');
 assert.ok(org>=0&&target>org);
 assert.match(sql,/WHERE o\.id=v_org AND o\.status='active' FOR UPDATE/);
 assert.match(sql,/LAST_OWNER_REVOCATION_FORBIDDEN/);
});
test('existing audit_log constraint honored and a correlation identifier emitted',()=>{
 assert.match(sql,/INSERT INTO public\.audit_log\(user_id,consultation_id,action,metadata\)/);
 assert.match(sql,/'update',\s*jsonb_build_object/);
 assert.match(sql,/'operation','organization_membership_revoked'/);
 assert.match(sql,/'correlation_id',v_correlation/);
});

test('institution-only profile migration preserves pending safety without assigning global rights',()=>{
 const source=readFileSync(new URL('../../supabase/migrations/20261027184850_nexa_active_institution_roles_without_global_capability.sql',import.meta.url),'utf8');
 assert.match(source,/ADD CONSTRAINT profiles_capability_state_check/);
 assert.match(source,/access_status <> 'pending'/);
 assert.match(source,/is_admin IS FALSE[\s\S]*is_reviewer IS FALSE[\s\S]*clinical_access IS FALSE/);
 assert.doesNotMatch(source,/access_status <> 'active'/);
 const fixture=readFileSync(new URL('../../scripts/prepare-staging-tenant-fixtures.mjs',import.meta.url),'utf8');
 assert.match(fixture,/activeTenantProfileMigration='20261027184850'/);
 assert.ok(fixture.indexOf('const migrationReady=')<fixture.indexOf('const admin=createClient('),
  'Fixture schema preflight must run before creating synthetic Auth users');
 assert.match(fixture,/clinical_access=false/);
 assert.match(fixture,/is_reviewer=\(id=\$\{id\(actors\.reviewerB\.id\)\}\)/);
});

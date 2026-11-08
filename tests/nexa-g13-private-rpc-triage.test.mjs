import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {triagePrivilegedRpcInventory as triage} from '../labs/nexa-security/private-rpc-triage.G13-REVIEW-ONLY.mjs';
const record=(private_ref='R-001',effective_role='anon')=>({
 private_ref,effective_role,rpc_surface:'rpc_confirmed',
 operation_class:'admin_mutation',acl_verified:'inherited_public',
 security_definer:true,auth_guard:'unknown',object_scope:'unknown',
 owner_privileges:'unknown',search_path_guard:'unknown',
 caller_impact:'unknown',rollback_evidence:'unverified',
 code_and_acl_review:'metadata_only'
});
const inventory=(...rows)=>({schema_version:'nexa-g13-private-rpc-v1',
 evidence_source:'authorized_manual_private_review',rows});
test('triage prioritizes anon privileged effects but never claims exploit or issues SQL',()=>{
 const x=triage(inventory(record()));
 assert.equal(x.role_entries_anonymous,1);
 assert.equal(x.risk_counts.anon_high_impact_review_first,1);
 assert.equal(x.risk_counts.review_incomplete_or_missing_evidence,1);
 assert.equal(x.automatic_revoke_allowed,false);
 assert.equal(x.hosted_remediation_go,false);
 assert.equal(x.runtime_acl_or_sql_body_verified_by_this_script,false);
 assert.equal(x.clinical_go,false);
 assert.equal(JSON.stringify(x).includes('R-001'),false);
});
test('separate trigger-only and authenticated role cannot be confused with confirmed anonymous RPC exposure',()=>{
 const a=record('R-001','anon');a.operation_class='other';a.rpc_surface='trigger_only';
 const b=record('R-002','authenticated');b.operation_class='clinical_read';b.rpc_surface='unknown';
 const x=triage(inventory(a,b));
 assert.equal(x.risk_counts.anon_high_impact_review_first,0);
 assert.equal(x.risk_counts.triggered_functions_needing_rpc_reachability_check,1);
 assert.equal(x.risk_counts.rpc_reachability_unknown,1);
 assert.equal(x.role_entries_authenticated,1);
 assert.equal(x.hosted_remediation_go,false);
});
test('separate role records for same synthetic function are counted as grants, not unique functions',()=>{
 const x=triage(inventory(record('R-001','anon'),record('R-001','authenticated')));
 assert.equal(x.records_reviewed,2);
 assert.equal(x.role_entries_anonymous,1);
 assert.equal(x.role_entries_authenticated,1);
 assert.equal(x.role_entries_are_not_unique_function_counts,true);
});
test('missing object-scope, unsafe search path or caller breakage become explicit STOP evidence',()=>{
 const a=record('R-001');a.object_scope='missing';a.search_path_guard='unsafe';
 const b=record('R-002','authenticated');b.caller_impact='breakage_risk';
 const x=triage(inventory(a,b));
 assert.equal(x.risk_counts.actual_missing_guard_or_dependency_risk_to_investigate,2);
 assert.equal(x.risk_counts.tenant_object_guard_not_verified,2);
 assert.equal(x.risk_counts.possible_caller_breakage,2);
 assert.equal(x.automatic_revoke_allowed,false);
});
test('even fully classified private reviews never grant hosted deploy by this local tool',()=>{
 const a=record();
 Object.assign(a,{
  acl_verified:'explicit_grant',auth_guard:'verified_user_identity',
  object_scope:'tenant_and_object',owner_privileges:'least_privilege_verified',
  search_path_guard:'pinned_safe',caller_impact:'reviewed_safe',
  rollback_evidence:'approved_offline_plan',code_and_acl_review:'complete_private_review'
 });
 const x=triage(inventory(a));
 assert.equal(x.risk_counts.review_incomplete_or_missing_evidence,0);
 assert.equal(x.hosted_remediation_go,false);
 assert.equal(x.automatic_revoke_allowed,false);
});
test('rejects raw names, bodies, access tokens, patient fields and unauthenticated provenance',()=>{
 for(const field of ['function_name','sql_body','raw_jwt','access_token','patient','clinical_content']){
  const row=record();row[field]='SENSITIVE';
  assert.throws(()=>triage(inventory(row)),/G13_PRIVATE_ROW_INVALID/);
 }
 const s=inventory(record());s.evidence_source='browser_user_metadata';
 assert.throws(()=>triage(s),/G13_PRIVATE_SCHEMA_INVALID/);
});
test('rejects invalid role, duplicate role record and SQL/identifier instead of opaque reference',()=>{
 const wrong=record();wrong.effective_role='service_role';
 assert.throws(()=>triage(inventory(wrong)),/G13_PRIVATE_ROW_INVALID/);
 const id=record('public.secret_admin_func','anon');
 assert.throws(()=>triage(inventory(id)),/G13_PRIVATE_ROW_INVALID/);
 assert.throws(()=>triage(inventory(record(),record())),/G13_DUPLICATE_ROLE_RECORD/);
});
test('CLI refuses private inventory inside the public repository',()=>{
 const codePath=fileURLToPath(new URL('../labs/nexa-security/private-rpc-triage.G13-REVIEW-ONLY.mjs',import.meta.url));
 const filePath=fileURLToPath(new URL('../package.json',import.meta.url));
 assert.throws(()=>execFileSync(process.execPath,[codePath,filePath],{
  cwd:resolve(fileURLToPath(new URL('../',import.meta.url))),
  encoding:'utf8',stdio:['ignore','pipe','pipe']
 }),err=>String(err.stderr).includes('G13_PRIVATE_INVENTORY_MUST_STAY_OUTSIDE_PUBLIC_REPOSITORY'));
});

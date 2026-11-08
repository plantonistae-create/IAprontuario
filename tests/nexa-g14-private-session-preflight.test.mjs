import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assessG14PrivateReviewPlan as assess} from '../labs/nexa-security/private-session-preflight.G14-REVIEW-ONLY.mjs';
const complete=()=>({
 schema_version:'nexa-g14-session-design-v1',
 session_mode:'private_offline_design_only',change_intent:'none',
 data_handling:{storage:'external_private_review_workspace',
   data_scope:'catalog_metadata_only',no_patient_data:true,no_secrets:true,
   retention_plan_documented:true},
 roles:{db_owner_assigned:true,security_reviewer_assigned:true,
   clinical_reviewer_assigned:true,rollback_owner_assigned:true},
 evidence_plan:{effective_grants:true,function_type:true,owner_and_search_path:true,
   auth_guard:true,actor_tenant_object_scope:true,rls_and_view_dependencies:true,
   caller_dependency_map:true,baseline_capture_plan:true,rollback_plan:true},
 impact_validation:{login:'planned_synthetic_only',consent:'planned_synthetic_only',
   clinical_history:'planned_synthetic_only',audit:'planned_synthetic_only',
   clinical_record:'planned_synthetic_only',transcription_only_after_end:'planned_synthetic_only'},
 authorization:{hosted_read_sql_separately_authorized:false,
   hosted_write_sql_separately_authorized:false}
});
test('a completed documentary plan still cannot authorize hosted SQL, grants or clinical release',()=>{
 const x=assess(complete());
 assert.equal(x.documentary_plan_status,'CHECKLIST_READY_FOR_HUMAN_GOVERNANCE');
 assert.equal(x.human_scope_approval_obtained,false);
 assert.equal(x.can_run_hosted_read_sql,false);
 assert.equal(x.can_run_hosted_write_sql,false);
 assert.equal(x.can_change_grants_or_rls,false);
 assert.equal(x.clinical_release_authorized,false);
});
test('missing owner, external retention, caller map and patient workflow each remain visible STOP',()=>{
 const s=complete();
 s.roles.db_owner_assigned=false;
 s.data_handling.retention_plan_documented=false;
 s.evidence_plan.caller_dependency_map=false;
 s.impact_validation.login='not_planned';
 const x=assess(s);
 assert.equal(x.documentary_plan_status,'STOP_MISSING_DOCUMENTARY_PREPARATION');
 for(const label of ['ROLE_DB_OWNER_ASSIGNED','DATA_RETENTION_PLAN_UNDOCUMENTED',
  'EVIDENCE_PLAN_CALLER_DEPENDENCY_MAP','IMPACT_PLAN_LOGIN']){
  assert.ok(x.missing_documentary_steps.includes(label),label);
 }
 assert.equal(x.can_run_hosted_read_sql,false);
});
test('self-reported separate SQL approval cannot be smuggled in through public preflight',()=>{
 for(const k of ['hosted_read_sql_separately_authorized','hosted_write_sql_separately_authorized']){
  const s=complete();s.authorization[k]=true;
  assert.throws(()=>assess(s),/G14_HOSTED_SQL_AUTHORIZATION_CANNOT_BE_REPRESENTED_HERE/);
 }
});
test('user IDs, function names, SQL source, tokens or patient content cause strict schema rejection',()=>{
 for(const label of ['operator_id','function_name','sql_body','jwt','api_key','patient_name','admin_id','tenant_id']){
  const s=complete();s[label]='PRIVATE';
  assert.throws(()=>assess(s),/G14_INVALID_PRIVATE_REVIEW_PLAN/);
 }
 const s=complete();s.evidence_plan.sql_text='select *';
 assert.throws(()=>assess(s),/G14_INVALID_PRIVATE_REVIEW_PLAN/);
});
test('cannot describe a production write or hosted session as an offline review plan',()=>{
 for(const change of [
  {session_mode:'hosted_db_operator'},
  {change_intent:'revoke_anon'},
  {data_handling:{...complete().data_handling,storage:'public_github'}},
  {data_handling:{...complete().data_handling,no_patient_data:false}}
 ]){
  const s={...complete(),...change};
  assert.throws(()=>assess(s),/G14_INVALID_PRIVATE_REVIEW_PLAN/);
 }
});
test('no questionnaire can substitute verified actual clinical workflow tests',()=>{
 const s=complete();s.impact_validation.consent='success';
 assert.throws(()=>assess(s),/G14_INVALID_PRIVATE_REVIEW_PLAN/);
});
test('public repo CLI path is rejected, preventing accidental private plan import',()=>{
 const file=fileURLToPath(new URL('../labs/nexa-security/private-session-preflight.G14-REVIEW-ONLY.mjs',import.meta.url));
 const publicPath=fileURLToPath(new URL('../package.json',import.meta.url));
 assert.throws(()=>execFileSync(process.execPath,[file,publicPath],{
  cwd:resolve(fileURLToPath(new URL('../',import.meta.url))),
  encoding:'utf8',stdio:['ignore','pipe','pipe']
 }),err=>String(err.stderr).includes('G14_PRIVATE_PLAN_MUST_REMAIN_OUTSIDE_PUBLIC_REPOSITORY'));
});

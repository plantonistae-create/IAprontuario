// G14 - Private review SESSION DESIGN ONLY; NO hosted SQL (including SELECT).
// Cannot grant permission, authenticate an operator, inspect database or run tools.
import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
const exact=(o,keys)=>plain(o)&&Object.keys(o).sort().join('|')===keys.slice().sort().join('|');
const root=['schema_version','session_mode','change_intent','data_handling','roles','evidence_plan','impact_validation','authorization'];
const handling=['storage','data_scope','no_patient_data','no_secrets','retention_plan_documented'];
const roles=['db_owner_assigned','security_reviewer_assigned','clinical_reviewer_assigned','rollback_owner_assigned'];
const evidence=['effective_grants','function_type','owner_and_search_path','auth_guard','actor_tenant_object_scope','rls_and_view_dependencies','caller_dependency_map','baseline_capture_plan','rollback_plan'];
const impact=['login','consent','clinical_history','audit','clinical_record','transcription_only_after_end'];
const auth=['hosted_read_sql_separately_authorized','hosted_write_sql_separately_authorized'];
const bad=message=>{throw Error(message)};
export function assessG14PrivateReviewPlan(plan){
 if(!exact(plan,root)||plan.schema_version!=='nexa-g14-session-design-v1'||
  plan.session_mode!=='private_offline_design_only'||plan.change_intent!=='none'||
  !exact(plan.data_handling,handling)||
  plan.data_handling.storage!=='external_private_review_workspace'||
  plan.data_handling.data_scope!=='catalog_metadata_only'||
  plan.data_handling.no_patient_data!==true||
  plan.data_handling.no_secrets!==true||
  typeof plan.data_handling.retention_plan_documented!=='boolean'||
  !exact(plan.roles,roles)||
  !roles.every(k=>typeof plan.roles[k]==='boolean')||
  !exact(plan.evidence_plan,evidence)||
  !evidence.every(k=>typeof plan.evidence_plan[k]==='boolean')||
  !exact(plan.impact_validation,impact)||
  !impact.every(k=>['not_planned','planned_synthetic_only'].includes(plan.impact_validation[k]))||
  !exact(plan.authorization,auth))
  bad('G14_INVALID_PRIVATE_REVIEW_PLAN');
 // No authorization can be granted or claimed via a public JSON file.
 if(plan.authorization.hosted_read_sql_separately_authorized!==false||
    plan.authorization.hosted_write_sql_separately_authorized!==false)
  bad('G14_HOSTED_SQL_AUTHORIZATION_CANNOT_BE_REPRESENTED_HERE');
 const missing=[];
 for(const k of roles)if(!plan.roles[k])missing.push('ROLE_'+k.toUpperCase());
 for(const k of evidence)if(!plan.evidence_plan[k])missing.push('EVIDENCE_PLAN_'+k.toUpperCase());
 for(const k of impact)if(plan.impact_validation[k]!=='planned_synthetic_only')
  missing.push('IMPACT_PLAN_'+k.toUpperCase());
 if(!plan.data_handling.retention_plan_documented)
  missing.push('DATA_RETENTION_PLAN_UNDOCUMENTED');
 return Object.freeze({
  schema_version:'nexa-g14-private-session-assessment-v1',
  documentary_plan_status:missing.length===0?'CHECKLIST_READY_FOR_HUMAN_GOVERNANCE':'STOP_MISSING_DOCUMENTARY_PREPARATION',
  missing_documentary_steps:Object.freeze(missing),
  human_scope_approval_obtained:false,
  authenticated_operator_proven:false,
  real_acl_or_function_body_reviewed:false,
  real_tenant_access_proven:false,
  can_run_hosted_read_sql:false,
  can_run_hosted_write_sql:false,
  can_change_grants_or_rls:false,
  can_access_patient_records:false,
  can_publish_sensitive_inventory:false,
  clinical_release_authorized:false,
  follow_up:'SEPARATE_PRIVATE_AUTHORIZATION_AND_OWNER_REVIEW_REQUIRED'
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const arg=process.argv[2];
 if(!arg)bad('G14_LOCAL_PLAN_PATH_REQUIRED');
 const file=resolve(arg),root=resolve(process.cwd());
 if(file===root||file.startsWith(root+sep))
  bad('G14_PRIVATE_PLAN_MUST_REMAIN_OUTSIDE_PUBLIC_REPOSITORY');
 const plan=JSON.parse(readFileSync(file,'utf8'));
 process.stdout.write(JSON.stringify(assessG14PrivateReviewPlan(plan),null,2)+'\n');
}

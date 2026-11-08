// G13 offline RPC risk-triage. No SQL, Supabase network, migrations or hosted changes.
// PRIVATE inventory input must not contain RPC names, SQL bodies, tokens or PHI.
// Public output contains aggregate risk counts only, never object identifiers.
import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const rootKeys=['schema_version','evidence_source','rows'];
const rowKeys=[
 'private_ref','effective_role','rpc_surface','operation_class',
 'acl_verified','security_definer','auth_guard',
 'object_scope','owner_privileges','search_path_guard',
 'caller_impact','rollback_evidence','code_and_acl_review'
];
const allowed={
 effective_role:['anon','authenticated'],
 rpc_surface:['rpc_confirmed','trigger_only','unknown'],
 operation_class:['admin_mutation','clinical_read','audit_write','template_helper','other','unknown'],
 acl_verified:['explicit_grant','inherited_public','unknown'],
 auth_guard:['verified_user_identity','missing','unknown'],
 object_scope:['tenant_and_object','actor_only','not_applicable_confirmed','missing','unknown'],
 owner_privileges:['least_privilege_verified','elevated_verified','unknown'],
 search_path_guard:['pinned_safe','unsafe','unknown'],
 caller_impact:['reviewed_safe','breakage_risk','unknown'],
 rollback_evidence:['approved_offline_plan','unverified'],
 code_and_acl_review:['complete_private_review','metadata_only']
};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>plain(x)&&Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
function ensureInventory(value){
 if(!exact(value,rootKeys)||value.schema_version!=='nexa-g13-private-rpc-v1'||
    value.evidence_source!=='authorized_manual_private_review'||
    !Array.isArray(value.rows)||value.rows.length<1||value.rows.length>500)
    throw Error('G13_PRIVATE_SCHEMA_INVALID');
 const seen=new Set();
 for(const row of value.rows){
  if(!exact(row,rowKeys)||typeof row.private_ref!=='string'||
     !/^R-[0-9]{3,6}$/.test(row.private_ref)||row.security_definer!==true||
     !Object.entries(allowed).every(([k,values])=>values.includes(row[k])))
   throw Error('G13_PRIVATE_ROW_INVALID');
  const key=row.private_ref+'@'+row.effective_role;
  if(seen.has(key))throw Error('G13_DUPLICATE_ROLE_RECORD');
  seen.add(key);
 }
}
const count=(items,check)=>items.reduce((n,x)=>n+Number(check(x)),0);
export function triagePrivilegedRpcInventory(value){
 ensureInventory(value);
 const rows=value.rows;
 // Impact priority is a screening order, NOT a claim of vulnerability.
 const highImpact=new Set(['admin_mutation','clinical_read','audit_write']);
 const p0=rows.filter(x=>x.effective_role==='anon'&&highImpact.has(x.operation_class));
 const incomplete=rows.filter(x=>x.code_and_acl_review!=='complete_private_review'||
   x.acl_verified==='unknown'||x.auth_guard==='unknown'||
   x.object_scope==='unknown'||x.owner_privileges==='unknown'||
   x.search_path_guard==='unknown'||x.caller_impact==='unknown'||
   x.rollback_evidence!=='approved_offline_plan');
 const broken=rows.filter(x=>x.auth_guard==='missing'||x.object_scope==='missing'||
  x.search_path_guard==='unsafe'||x.caller_impact==='breakage_risk');
 const groups=Object.freeze({
  anon_high_impact_review_first:p0.length,
  review_incomplete_or_missing_evidence:incomplete.length,
  actual_missing_guard_or_dependency_risk_to_investigate:broken.length,
  triggered_functions_needing_rpc_reachability_check:count(rows,x=>x.rpc_surface==='trigger_only'),
  rpc_reachability_unknown:count(rows,x=>x.rpc_surface==='unknown'),
  tenant_object_guard_not_verified:count(rows,x=>x.object_scope!=='tenant_and_object'&&
    x.object_scope!=='not_applicable_confirmed'),
  elevated_definer_owner_or_unknown:count(rows,x=>x.owner_privileges!=='least_privilege_verified'),
  unsafe_or_unverified_search_path:count(rows,x=>x.search_path_guard!=='pinned_safe'),
  possible_caller_breakage:count(rows,x=>x.caller_impact!=='reviewed_safe')
 });
 return Object.freeze({
  schema_version:'nexa-g13-rpc-triage-summary-v1',
  records_reviewed:rows.length,
  role_entries_anonymous:count(rows,x=>x.effective_role==='anon'),
  role_entries_authenticated:count(rows,x=>x.effective_role==='authenticated'),
  role_entries_are_not_unique_function_counts:true,
  evidence_only_private: true,
  risk_counts:groups,
  proposed_review_classes:Object.freeze([
   'P0_PRIVILEGED_ANON_MUTATION_OR_CLINICAL_ACCESS_REVIEW',
   'AUTHENTICATED_MUST_VERIFY_ACTOR_TENANT_OBJECT',
   'TRIGGER_ONLY_NEEDS_PRIVILEGE_AND_REACHABILITY_REVIEW',
   'RESTRICT_GRANTS_ONLY_AFTER_CALLER_AND_ROLLBACK_PROOF',
   'SECURITY_INVOKER_OR_PRIVATE_SCHEMA_REQUIRES_RLS_REGRESSION'
  ]),
  runtime_acl_or_sql_body_verified_by_this_script:false,
  hosted_remediation_go:false,
  clinical_go:false,
  automatic_revoke_allowed:false,
  stop_reason:'REQUIRES_PRIVATE_HUMAN_REVIEW_AND_AUTHORIZED_STAGING_PROOF'
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const arg=process.argv[2];
 if(!arg)throw Error('G13_PASS_LOCAL_PRIVATE_INVENTORY_JSON_OUTSIDE_REPOSITORY');
 const filepath=resolve(arg),repositoryRoot=resolve(process.cwd());
 if(filepath===repositoryRoot||filepath.startsWith(repositoryRoot+sep))
   throw Error('G13_PRIVATE_INVENTORY_MUST_STAY_OUTSIDE_PUBLIC_REPOSITORY');
 const data=JSON.parse(readFileSync(filepath,'utf8'));
 process.stdout.write(JSON.stringify(triagePrivilegedRpcInventory(data),null,2)+'\n');
}

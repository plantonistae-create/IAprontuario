// G12 read-only architecture release gate. No network, database, PHI or API calls.
// This is a SCREENING CHECK, not an authorization service. It NEVER issues GO.
import {readFileSync} from 'node:fs';
const hex=/^[0-9a-f]{40}$/i;
const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const gateNames=[
 'authenticated_operator_tenant_link',
 'admin_revocation_end_to_end',
 'rls_and_rpc_privilege_review',
 'verified_signed_provider_receipt',
 'durable_nonce_hosted_trust_boundary',
 'clinical_prospective_review',
 'billable_retry_provider_idempotency',
 'invoice_reconciliation',
 'postmerge_push_and_pages'
];
const snapKeys=['schema_version','checkpoint_commit','observed_at_utc','source_types','observations','required_evidence'];
const observations=['public_tables','public_rls_enabled','public_rls_without_policies',
 'anon_security_definer_rpc','authenticated_security_definer_rpc',
 'hosted_functions_active_jwt','hosted_auth_getuser_code_path'];
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>isObject(x)&&Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
function validate(s){
 if(!exact(s,snapKeys)||s.schema_version!=='nexa-g12-readiness-snapshot-v1'||
    !hex.test(s.checkpoint_commit)||!iso.test(s.observed_at_utc)||
    !Number.isFinite(Date.parse(s.observed_at_utc)))
    throw Error('G12_READ_ONLY_SNAPSHOT_INVALID');
 if(!exact(s.source_types,['edge_versions','rls_tables','security_advisors','git_status'])||
  s.source_types.edge_versions!=='supabase_edge_functions_read_only'||
  s.source_types.rls_tables!=='supabase_table_metadata_read_only'||
  s.source_types.security_advisors!=='supabase_security_advisors_read_only'||
  s.source_types.git_status!=='github_commit_status_read_only')
  throw Error('G12_SOURCE_PROVENANCE_INVALID');
 const o=s.observations;
 if(!exact(o,observations)||!['public_tables','public_rls_enabled','public_rls_without_policies',
  'anon_security_definer_rpc','authenticated_security_definer_rpc'].every(k=>
  Number.isSafeInteger(o[k])&&o[k]>=0)||
  o.public_rls_enabled>o.public_tables||
  o.public_rls_without_policies>o.public_rls_enabled||
  !exact(o.hosted_functions_active_jwt,['realtime-call','realtime-radar','process-consultation'])||
  !exact(o.hosted_auth_getuser_code_path,['realtime-call','realtime-radar','process-consultation'])||
  !Object.values(o.hosted_functions_active_jwt).every(x=>typeof x==='boolean')||
  !Object.values(o.hosted_auth_getuser_code_path).every(x=>typeof x==='boolean'))
  throw Error('G12_METADATA_INVALID');
 if(!exact(s.required_evidence,gateNames)||!Object.values(s.required_evidence)
  .every(x=>x==='unverified'||x==='blocked'||x==='reviewed_offline'))
  throw Error('G12_EVIDENCE_UNVERIFIED_OR_UNSUPPORTED');
}
export function assessG12EvidenceSnapshot(snapshot,{asOfUTC}={}){
 validate(snapshot);
 const time=asOfUTC===undefined?Date.now():Date.parse(asOfUTC);
 if(!Number.isFinite(time))throw Error('G12_CLOCK_INVALID');
 const captured=Date.parse(snapshot.observed_at_utc);
 const ageHours=(time-captured)/36e5;
 const freshness=ageHours<0?'FUTURE_EVIDENCE':
   ageHours>24*14?'STALE_RECAP':'DATED_METADATA_ONLY';
 const o=snapshot.observations;
 const unresolved=gateNames.filter(k=>snapshot.required_evidence[k]!=='reviewed_offline');
 const blockers=[
  ...(freshness!=='DATED_METADATA_ONLY'?['SNAPSHOT_NOT_CURRENT']:[]),
  ...(o.anon_security_definer_rpc>0?['ANON_PRIVILEGED_RPC_REVIEW_REQUIRED']:[]),
  ...(o.authenticated_security_definer_rpc>0?['AUTHENTICATED_PRIVILEGED_RPC_REVIEW_REQUIRED']:[]),
  ...(o.public_rls_without_policies>0?['RLS_NO_POLICY_INTENT_REVIEW_REQUIRED']:[]),
  ...unresolved.map(x=>'EVIDENCE_'+x.toUpperCase())
 ];
 return Object.freeze({
  schema_version:'nexa-g12-release-screening-v1',
  checkpoint_commit:snapshot.checkpoint_commit,
  evidence_freshness:freshness,
  metadata_only:true,
  privileged_rpc_warning_count_anonymous:o.anon_security_definer_rpc,
  privileged_rpc_warning_count_authenticated:o.authenticated_security_definer_rpc,
  rls_no_policy_review_count:o.public_rls_without_policies,
  blockers:Object.freeze(blockers),
  clinical_prospective_validation_proven:false,
  hosted_tenant_admin_binding_proven:false,
  real_provider_invoice_verified:false,
  official_pages_publish_verified:false,
  production_go_authorized:false,
  deploy_or_migration_authorized:false,
  outcome:'NO_GO_NEEDS_AUTHORIZED_REVIEW'
 });
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const file=process.argv[2]||'labs/nexa-release/g12-observed-metadata.REVIEW-ONLY.json';
 const data=JSON.parse(readFileSync(file,'utf8'));
 const result=assessG12EvidenceSnapshot(data);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(result.production_go_authorized!==false)process.exitCode=1;
}

// G7 OFFLINE: orchestration proof only. Never export as a hosted Edge handler.
// A service_role alone CANNOT authenticate an admin: this requires an
// independent validated operator and privileged registry, not request metadata.
const uuid=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const keys=new Set(['authContext','tenantId','minAgeSeconds','batchSize']);
export function createOfflineReconcilerCoordinator(deps){
 const {getVerifiedOperator,getApprovedAuthority,reconcile,localStop}=deps||{};
 if(![getVerifiedOperator,getApprovedAuthority,reconcile,localStop].every(f=>typeof f==='function'))
  throw Error('COORDINATOR_DEPS_REQUIRED');
 return async input=>{
  async function stop(reason){
   try{await localStop({reason});}
   catch{return Object.freeze({route:'STOP',reason:'LOCAL_STOP_FAILED',automatic_paid_retry:false});}
   return Object.freeze({route:'STOP',reason,automatic_paid_retry:false});
  }
  if(!plain(input)||Object.keys(input).some(k=>!keys.has(k))||
    !uuid.test(input.tenantId||'')||
    !Number.isSafeInteger(input.minAgeSeconds)||input.minAgeSeconds<60||
    input.minAgeSeconds>86400||!Number.isSafeInteger(input.batchSize)||
    input.batchSize<1||input.batchSize>100)return stop('INVALID_REQUEST');
  let operator,authority;
  try{
   operator=await getVerifiedOperator(input.authContext);
   if(!uuid.test(operator?.id||'')||operator?.verified_via!=='auth.getUser'||
      operator?.is_anonymous!==false)return stop('OPERATOR_UNVERIFIED');
   authority=await getApprovedAuthority({operatorId:operator.id,tenantId:input.tenantId});
  }catch{return stop('AUTHORITY_UNAVAILABLE');}
  if(authority?.source!=='admin_registry'||authority?.active!==true||
    authority?.tenant_id!==input.tenantId||authority?.admin_user_id!==operator.id)
   return stop('ADMIN_NOT_APPROVED');
  try{
   const result=await reconcile({
    tenant_id:authority.tenant_id,verified_admin_user_id:operator.id,
    age_seconds:input.minAgeSeconds,batch_size:input.batchSize});
   if(result?.reconciled!==true||result?.automatic_paid_retry!==false||
      !Number.isInteger(result.closed_unknown_count)||result.closed_unknown_count<0)
    return stop('RECONCILIATION_UNVERIFIED');
   return Object.freeze({route:'CLOSED_UNKNOWN_ONLY',
    count:result.closed_unknown_count,automatic_paid_retry:false,
    remote_charge_verified:false,clinical_go:false});
  }catch{return stop('RECONCILIATION_UNAVAILABLE');}
 };
}

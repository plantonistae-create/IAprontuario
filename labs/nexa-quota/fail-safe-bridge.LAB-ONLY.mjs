// G4 OFFLINE ONLY. Never import into hosted Edge or the public web app.
// getVerifiedUser and getAdminMembership MUST be implemented by trusted SERVER code.
// Neither caller-supplied tenant nor user_metadata can authorize a remote call.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keys=new Set(['authContext','encounterId','requestId','inputTokens','outputTokens']);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function createFailSafeQuotaBridge(deps){
 const {getVerifiedUser,getAdminMembership,ownsEncounter,reserve,invokeRemote,localFallback,timeoutMs=500}=deps||{};
 if(![getVerifiedUser,getAdminMembership,ownsEncounter,reserve,invokeRemote,localFallback].every(x=>typeof x==='function')||
   !Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('LAB_ADAPTER_INVALID');
 const bounded=fn=>{
  let timer;return Promise.race([
   Promise.resolve().then(fn),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LAB_TIMEOUT')),timeoutMs);})
  ]).finally(()=>clearTimeout(timer));
 };
 return async request=>{
  let attempted=false;
  async function local(reason){
   try{await bounded(()=>localFallback({reason}));}
   catch{return Object.freeze({route:'STOP',reason:'LOCAL_FALLBACK_FAILED',remote_attempted:attempted,
    remote_outcome:attempted?'UNKNOWN':'NOT_ATTEMPTED'});}
   return Object.freeze({route:'LOCAL_REVIEW_REQUIRED',reason,remote_attempted:attempted,
    remote_outcome:attempted?'UNKNOWN':'NOT_ATTEMPTED'});
  }
  if(!obj(request)||Object.keys(request).some(k=>!keys.has(k))||
   !uuid.test(request.encounterId||'')||!uuid.test(request.requestId||'')||
   !Number.isSafeInteger(request.inputTokens)||request.inputTokens<1||
   !Number.isSafeInteger(request.outputTokens)||request.outputTokens<1)
   return local('INVALID_ADMISSION');
  try{
   // In a future Edge adapter getVerifiedUser must call auth.getUser(token);
   // never resolve identity from submitted JSON.
   const user=await bounded(()=>getVerifiedUser(request.authContext));
   if(!obj(user)||!uuid.test(user.id||'')||user.is_anonymous===true)
    return local('USER_NOT_VERIFIED');
   // Registry must be maintained by tenant administrators, not client state.
   const m=await bounded(()=>getAdminMembership(user.id));
   if(!obj(m)||m.user_id!==user.id||!uuid.test(m.tenant_id||'')||
    !uuid.test(m.authorized_by||'')||m.active!==true||
    m.source!=='admin_registry'||!Number.isFinite(Date.parse(m.authorized_at||'')))
    return local('TENANT_NOT_VERIFIED');
   if(await bounded(()=>ownsEncounter({
    user_id:user.id,tenant_id:m.tenant_id,encounter_id:request.encounterId
   }))!==true)return local('ENCOUNTER_NOT_OWNED');
   const result=await bounded(()=>reserve({
    user_id:user.id,tenant_id:m.tenant_id,encounter_id:request.encounterId,
    request_id:request.requestId,input_tokens:request.inputTokens,
    output_tokens:request.outputTokens
   }));
   // ALREADY_RESERVED != a confirmed prior remote completion. Never re-dispatch.
   if(!obj(result)||result.allowed!==true||result.reason!=='RESERVED')
    return local(result?.reason==='ALREADY_RESERVED'?'DUPLICATE_OUTCOME_UNKNOWN':'QUOTA_DENIED');
   attempted=true;
   const remote=await bounded(()=>invokeRemote({request_id:request.requestId}));
   if(!obj(remote)||remote.ok!==true)return local('REMOTE_NOT_CONFIRMED');
   return Object.freeze({route:'REMOTE_ACCEPTED',reason:'RESERVED_AND_CONFIRMED',
    remote_attempted:true,remote_outcome:'CONFIRMED'});
  }catch{
   return local(attempted?'REMOTE_RESULT_UNKNOWN':'AUTHORITY_OR_RESERVATION_UNAVAILABLE');
  }
 };
}

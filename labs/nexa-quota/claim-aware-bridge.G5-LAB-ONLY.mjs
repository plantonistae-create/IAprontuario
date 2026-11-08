// G5 laboratory adapter, never imported by production or hosted Edge.
// claimDispatch and recordOutcome MUST be private backend calls against the
// disposable database. No client-supplied user/tenant or new paid calls.
import {createFailSafeQuotaBridge} from './fail-safe-bridge.LAB-ONLY.mjs';
export function createClaimAwareBridge(adapters){
 const {claimDispatch,recordOutcome,reserve,invokeRemote}=adapters||{};
 if(![claimDispatch,recordOutcome,reserve,invokeRemote].every(x=>typeof x==='function'))
  throw Error('CLAIM_ADAPTER_REQUIRED');
 return createFailSafeQuotaBridge({
  ...adapters,
  reserve:async details=>{
   const reserved=await reserve(details);
   if(reserved?.reason!=='RESERVED'||reserved.allowed!==true)return reserved;
   const claimed=await claimDispatch({
    user_id:details.user_id,tenant_id:details.tenant_id,
    encounter_id:details.encounter_id,request_id:details.request_id
   });
   // No confirmed claim = NO remote invocation, even if quota was reserved.
   if(claimed?.dispatch!==true||claimed.reason!=='CLAIMED_ONCE')
    return {allowed:false,reason:'DISPATCH_CLAIM_UNAVAILABLE'};
   return reserved;
  },
  invokeRemote:async details=>{
   let response;
   try{
    response=await invokeRemote(details);
    if(response?.ok!==true){
     await recordOutcome({request_id:details.request_id,state:'outcome_unknown'});
     return response;
    }
    const settled=await recordOutcome({request_id:details.request_id,state:'confirmed_response'});
    if(settled?.recorded!==true)throw Error('REMOTE_SETTLEMENT_UNCONFIRMED');
    return response;
   }catch{
    // An exception after claim is not proof of zero provider spend.
    try{await recordOutcome({request_id:details.request_id,state:'outcome_unknown'});}catch{}
    throw Error('REMOTE_RESULT_UNKNOWN');
   }
  }
 });
}

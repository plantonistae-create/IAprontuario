// G6 purely local safety classification. Never dispatch or retry a paid call.
const states=new Set(['reserved','claimed','confirmed_response','outcome_unknown','missing']);
export function decideSyntheticClaimRecovery(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
   Object.keys(input).some(k=>!['state','age_seconds','authority_verified','fallback_available'].includes(k))||
   !states.has(input.state)||!Number.isSafeInteger(input.age_seconds)||input.age_seconds<0||
   typeof input.authority_verified!=='boolean'||typeof input.fallback_available!=='boolean')
   throw Error('G6_RECOVERY_INPUT_INVALID');
 let policy='KEEP_EXISTING_TERMINAL',review=false;
 if(input.state==='claimed'){
  policy=input.authority_verified&&input.age_seconds>=60?
    'SET_OUTCOME_UNKNOWN_IF_STILL_CLAIMED':'DO_NOT_SETTLE_WITHOUT_AUTHORITY_OR_AGE';
  review=true;
 }else if(input.state==='reserved'){
  policy='DO_NOT_DISPATCH_WITHOUT_ATOMIC_CLAIM';review=true;
 }else if(input.state==='missing'){
  policy='NO_REMOTE_ACTION';review=true;
 }else if(input.state==='outcome_unknown'){
  policy='RETAIN_UNKNOWN_AND_ESCALATE';review=true;
 }
 if(review&&!input.fallback_available)policy='STOP_LOCAL_FALLBACK_UNAVAILABLE';
 return Object.freeze({policy,review_required:review,automatic_paid_retry:false,
  provider_charge_verified:false,no_charge_verified:false});
}

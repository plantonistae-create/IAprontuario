// G7 metadata-only fallback classification. No requests, recordings or transcripts.
const outcomes=new Set([
 'UPSTREAM_HTTP_SUCCESS','UPSTREAM_HTTP_400','UPSTREAM_AUTH_REJECTED',
 'UPSTREAM_RATE_LIMITED','UPSTREAM_SERVER_ERROR','UPSTREAM_OTHER_HTTP_ERROR',
 'TIMEOUT_BEFORE_HTTP_STATUS','CANCELLED_BY_USER','ABORT_SOURCE_UNVERIFIED',
 'NETWORK_OR_UNKNOWN_ERROR_BEFORE_STATUS','WRAPPER_ERROR_NO_UPSTREAM_EVIDENCE',
 'NO_DIAGNOSTIC_EVIDENCE'
]);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function decideOfflineTransportFallback(trace,options){
 if(!obj(trace)||!outcomes.has(trace.outcome)||!['webrtc','chunk'].includes(trace.phase)||
  !obj(options)||Object.keys(options).some(k=>!['localReady','confirmedUserCancellation'].includes(k))||
  typeof options.localReady!=='boolean'||typeof options.confirmedUserCancellation!=='boolean')
  throw Error('TRANSPORT_POLICY_INVALID');
 if(options.confirmedUserCancellation&&trace.outcome!=='CANCELLED_BY_USER')
  throw Error('CANCELLATION_PROVENANCE_CONFLICT');
 let route,review;
 if(trace.outcome==='UPSTREAM_HTTP_SUCCESS'){
  route='REMOTE_HTTP_RECEIVED_CLINICAL_RESULT_UNVERIFIED';review=true;
 }else if(trace.outcome==='CANCELLED_BY_USER'&&options.confirmedUserCancellation){
  route='USER_CANCELLED_NO_AUTOMATIC_LOCAL_OR_REMOTE_RETRY';review=false;
 }else if(options.localReady){
  route='LOCAL_REVIEW_REQUIRED';review=true;
 }else{
  route='STOP_NO_LOCAL_FALLBACK';review=true;
 }
 return Object.freeze({route,human_review_required:review,automatic_paid_retry:false,
  provider_charge_verified:false,clinical_safety_verified:false,
  no_charge_verified:false,root_cause_verified:false});
}

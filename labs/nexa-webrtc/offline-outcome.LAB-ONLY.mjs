// G4 offline diagnostic. Strictly metadata-only: NO HTTP, SDP, tokens, audio or transcripts.
const phases=new Set(['webrtc','chunk']);
const errors=new Set(['TimeoutError','AbortError','TypeError','NetworkError','UnknownError']);
export function classifyOfflineRealtimeOutcome(x){
 if(x===null||typeof x!=='object'||Array.isArray(x)||
  Object.keys(x).some(k=>!['phase','upstreamStatus','exception','abortedByUser','wrapperStatus'].includes(k))||
  !phases.has(x.phase))throw Error('DIAGNOSTIC_INPUT_INVALID');
 const {upstreamStatus,exception,abortedByUser=false,wrapperStatus}=x;
 if(upstreamStatus!==undefined&&(!Number.isInteger(upstreamStatus)||upstreamStatus<100||upstreamStatus>599)||
  exception!==undefined&&!errors.has(exception)||
  (upstreamStatus!==undefined&&exception!==undefined)||
  typeof abortedByUser!=='boolean'||
  (wrapperStatus!==undefined&&(!Number.isInteger(wrapperStatus)||wrapperStatus<100||wrapperStatus>599)))
  throw Error('DIAGNOSTIC_INPUT_INVALID');
 let outcome,source='not_observed';
 if(upstreamStatus!==undefined){
  source='upstream_http';
  outcome=upstreamStatus>=200&&upstreamStatus<300?'UPSTREAM_HTTP_SUCCESS':
   upstreamStatus===400?'UPSTREAM_HTTP_400':
   [401,403].includes(upstreamStatus)?'UPSTREAM_AUTH_REJECTED':
   upstreamStatus===429?'UPSTREAM_RATE_LIMITED':
   upstreamStatus>=500?'UPSTREAM_SERVER_ERROR':'UPSTREAM_OTHER_HTTP_ERROR';
 }else if(exception==='TimeoutError'){
  source='transport_exception';outcome='TIMEOUT_BEFORE_HTTP_STATUS';
 }else if(exception==='AbortError'){
  source='transport_exception';
  outcome=abortedByUser?'CANCELLED_BY_USER':'ABORT_SOURCE_UNVERIFIED';
 }else if(exception){
  source='transport_exception';outcome='NETWORK_OR_UNKNOWN_ERROR_BEFORE_STATUS';
 }else if(wrapperStatus!==undefined){
  source='wrapper_only';outcome='WRAPPER_ERROR_NO_UPSTREAM_EVIDENCE';
 }else outcome='NO_DIAGNOSTIC_EVIDENCE';
 return Object.freeze({event:'nexa_webrtc_offline_g4',phase:x.phase,outcome,source,
  upstream_http_status:upstreamStatus??null,wrapper_http_status:wrapperStatus??null,
  automatic_retry_allowed:false,human_review_required:outcome!=='UPSTREAM_HTTP_SUCCESS'});
}

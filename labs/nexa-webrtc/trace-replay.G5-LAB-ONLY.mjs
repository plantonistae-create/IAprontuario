// Metadata-only simulated WebRTC trace. No fetch, network, real SDP, audio or transcripts.
import {classifyOfflineRealtimeOutcome} from './offline-outcome.LAB-ONLY.mjs';
const validTransport=new Set(['webrtc','chunk']);
export function replayOfflineRealtimeTrace({transport,events}={}){
 if(!validTransport.has(transport)||!Array.isArray(events)||!events.length||events.length>12)
  throw Error('TRACE_INVALID');
 let upstream,wrapper,exception,abortedByUser=false,localOutcome='NOT_REQUESTED',terminal=false;
 for(const e of events){
  if(!e||typeof e!=='object'||Array.isArray(e)||!['kind','status','ok'].every(x=>x)||
   Object.keys(e).some(x=>!['kind','status','ok'].includes(x)))
   throw Error('TRACE_INVALID');
  if(e.kind==='retry')throw Error('TRACE_AUTO_RETRY_FORBIDDEN');
  if(e.kind==='upstream_http'){
   if(terminal||upstream!==undefined||exception||e.ok!==undefined||!Number.isInteger(e.status))
    throw Error('TRACE_CONFLICT');
   upstream=e.status;terminal=true;
  }else if(e.kind==='wrapper_http'){
   if(wrapper!==undefined||e.ok!==undefined||!Number.isInteger(e.status))
    throw Error('TRACE_CONFLICT');
   wrapper=e.status;
  }else if(['timeout','cancel_by_user','abort_unverified','network_exception'].includes(e.kind)){
   if(terminal||e.status!==undefined||e.ok!==undefined)throw Error('TRACE_CONFLICT');
   exception=e.kind==='timeout'?'TimeoutError':e.kind==='network_exception'?'NetworkError':'AbortError';
   abortedByUser=e.kind==='cancel_by_user';terminal=true;
  }else if(e.kind==='local_fallback'){
   if(localOutcome!=='NOT_REQUESTED'||e.status!==undefined||typeof e.ok!=='boolean'||
     (!terminal&&wrapper===undefined)||upstream!==undefined&&upstream>=200&&upstream<300)
    throw Error('TRACE_CONFLICT');
   localOutcome=e.ok?'LOCAL_REVIEW_REQUIRED':'STOP_LOCAL_FAILED';
  }else throw Error('TRACE_INVALID');
 }
 const diag=classifyOfflineRealtimeOutcome({
  phase:transport,...(upstream===undefined?{}:{upstreamStatus:upstream}),
  ...(wrapper===undefined?{}:{wrapperStatus:wrapper}),
  ...(exception?{exception,abortedByUser}:{}),
 });
 return Object.freeze({...diag,local_outcome:localOutcome,
  remote_response_proven:diag.outcome==='UPSTREAM_HTTP_SUCCESS',
  paid_retry_approved:false,
  provider_root_cause_verified:false});
}

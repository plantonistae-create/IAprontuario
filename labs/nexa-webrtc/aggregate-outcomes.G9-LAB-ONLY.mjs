// G9 offline status-only technical aggregates. Absolutely no transport traffic.
import {replayOfflineRealtimeTrace} from './trace-replay.G5-LAB-ONLY.mjs';
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
export function aggregateSyntheticTransportTraces(cases){
 if(!Array.isArray(cases)||cases.length<1||cases.length>24)
  throw Error('G9_TRANSPORT_AGGREGATE_INPUT_INVALID');
 const counts={upstream_400:0,upstream_5xx:0,wrapper_only:0,timeout:0,
  user_cancelled:0,unknown_abort:0,local_stop:0,no_status:0};
 for(const c of cases){
  if(!exact(c,['transport','events']))throw Error('G9_TRANSPORT_AGGREGATE_INPUT_INVALID');
  const x=replayOfflineRealtimeTrace(c);
  if(x.outcome==='UPSTREAM_HTTP_400')counts.upstream_400++;
  if(x.outcome==='UPSTREAM_SERVER_ERROR')counts.upstream_5xx++;
  if(x.outcome==='WRAPPER_ERROR_NO_UPSTREAM_EVIDENCE')counts.wrapper_only++;
  if(x.outcome==='TIMEOUT_BEFORE_HTTP_STATUS')counts.timeout++;
  if(x.outcome==='CANCELLED_BY_USER')counts.user_cancelled++;
  if(x.outcome==='ABORT_SOURCE_UNVERIFIED')counts.unknown_abort++;
  if(x.local_outcome==='STOP_LOCAL_FAILED')counts.local_stop++;
  if(x.upstream_http_status===null)counts.no_status++;
 }
 return Object.freeze({schema_version:'nexa-g9-web-transport-offline-v1',
  synthetic_trace_count:cases.length,...counts,
  provider_root_causes_verified:false,provider_charges_verified:false,
  paid_retries_allowed:false,clinical_results_verified:false,
  status:'METADATA_OBSERVATIONAL_ONLY'});
}

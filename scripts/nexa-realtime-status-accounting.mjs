// Aggregate edge-status accounting. Technical correlation only, NOT a success
// rate for WebRTC, cost estimate, user tracking or clinical outcome.
const isCount = n => Number.isSafeInteger(n) && n>=0 && n<=1e9;
function obj(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).some(k=>!keys.includes(k)))throw Error('AGGREGATE_ALLOWLIST_ONLY');
}
export function accountRealtimeStatuses(x){
  obj(x,['window','edge','upstream','correlation']);
  obj(x.window,['start_utc','end_utc']);
  if(typeof x.window.start_utc!=='string'||typeof x.window.end_utc!=='string'||
    !/^\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\dZ$/.test(x.window.start_utc)||
    !/^\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\dZ$/.test(x.window.end_utc)||
    !Number.isFinite(Date.parse(x.window.start_utc))||
    !Number.isFinite(Date.parse(x.window.end_utc))||
    new Date(x.window.start_utc).toISOString().replace('.000Z','Z')!==x.window.start_utc||
    new Date(x.window.end_utc).toISOString().replace('.000Z','Z')!==x.window.end_utc||
    Date.parse(x.window.end_utc)<=Date.parse(x.window.start_utc)||
    Date.parse(x.window.end_utc)-Date.parse(x.window.start_utc)>86400000)
    throw Error('INVALID_WINDOW');
  obj(x.edge,['post_200','post_502','options_200']);
  obj(x.upstream,['webrtc_400']);
  obj(x.correlation,['edge_502_linked_webrtc_400']);
  const flat=[...Object.values(x.edge),...Object.values(x.upstream),...Object.values(x.correlation)];
  if(!flat.every(isCount))throw Error('INVALID_COUNT');
  const n=x.correlation.edge_502_linked_webrtc_400;
  if(n>x.edge.post_502||n>x.upstream.webrtc_400)throw Error('CORRELATION_EXCEEDS_EVENTS');
  return {
    classification:'TECHNICAL_AGGREGATE_NOT_CLINICAL_OR_BILLING',
    window:x.window,
    counts:{edge_post_200:x.edge.post_200,edge_post_502:x.edge.post_502,
      edge_options_200:x.edge.options_200,upstream_webrtc_400:x.upstream.webrtc_400,
      correlated_edge_502_to_webrtc_400:n},
    correlated_502_pct:x.edge.post_502?Math.round(10000*n/x.edge.post_502)/100:null,
    unmatched_edge_502:x.edge.post_502-n,
    webrtc_attempts:null,webrtc_established_sessions:null,webrtc_success_rate_pct:null,
    chunk_success_rate_pct:null,provider_billed_requests:null,
    measured_savings_usd:null,
    limitations:[
      'POST_200_MIXES_WEBRTC_AND_CHUNK_FALLBACK',
      'EDGE_502_CORRELATION_DOES_NOT_IDENTIFY_UPSTREAM_400_CAUSE',
      'OPTIONS_REQUESTS_ARE_NOT_MODEL_CALLS',
      'NO_PROVIDER_INVOICE_OR_AUDIO_USAGE',
      'NO_REAL_CLINICAL_OUTCOME_OR_INDIVIDUAL_EVIDENCE'
    ]
  };
}

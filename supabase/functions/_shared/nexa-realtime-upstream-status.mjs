// Technical HTTP status only. Never include SDP, tokens, requests, response bodies,
// audio, transcript, user IDs or other patient data in a diagnostic record.
const transports=new Set(['webrtc','chunk']);
export function realtimeUpstreamMetric(transport,status) {
  if(!transports.has(transport)||!Number.isInteger(status)||status<100||status>599)return null;
  return Object.freeze({
    event:'nexa_realtime_upstream_v1',
    transport,
    upstream_http_status:status,
    successful:status>=200&&status<300
  });
}
export function emitRealtimeUpstreamStatus(transport,status,log=console.info) {
  const metric=realtimeUpstreamMetric(transport,status);
  // Monitoring failures must not affect a clinical request.
  if(metric)try{log(JSON.stringify(metric))}catch{}
  return metric;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeSevenDays} from '../scripts/nexa-cost-seven-day-report.mjs';

function seven(){
 const start=Date.parse('2026-10-29T13:30:00Z');
 return {days:Array.from({length:7},(_,i)=>{
  const a=new Date(start+i*86400000).toISOString().replace('.000Z','Z');
  const b=new Date(start+(i+1)*86400000).toISOString().replace('.000Z','Z');
  const usage=i<3?[]:[{
   capability:'realtime.radar',model:'gpt-5.6-luna',events:2,
   input_tokens:1000,cached_tokens:800,output_tokens:500,reasoning_tokens:20,audio_seconds:0,
  }];
  if(i===6)usage.push({
   capability:'clinical.documentation',model:'gpt-5.6-terra',events:1,
   input_tokens:200,cached_tokens:0,output_tokens:100,reasoning_tokens:0,audio_seconds:0,
  });
  return {window:{start_utc:a,end_utc:b},usage,
   http_requests:{radar:{post:3,options:3},realtime:{post:4,options:4},consultation:{post:1,options:1}},
   technical_execution:{webrtc_attempt_logs:2,webrtc_http502_logs:2,chunk_success_logs:4,chunk_failed_logs:0,upstream_status_events:0}};
 })};
}

test('seven day run classifies 3 unobservable days without inventing zero cost',()=>{
 const r=analyzeSevenDays(seven());
 assert.equal(r.days.length,7);
 assert.equal(r.days_with_usage_observed,4);
 assert.equal(r.days[0].observed_token_estimate_usd,null);
 assert.equal(r.days[2].no_provider_usage_observed,true);
 assert.equal(r.days[3].observed_token_estimate_usd,0.000656);
 assert.deepEqual(r.coverage.days_with_radar_POST_but_no_usage_event,
  ['2026-10-29','2026-10-30','2026-10-31']);
 assert.equal(r.priced_usage_estimate_usd,0.004224);
 assert.equal(r.priced_radar_usage_estimate_usd,0.002624);
 assert.equal(r.radar_cached_input_pct,80);
 assert.equal(r.radar_output_cost_share_pct,91.46);
 assert.equal(r.savings_measured_usd,null);
 assert.equal(r.billing_reconciled,false);
});
test('WEBRTC HTTP requests are always unpriced without provider audio evidence',()=>{
 const r=analyzeSevenDays(seven());
 assert.equal(r.totals.realtime_http_posts,28);
 assert.equal(r.totals.live_asr_usage_events,0);
 assert.equal(r.coverage.days_with_realtime_POST_but_no_live_ASR_usage_event.length,7);
 assert.equal(r.coverage.unknown_billed_WebRTC_audio,true);
 assert.equal(r.coverage.http_and_provider_usage_not_a_joinable_event_stream,true);
});
test('hypothetical output and request reductions are NEVER measured financial savings',()=>{
 const r=analyzeSevenDays(seven());
 assert.equal(r.hypothetical_10pct_identical_radar_usage_usd,0.000262);
 assert.equal(r.hypothetical_10pct_less_radar_output_usd,0.00024);
 assert.equal(r.savings_measured_usd,null);
});
test('distinguishes unmatched observation clocks: usage events may exceed HTTP POSTs',()=>{
 const d=seven();d.days[4].http_requests.radar.post=1;
 const r=analyzeSevenDays(d);
 assert.deepEqual(r.coverage.days_with_radar_usage_events_exceeding_HTTP_POSTs,['2026-11-02']);
 assert.equal(r.totals.radar_usage_events,8);
});
test('rejects patient/encounter identifiers, raw logs or transcripts anywhere in input',()=>{
 for(const add of [
  x=>x.patient_name='Not permitted',
  x=>x.days[0].usage.push({patient_id:'private'}),
  x=>x.days[0].http_requests.realtime.transcript='Not permitted',
  x=>x.days[0].window.audio_payload='Not permitted',
  x=>x.days[6].usage[0].encounter_id='private',
 ]){
  const d=seven();add(d);
  assert.throws(()=>analyzeSevenDays(d),/AGGREGATES_ONLY|UNAPPROVED_CAPABILITY/);
 }
});
test('requires exactly seven consecutive UTC 24h windows',()=>{
 const truncated=seven();truncated.days.pop();
 assert.throws(()=>analyzeSevenDays(truncated),/REQUIRES_SEVEN_DAYS/);
 const reordered=seven();[reordered.days[3],reordered.days[4]]=[reordered.days[4],reordered.days[3]];
 assert.throws(()=>analyzeSevenDays(reordered),/NONCONTIGUOUS_DAYS/);
 const gap=seven();gap.days[3].window.start_utc='2026-11-01T13:30:01Z';
 assert.throws(()=>analyzeSevenDays(gap),/FULL_DAY_WINDOW_REQUIRED/);
 const local=seven();local.days[0].window.start_utc='2026-10-29T09:30:00-04:00';
 assert.throws(()=>analyzeSevenDays(local),/UTC_WINDOW_REQUIRED/);
});
test('unknown rate is not reported as zero-priced provider usage',()=>{
 const d=seven();d.days[3].usage[0].model='unknown-test-model';
 const r=analyzeSevenDays(d);
 assert.equal(r.coverage.some_usage_models_unpriced,true);
 assert.equal(r.days[3].observed_token_estimate_usd,null);
 assert.equal(r.days[3].no_provider_usage_observed,false);
});
test('seven-day analytical report is deterministic and has no network or clinical code import',()=>{
 const a=analyzeSevenDays(seven()),b=analyzeSevenDays(seven());
 assert.deepEqual(a,b);
 assert.equal(Object.hasOwn(a,'invoice_usd'),false);
 assert.equal(a.gates.includes('RECONCILE_AGGREGATED_PROVIDER_BILLING_BY_DAY_AND_MODALITY'),true);
});

test('technical aggregates expose failed observed WebRTC handshakes, not billed sessions',()=>{
 const r=analyzeSevenDays(seven());
 assert.equal(r.totals.webrtc_attempt_logs,14);
 assert.equal(r.totals.webrtc_http502_logs,14);
 assert.equal(r.totals.chunk_success_logs,28);
 assert.equal(r.totals.chunk_failed_logs,0);
 assert.equal(r.days_with_technical_execution_aggregates,7);
 assert.equal(r.observed_webrtc_http502_pct,100);
 assert.equal(r.coverage.upstream_status_events_not_observed,true);
 assert.equal(r.coverage.http_502_does_not_establish_openai_upstream_status,true);
});
test('missing technical aggregate is unknown, never silently counted as a successful session',()=>{
 const d=seven();delete d.days[3].technical_execution;
 const r=analyzeSevenDays(d);
 assert.equal(r.days_with_technical_execution_aggregates,6);
 assert.equal(r.days[3].technical_execution,null);
 assert.deepEqual(r.coverage.days_without_technical_execution_aggregates,['2026-11-01']);
});
test('technical telemetry accepts only five nonnegative integral aggregate counters',()=>{
 for(const change of [
  x=>x.days[0].technical_execution.user_id='private',
  x=>x.days[0].technical_execution.webrtc_attempt_logs=-1,
  x=>x.days[0].technical_execution.webrtc_http502_logs=3,
  x=>x.days[0].technical_execution.chunk_success_logs='4',
  x=>delete x.days[0].technical_execution.upstream_status_events,
 ]){
  const d=seven();change(d);
  assert.throws(()=>analyzeSevenDays(d),/AGGREGATES_ONLY|INVALID_TECHNICAL_AGGREGATE|INCONSISTENT_WEBRTC_FAILURES/);
 }
});

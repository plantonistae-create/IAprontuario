import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeAggregates,PRICES} from '../scripts/nexa-cost-aggregate-report.mjs';

const aggregates=()=>({
 window:{start_utc:'2026-11-04T13:30:00Z',end_utc:'2026-11-05T13:30:00Z'},
 usage:[
  {capability:'realtime.radar',model:'gpt-5.6-luna',events:941,input_tokens:4276648,
   cached_tokens:3680116,output_tokens:930928,reasoning_tokens:21180,audio_seconds:0},
  {capability:'clinical.documentation',model:'gpt-5.6-terra',events:5,input_tokens:27882,
   cached_tokens:0,output_tokens:2188,reasoning_tokens:996,audio_seconds:0},
  {capability:'clinical.assistance',model:'gpt-5.6-terra',events:5,input_tokens:6439,
   cached_tokens:0,output_tokens:3742,reasoning_tokens:851,audio_seconds:0},
  {capability:'final.transcription',model:'gpt-4o-transcribe',events:5,input_tokens:8510,
   cached_tokens:0,output_tokens:2697,reasoning_tokens:0,audio_seconds:0},
 ],
 http_requests:{
  radar:{post:922,options:928},realtime:{post:1025,options:1026},
  consultation:{post:37,options:35}
 }
});
test('cost model separates cached input, uncached input and output without double-counting reasoning',()=>{
 const report=analyzeAggregates(aggregates());
 assert.equal(report.classification,'ESTIMATE_NOT_INVOICE');
 assert.equal(report.estimated_observed_token_cost_usd,1.498069);
 assert.equal(report.radar_observed_token_cost_usd,1.310022);
 assert.equal(report.radar_output_cost_share_pct,85.27);
 assert.equal(report.usage_by_capability_and_model[0].cached_input_ratio,86.05);
 assert.equal(report.usage_by_capability_and_model[0].cost_components.output_usd,1.117114);
 assert.equal(report.measured_savings_usd,null);
 assert.equal(report.billing_reconciled,false);
});
test('never treat HTTP requests as paid usage or price unobserved realtime WebRTC',()=>{
 const report=analyzeAggregates(aggregates());
 assert.equal(report.http_requests_by_function_and_method.realtime.options,1026);
 assert.equal(report.usage_by_capability_and_model.some(x=>x.capability==='realtime.transcription'),false);
 assert.ok(report.missing.includes('REALTIME_WEBRTC_AUDIO_USAGE_AND_BILLING_NOT_OBSERVABLE'));
 assert.ok(report.missing.includes('HTTP_POST_IS_NOT_A_BILLED_MODEL_CALL'));
 assert.ok(report.estimated_observed_token_cost_usd<10);
});
test('explicit hypothetical scenarios are not measured financial savings',()=>{
 const report=analyzeAggregates(aggregates());
 assert.equal(report.hypothetical_10pct_fewer_identical_radar_token_usage_usd,0.131002);
 assert.equal(report.hypothetical_10pct_less_radar_output_usd,0.111711);
 assert.equal(report.measured_savings_usd,null);
});
test('rejects clinical content, identifiers, raw logs and invented usage counters',()=>{
 for(const extra of [
  ['transcript','Paciente com alergia a dipirona'],['patient_id','p-123'],
  ['encounter_id','e-123'],['event_message','raw upstream body']
 ]) {
  const sample=aggregates();sample.usage[0][extra[0]]=extra[1];
  assert.throws(()=>analyzeAggregates(sample),/AGGREGATES_ONLY/);
 }
 const sample=aggregates();sample.raw_logs=[{text:'clinical data'}];
 assert.throws(()=>analyzeAggregates(sample),/AGGREGATES_ONLY/);
});
test('rejects inconsistent or corrupt usage metrics',()=>{
 const invalid=[{cached_tokens:4276649},{reasoning_tokens:930929},{input_tokens:-1},
  {input_tokens:'4276648'},{events:Infinity},{audio_seconds:NaN}];
 for(const change of invalid){
  const sample=aggregates();Object.assign(sample.usage[0],change);
  assert.throws(()=>analyzeAggregates(sample));
 }
});
test('unknown model is explicitly unpriced, not assumed free',()=>{
 const sample=aggregates();sample.usage[0].model='unverified-model';
 const report=analyzeAggregates(sample);
 assert.equal(report.usage_by_capability_and_model[0].estimated_usd,null);
 assert.ok(report.missing.includes('SOME_MODELS_UNPRICED'));
 assert.equal(report.radar_observed_token_cost_usd,0);
});
test('window is bounded to 24h and must not include extra free-form fields',()=>{
 const sample=aggregates();sample.window.start_utc='2026-11-01T13:30:00Z';
 assert.throws(()=>analyzeAggregates(sample),/INVALID_WINDOW/);
 const other=aggregates();other.http_requests.realtime.user_id='private';
 assert.throws(()=>analyzeAggregates(other),/AGGREGATES_ONLY/);
});
test('rates are explicit and versioned for reproducibility, not obtained from clinical paths',()=>{
 assert.deepEqual(PRICES['gpt-5.6-luna'],{input:.2,cached:.02,output:1.2});
 assert.equal(PRICES['gpt-5.6-terra'].output,12);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOfficialBillingAggregates as analyze} from '../scripts/nexa-cost-observed-delta.mjs';

const mk = () => ({
 source:'OPENAI_OFFICIAL_BILLING_EXPORT_DECLARED',
 before:{start_utc:'2026-10-01T00:00:00Z',end_utc:'2026-10-03T00:00:00Z',
   completed_consultations:100,complete_billing:true,
   billing:[{model:'synthetic-text',modality:'text',usd:12.5},
     {model:'synthetic-audio',modality:'audio',usd:7.5}]},
 after:{start_utc:'2026-10-04T00:00:00Z',end_utc:'2026-10-06T00:00:00Z',
   completed_consultations:100,complete_billing:true,
   billing:[{model:'synthetic-text',modality:'text',usd:9.5},
     {model:'synthetic-audio',modality:'audio',usd:7.5}]},
 controls:{same_billing_project:true,same_service_tier:true,same_model_mix:true,
   case_mix_matched:true,audio_billing_complete:true,no_late_reporting:true}
});
test('synthetic official-spend comparison is descriptive, not causal savings',()=>{
 const report=analyze(mk());
 assert.equal(report.classification,'DESCRIPTIVE_OFFICIAL_BILLING_AGGREGATES');
 assert.equal(report.before.reported_spend_usd,20);
 assert.equal(report.after.reported_spend_usd,17);
 assert.equal(report.reported_gross_spend_change_usd,-3);
 assert.equal(report.reported_gross_spend_change_pct,-15);
 assert.equal(report.change_usd_per_100_completed_consultations,-3);
 assert.equal(report.provider_billing_verified_by_connector,false);
 assert.equal(report.savings_attributable_to_nexa_change_usd,null);
 assert.equal(report.measured_reduction_in_paid_remote_calls,null);
});
test('increased spend is positive, not silently counted as savings',()=>{
 const v=mk();v.after.billing[0].usd=19.5;
 assert.equal(analyze(v).reported_gross_spend_change_usd,7);
 assert.equal(analyze(v).savings_attributable_to_nexa_change_usd,null);
});
test('missing complete audio billing blocks comparable gross-spend claims',()=>{
 const v=mk();v.before.complete_billing=false;v.controls.audio_billing_complete=false;
 const r=analyze(v);
 assert.equal(r.classification,'COMPARABILITY_BLOCKED');
 assert.equal(r.reported_gross_spend_change_usd,null);
 assert.equal(r.change_usd_per_100_completed_consultations,null);
 assert.equal(r.savings_attributable_to_nexa_change_usd,null);
});
test('even matched windows cannot certify a causal saving',()=>{
 const v=mk();v.before.completed_consultations=0;
 const r=analyze(v);
 assert.equal(r.change_usd_per_100_completed_consultations,null);
 assert.equal(r.savings_attributable_to_nexa_change_usd,null);
});
test('strict allowlist rejects patient identifiers, raw logs and tokens',()=>{
 for(const field of ['patient_id','raw_log','api_key','transcript','encounter_id','sdp']){
  const v=mk();v.before[field]='SYNTHETIC-UNSAFE';
  assert.throws(()=>analyze(v),/AGGREGATE_ALLOWLIST_ONLY/);
 }
});
test('rejects duplicate slices, negative or excessive precision and unknown modality',()=>{
 for(const bad of [
  v=>v.before.billing.push({...v.before.billing[0]}),
  v=>v.before.billing[0].usd=-1,
  v=>v.before.billing[0].usd=0.0000001,
  v=>v.after.billing[0].modality='patient',
 ]){
  const v=mk();bad(v);assert.throws(()=>analyze(v));
 }
});
test('rejects overlapping, unmatched or non-UTC-day windows',()=>{
 for(const bad of [
  v=>v.after.start_utc='2026-10-02T00:00:00Z',
  v=>v.after.end_utc='2026-10-07T00:00:00Z',
  v=>v.before.start_utc='2026-10-01T12:00:00Z',
  v=>v.after.end_utc='2026-02-30T00:00:00Z'
 ]){
  const v=mk();bad(v);assert.throws(()=>analyze(v));
 }
});
test('rejects unverified source and omitted control without echoing arbitrary input',()=>{
 const v=mk();v.source='pricing-blog';
 assert.throws(()=>analyze(v),/OFFICIAL_BILLING_SOURCE_REQUIRED/);
 const w=mk();delete w.controls.same_model_mix;
 assert.throws(()=>analyze(w),/CONTROL_BOOLEAN_REQUIRED/);
});
test('all costs zero remains legitimate and percentage unknown, not 0% saving',()=>{
 const v=mk();for(const p of [v.before,v.after])for(const row of p.billing)row.usd=0;
 const r=analyze(v);assert.equal(r.reported_gross_spend_change_usd,0);
 assert.equal(r.reported_gross_spend_change_pct,null);
 assert.equal(r.savings_attributable_to_nexa_change_usd,null);
});

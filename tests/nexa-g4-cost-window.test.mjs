import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDeclaredWindows} from '../labs/nexa-cost/window-comparison.LAB-ONLY.mjs';
const sample=()=>({schema_version:'nexa-cost-aggregate-v1',
 period:{start_utc:'2026-11-01T00:00:00Z',end_utc:'2026-11-08T00:00:00Z'},
 completed_consultations:10,capabilities:[
  {capability:'realtime.radar',request_count:20,declared_cost_usd:2},
  {capability:'realtime.transcription',request_count:10,declared_cost_usd:3}],
 provider_bill_total_usd:5});
test('observational reduction in declared cost per consultation is not causal savings',()=>{
 const before=sample(),after=sample();after.completed_consultations=20;
 const x=compareDeclaredWindows(before,after);
 assert.equal(x.comparison_status,'DECLARED_OBSERVATIONAL_ONLY');
 assert.equal(x.direction,'lower');
 assert.equal(x.causal_savings_attributable_to_nexa_usd,null);
 assert.equal(x.verified_provider_invoice,false);assert.equal(x.approved_for_hosted_optimization,false);
});
test('missing modality, nonmatching period, nonreconciled invoice or zero consults prevent comparison',()=>{
 for(const modify of [
  x=>x.capabilities.pop(),
  x=>x.period.end_utc='2026-11-09T00:00:00Z',
  x=>x.provider_bill_total_usd=100,
  x=>x.completed_consultations=0
 ]){
  const after=sample();modify(after);
  assert.equal(compareDeclaredWindows(sample(),after).comparison_status,'NOT_COMPARABLE');
 }
});

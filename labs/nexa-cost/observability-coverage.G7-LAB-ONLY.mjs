// G7 metadata aggregates only; NOT imported by application runtime.
// "Unknown" describes missing instrumentation, not an unbilled provider request.
const keys=['attempts','classified','completed_consultations','declared_cost_usd','schema_version','unknown','window'];
function checked(o){
 if(o===null||typeof o!=='object'||Array.isArray(o)||
    Object.keys(o).sort().join(',')!==keys.slice().sort().join(',')||
    o.schema_version!=='nexa-observability-aggregate-v1'||
    !['baseline','candidate'].includes(o.window)||
    !['attempts','classified','unknown','completed_consultations'].every(k=>
      Number.isSafeInteger(o[k])&&o[k]>=0)||
    !Number.isFinite(o.declared_cost_usd)||o.declared_cost_usd<0||
    o.classified+o.unknown!==o.attempts||
    o.completed_consultations<1)throw Error('OBSERVABILITY_AGGREGATE_ONLY');
 return o;
}
export function compareDeclaredObservabilityCoverage(base,candidate){
 const a=checked(base),b=checked(candidate);
 if(a.window!=='baseline'||b.window!=='candidate')throw Error('OBSERVABILITY_WINDOW_INVALID');
 const frac=(n,d)=>d===0?null:Math.round(n/d*1e6)/1e6;
 return Object.freeze({
  schema_version:'nexa-g7-observability-comparison-v1',
  baseline_classification_coverage:frac(a.classified,a.attempts),
  candidate_classification_coverage:frac(b.classified,b.attempts),
  baseline_unknown_outcomes:a.unknown,
  candidate_unknown_outcomes:b.unknown,
  baseline_declared_cost_per_consultation_usd:frac(a.declared_cost_usd,a.completed_consultations),
  candidate_declared_cost_per_consultation_usd:frac(b.declared_cost_usd,b.completed_consultations),
  claim_of_causal_savings_allowed:false,
  original_provider_invoice_verified:false,
  patient_case_mix_verified:false,
  official_billing_gap_resolved:false,
  paid_retries_approved:false,
  status:'OBSERVATIONAL_DESCRIPTIVE_ONLY'
 });
}

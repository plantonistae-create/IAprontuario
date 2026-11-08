// G10 offline clinical + economic + technical evidence gate, no production UI import.
import {aggregateSyntheticReviewReadiness} from './nexa-g9-core-review-gate.mjs';
import {evaluateDeclaredDenominators} from '../labs/nexa-cost/denominator-contract.G9-LAB-ONLY.mjs';
import {aggregateSyntheticTransportTraces} from '../labs/nexa-webrtc/aggregate-outcomes.G9-LAB-ONLY.mjs';
export function evaluateSyntheticReadinessG10(input){
 const keys=['clinicalCases','before','after','transportCases'];
 if(!input||typeof input!=='object'||Array.isArray(input)||
  Object.keys(input).sort().join('|')!==keys.slice().sort().join('|'))
  throw Error('G10_SYNTHETIC_INPUT_REQUIRED');
 const c=aggregateSyntheticReviewReadiness(input.clinicalCases);
 const d=evaluateDeclaredDenominators(input.before,input.after);
 const t=aggregateSyntheticTransportTraces(input.transportCases);
 return Object.freeze({schema_version:'nexa-g10-offline-safety-review-v1',
  synthetic_clinical_cases:c.synthetic_cases,synthetic_blocked_cases:c.blocked_synthetic_cases,
  synthetic_missed_alerts:c.missed_expected_alerts,
  transport_status_only_cases:t.synthetic_trace_count,
  upstream_400_observations:t.upstream_400,
  unknown_upstream_status_count:t.no_status,
  before_outcome_coverage:d.before_outcome_coverage,
  after_outcome_coverage:d.after_outcome_coverage,
  comparable_case_mix_verified:false,
  official_provider_invoice_verified:false,
  clinical_reference_standard_verified:false,
  observed_cost_reduction_causally_attributable:false,
  live_release_allowed:false,
  new_paid_api_calls:0,
  status:'G10_ONLY_SYNTHETIC_NO_LIVE_GO'});
}

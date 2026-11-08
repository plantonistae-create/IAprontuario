// G6 offline ONLY. No clinical data, provider billing or hosted access.
// Combines synthetic shadow status with descriptive aggregate cost gate.
// A technically green benchmark is NEVER a clinical production release.
import {auditSyntheticShadowCohort} from './nexa-core-shadow-cohort.G5-LAB-ONLY.mjs';
import {auditDeclaredCostMix} from '../labs/nexa-cost/mix-gate.G5-LAB-ONLY.mjs';
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype;
export function evaluateOfflineReleaseEvidence(input){
 if(!plain(input)||Object.keys(input).sort().join(',')!=='after,before,syntheticCases')
  throw Error('G6_AGGREGATES_ONLY');
 const clinical=auditSyntheticShadowCohort(input.syntheticCases);
 const cost=auditDeclaredCostMix(input.before,input.after);
 return Object.freeze({
  schema_version:'nexa-g6-release-evidence-offline-v1',
  synthetic_case_count:clinical.synthetic_cases,
  synthetic_review_blocked_cases:clinical.review_blocked_cases,
  synthetic_expected_alert_disagreements:clinical.expected_or_forbidden_alert_disagreements,
  synthetic_speaker_risk_frames:clinical.speaker_risk_frames,
  aggregate_cost_comparison:cost.comparison_status,
  aggregate_request_mix:cost.mix_status,
  declared_cost_per_consultation_delta_usd:cost.declared_cost_per_consultation_delta_usd,
  official_invoice_verified:false,
  case_mix_comparability_verified:false,
  clinician_validated_safety:false,
  causal_savings_attributable_to_nexa_usd:null,
  paid_provider_calls:0,
  live_release_allowed:false,
  status:'NO_GO_LIVE_REQUIRES_INDEPENDENT_CLINICAL_AND_FINANCIAL_VALIDATION'
 });
}

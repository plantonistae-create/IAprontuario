// G7 offline synthetic cohort + aggregate observability review, never a live gate.
import {evaluateOfflineReleaseEvidence} from './nexa-g6-offline-release-guard.mjs';
import {compareDeclaredObservabilityCoverage} from '../labs/nexa-cost/observability-coverage.G7-LAB-ONLY.mjs';
const keys=['after','before','candidateObservability','syntheticCases','baselineObservability'];
export function evaluateOfflineEvidenceIntegrity(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!==keys.slice().sort().join(','))
  throw Error('G7_SYNTHETIC_AGGREGATES_ONLY');
 const clinical=evaluateOfflineReleaseEvidence({
  before:input.before,after:input.after,syntheticCases:input.syntheticCases});
 const observability=compareDeclaredObservabilityCoverage(
  input.baselineObservability,input.candidateObservability);
 return Object.freeze({
  schema_version:'nexa-g7-offline-integrity-v1',
  synthetic_case_count:clinical.synthetic_case_count,
  synthetic_blocked_cases:clinical.synthetic_review_blocked_cases,
  speaker_risk_frames:clinical.synthetic_speaker_risk_frames,
  request_mix:clinical.aggregate_request_mix,
  baseline_observability_fraction:observability.baseline_classification_coverage,
  candidate_observability_fraction:observability.candidate_classification_coverage,
  remote_provider_calls:0,
  provider_invoice_verified:false,
  causal_cost_savings_usd:null,
  clinical_performance_validated:false,
  live_release_allowed:false,
  status:'NO_GO_LIVE_CLINICAL_AND_BILLING_EVIDENCE_REQUIRED'
 });
}

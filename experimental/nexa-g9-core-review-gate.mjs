// G9 exclusively synthetic shadow cohort. No live clinical suggestions or PHI.
import {replayShadowCase,LAB_CONTRACT} from './nexa-core-shadow-lab.mjs';
export function aggregateSyntheticReviewReadiness(cases){
 if(!Array.isArray(cases)||cases.length<1||cases.length>24||
  cases.some(c=>c?.schema_version!==LAB_CONTRACT||c.source!=='synthetic'||
    c.deidentification_reviewed!==true))
   throw Error('G9_ONLY_SYNTHETIC_SHADOW_CASES');
 let reviewed=0,blocked=0,speakerRisks=0,alertMisses=0;
 for(const item of cases){
  const result=replayShadowCase(item),m=result.summary;
  if(m.local_and_core_api_calls!==0||m.remote_billing_usd!==null)
    throw Error('G9_REMOTE_SHADOW_NOT_ALLOWED');
  if(item.medical_review?.reviewer_verdict==='approved')reviewed++;
  if(m.status==='BLOCKED_CLINICAL_REVIEW_REQUIRED')blocked++;
  speakerRisks+=m.speaker_attribution_risk_frames;
  alertMisses+=m.missed_expected_alerts_local+m.missed_expected_alerts_core;
 }
 return Object.freeze({
  schema_version:'nexa-g9-shadow-readiness-v1',
  synthetic_cases:cases.length,synthetic_review_approved:reviewed,
  blocked_synthetic_cases:blocked,speaker_risk_frames:speakerRisks,
  missed_expected_alerts:alertMisses,
  evidence_only_synthetic:true,
  trusted_clinical_reference_standard_verified:false,
  prospective_safety_verified:false,
  promotion_to_live_allowed:false,
  remote_provider_calls:0,
  result:'OFFLINE_REVIEW_NOT_CLINICAL_CERTIFICATION'});
}

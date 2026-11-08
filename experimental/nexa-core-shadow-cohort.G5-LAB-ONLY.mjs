// G5 synthetic-only cohort aggregate. No real consultation data or remote calls.
import {replayShadowCase,LAB_CONTRACT} from './nexa-core-shadow-lab.mjs';
export function auditSyntheticShadowCohort(cases){
 if(!Array.isArray(cases)||cases.length<1||cases.length>24||
  cases.some(c=>c?.schema_version!==LAB_CONTRACT||c.source!=='synthetic'||
    c.deidentification_reviewed!==true))throw Error('SYNTHETIC_COHORT_REQUIRED');
 // Duplicate fixture IDs would count the same synthetic case repeatedly and
 // distort the cohort denominator. Reject instead of silently deduplicating.
 const caseIds=new Set();
 for(const entry of cases){
  if(typeof entry.case_id!=='string'||!entry.case_id.trim()||caseIds.has(entry.case_id.trim()))
   throw Error('SYNTHETIC_COHORT_DUPLICATE_OR_MISSING_CASE_ID');
  caseIds.add(entry.case_id.trim());
 }
 let phraseCount=0,blocked=0,critical=0,alerts=0,speaker=0;
 for(const entry of cases){
  const result=replayShadowCase(entry),s=result.summary;
  if(s.local_and_core_api_calls!==0||s.remote_billing_usd!==null)
   throw Error('REMOTE_SHADOW_NOT_ALLOWED');
  phraseCount+=s.phrase_count;
  if(s.status==='BLOCKED_CLINICAL_REVIEW_REQUIRED')blocked++;
  critical+=s.missed_critical_last_frame;
  alerts+=s.missed_expected_alerts_local+s.missed_expected_alerts_core+
   s.unexpected_alerts_local+s.unexpected_alerts_core;
  speaker+=s.speaker_attribution_risk_frames;
 }
 return Object.freeze({
  schema_version:'nexa-g5-shadow-cohort-aggregate-v1',
  synthetic_cases:cases.length,synthetic_phrases:phraseCount,
  review_blocked_cases:blocked,missed_critical_last_frame_count:critical,
  expected_or_forbidden_alert_disagreements:alerts,
  speaker_risk_frames:speaker,
  core_promotable_to_live:false,
  clinical_safety_validated:false,
  paid_provider_calls:0,official_provider_cost_usd:null,
  status:blocked||critical||alerts||speaker?'OFFLINE_SHADOW_BLOCKED':'OFFLINE_SYNTHETIC_ONLY'
 });
}

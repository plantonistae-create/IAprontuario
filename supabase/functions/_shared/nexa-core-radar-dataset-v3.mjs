// Human-reviewed, metadata-only Radar annotations for future NEXA Core training/evaluation.
// This module does not prove patient-level deidentification or grant training rights.
export const NEXA_RADAR_DATASET_SCHEMA="nexa-core-radar-labels-v3";
const ISSUE=new Set([
 "missed_question","missed_answer","false_positive","redundant_question",
 "wrong_priority","missing_red_flag","unsafe_inference","other"
]);
const OUTCOME=new Set(["confirmed","corrected","not_applicable"]);
const META=new Set(["engine_version","provider","model_version","prompt_version","evidence_version","frontend_version"]);
const ID=/^[a-z][a-z0-9_]{0,63}$/;
const VALUE=/^[A-Za-z0-9._:-]{1,80}$/;
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
export function compileRadarDatasetLabels(review){
 if(!obj(review)||review.review_state!=="reviewed"||!Array.isArray(review.labels))
  return Object.freeze({schema_version:NEXA_RADAR_DATASET_SCHEMA,reviewed:false,
   labels:[],human_review_required:true,reason:"radar_not_reviewed"});
 if(review.labels.length>24)throw Error("RADAR_LABELS_INVALID");
 const seen=new Set(),labels=[];
 for(const v of review.labels){
  if(!obj(v)||Object.keys(v).sort().join(",")!=="concept,issue,outcome"||
   typeof v.concept!=="string"||!ID.test(v.concept)||
   !ISSUE.has(v.issue)||!OUTCOME.has(v.outcome))throw Error("RADAR_LABELS_INVALID");
  const key=v.concept+":"+v.issue;
  if(seen.has(key))continue;seen.add(key);
  labels.push({concept:v.concept,issue:v.issue,outcome:v.outcome});
 }
 const raw=obj(review.capture_meta)?review.capture_meta:{};
 const versions={};
 for(const [key,value] of Object.entries(raw)){
  if(!META.has(key)||typeof value!=="string"||!VALUE.test(value))
    throw Error("RADAR_CAPTURE_VERSION_INVALID");
  versions[key]=value;
 }
 if(!Number.isInteger(review.revision)||review.revision<1)
   throw Error("RADAR_REVIEW_REVISION_REQUIRED");
 return Object.freeze({schema_version:NEXA_RADAR_DATASET_SCHEMA,reviewed:true,
  revision:review.revision,labels,versions,source:"independent_human_radar_audit",
  human_review_required:false});
}
export function coreExportSafety(){
 return Object.freeze({
  schema_version:"nexa-core-export-safety-v3",
  training_permission:"requires_separate_legal_rights_and_deidentification_review",
  leakage_unit:"audit_case_not_patient",
  patient_group_split_validated:false,
  not_ready_for_model_training:true,
  speaker_biometrics_included:false,
  raw_audio_included:false,
  raw_transcript_included:false
 });
}

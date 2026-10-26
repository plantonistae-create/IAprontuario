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


// v4 human verification: only complete case-level question assessments qualify as audited labels.
// The question text itself comes from the separately gated, human-deidentified additions.
const VERDICT=new Set(["relevant","irrelevant","uncertain"]);
const REASON=new Set(["appropriate","unrelated","duplicate","unsafe","context_dependent","wrong_priority","other"]);
const PRIORITY=new Set(["critical","high","moderate","low"]);
const QUESTION_ID=/^(?:conflict:)?[a-z][A-Za-z0-9_]{0,63}$/;
const CAPTURE_CONCEPT_ID=/^[a-z][A-Za-z0-9_]{0,63}$/;
const SAFE_QUESTION=/^[^\u0000-\u001f]{8,240}$/;
export function compileRadarQuestionReview(row,snapshotIds=[]){
 if(!obj(row)||row.review_state!=="reviewed")
  return Object.freeze({schema_version:"nexa-core-radar-question-audit-v4",
    fully_reviewed:false,question_reviews:[],missing_questions:[],
    reason:"clinician_review_incomplete"});
 const qr=Array.isArray(row.question_reviews)?row.question_reviews:[];
 if(!Array.isArray(snapshotIds)||!snapshotIds.length||
    snapshotIds.length!==qr.length||new Set(snapshotIds).size!==snapshotIds.length||
    qr.some(x=>!snapshotIds.includes(x?.question_id)))
    throw Error("RADAR_QUESTIONS_SNAPSHOT_MISMATCH");
 const missing=Array.isArray(row.missing_questions)?row.missing_questions:[];
 if(!qr.length||qr.length>150||missing.length>30)throw Error("RADAR_QUESTIONS_NOT_AUDITED");
 const idSet=new Set(),reviews=[];
 for(const q of qr){
  if(!obj(q)||Object.keys(q).sort().join(",")!=="question_id,reason_code,verdict"||
    !QUESTION_ID.test(q.question_id)||!VERDICT.has(q.verdict)||!REASON.has(q.reason_code)||
    idSet.has(q.question_id))throw Error("RADAR_QUESTION_RATING_INVALID");
  idSet.add(q.question_id);
  reviews.push({question_id:q.question_id,verdict:q.verdict,reason_code:q.reason_code});
 }
 const gaps=[],seen=new Set();
 for(const q of missing){
  if(!obj(q)||Object.keys(q).sort().join(",")!=="concept,priority,question,rationale"||
   !ID.test(q.concept)||!PRIORITY.has(q.priority)||
   typeof q.question!=="string"||!SAFE_QUESTION.test(q.question)||
   typeof q.rationale!=="string"||q.rationale.length>240||
   seen.has(q.concept+":"+q.question.toLowerCase()))
   throw Error("RADAR_MISSING_QUESTION_INVALID");
  seen.add(q.concept+":"+q.question.toLowerCase());
  gaps.push({question:q.question,concept:q.concept,priority:q.priority,rationale:q.rationale});
 }
 return Object.freeze({schema_version:"nexa-core-radar-question-audit-v4",
  fully_reviewed:true,question_reviews:reviews,missing_questions:gaps,
  source:"authenticated_clinician_review",human_review_required:false});
}


// After clinical review + separately approved deidentification, preserve the actual
// *deidentified* question text needed to teach NEXA Core why a question was relevant.
// Never copy the raw capture text: it contains only canonical IDs, concepts and priorities.
export function compileReviewedRadarQuestionInventory(coreContext,review){
 if(!obj(review)||review.review_state!=="reviewed")return [];
 const capture=Array.isArray(coreContext?.radar_capture?.items)?coreContext.radar_capture.items:[];
 const source=Array.isArray(coreContext?.radar_learning?.items)?coreContext.radar_learning.items:[];
 if(!capture.length||capture.length>150||coreContext?.radar_capture?.trace_truncated===true)
  throw Error("RADAR_REVIEW_INVENTORY_UNAVAILABLE");
 const ids=new Set(),fromId=new Map(),ambiguous=new Set();
 for(const item of source){
  if(!obj(item))continue;
  const id=String(item.id||item.concept||"");
  if(!QUESTION_ID.test(id))continue;
  if(fromId.has(id)){fromId.delete(id);ambiguous.add(id);}
  else if(!ambiguous.has(id))fromId.set(id,item);
 }
 const result=[];
 for(const item of capture){
  const id=String(item?.id||"");
  if(!QUESTION_ID.test(id)||ids.has(id)||!CAPTURE_CONCEPT_ID.test(String(item?.concept||"")))
   throw Error("RADAR_REVIEW_INVENTORY_INVALID");
  ids.add(id);
  const reviewed=fromId.get(id);
  if(!reviewed||typeof reviewed.question!=="string"||
    !reviewed.question.trim()||reviewed.question.length>360)
    throw Error("RADAR_REVIEW_QUESTION_TEXT_UNAVAILABLE");
  if(reviewed.reason!=null&&(typeof reviewed.reason!=="string"||reviewed.reason.length>360))
    throw Error("RADAR_REVIEW_REASON_INVALID");
  result.push({question_id:id,concept:item.concept,question:reviewed.question.trim(),
   reason:String(reviewed.reason||"").trim(),
   priority:["critical","high","moderate","low"].includes(item.priority)?item.priority:"moderate",
   status:String(item.status||"unknown"),red_flag:item.red_flag===true});
 }
 return result;
}

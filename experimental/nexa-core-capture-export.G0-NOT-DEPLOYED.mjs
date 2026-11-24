/**
 * NEXA Core G0: capture contract + exportable independent synthetic datasets.
 * OFFLINE / NOT DEPLOYED. No DB, audio device, storage or network access.
 * Real clinical records can be represented here for ASSISTENTIAL archival design,
 * but are NEVER exported to training by this G0 module.
 *
 * Real-case eligibility must eventually be established in a trusted backend,
 * bound to a specific source revision, verified rights, clinician review,
 * deidentification, retention/revocation and an auditable export decision.
 * Client-provided booleans/consent timestamps CANNOT prove those conditions.
 */
export const CAPTURE_SCHEMA = 'nexa-core-capture-g0';
export const DATASET_SCHEMA = 'nexa-core-independent-multitask-g0';
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = /^[a-z][a-z0-9_-]{2,63}$/;
const sha = /^sha256:[a-f0-9]{64}$/i;
const audioRef = /^lab:\/\/audio\/[a-z0-9][a-z0-9_.-]{1,127}\.(?:wav|flac|ogg)$/;
const directId = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2})|(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4})/iu;
const keys = (x,expected) => isObj(x) && Object.keys(x).sort().join('|') === [...expected].sort().join('|');
const fail = (yes,code) => { if(!yes) throw Error(code); };
const text = (x,code) => { fail(typeof x==='string'&&x.trim().length>0&&x.length<=30000&&!directId.test(x),code);return x; };
function split(caseId){
  // All tasks from one synthetic case are assigned to the SAME partition.
  let h=2166136261;for(const c of caseId){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
  const n=(h>>>0)%10000;return n<8000?'train':n<9000?'validation':'test';
}
function clone(x){return structuredClone(x)}
function shaText(x){return typeof x==='string'&&sha.test(x)}
function audioDescriptor(x){
  if(x===null)return null;
  fail(keys(x,['ref','mime','sha256','duration_ms'])&&audioRef.test(x.ref)
    &&['audio/wav','audio/flac','audio/ogg'].includes(x.mime)
    &&shaText(x.sha256)&&Number.isSafeInteger(x.duration_ms)&&x.duration_ms>0,
    'SYNTHETIC_AUDIO_ASSET_REQUIRED');
  return clone(x);
}

/** In-memory envelope for a future encrypted, owner-scoped clinical vault.
 *  This function DOES NOT persist information, authorize an AI call,
 *  establish consent or create a training dataset.
 */
export function prepareClinicalCaptureEnvelope(input){
  fail(keys(input,['schema_version','encounter_id','owner_user_id','source_version','captured_at','artifacts']),
    'CLINICAL_CAPTURE_SHAPE_REQUIRED');
  fail(input.schema_version===CAPTURE_SCHEMA&&uuid.test(input.encounter_id)
    &&uuid.test(input.owner_user_id)&&Number.isSafeInteger(input.source_version)
    &&input.source_version>0&&!Number.isNaN(Date.parse(input.captured_at)),
    'OWNER_BOUND_CLINICAL_SOURCE_REQUIRED');
  const a=input.artifacts;
  fail(keys(a,['audio_reference','raw_transcript','corrected_transcript','speaker_segments','clinical_fields','radar_events','physician_corrections','model_versions'])
    &&(a.audio_reference===null||typeof a.audio_reference==='string')
    &&typeof a.raw_transcript==='string'&&typeof a.corrected_transcript==='string'
    &&Array.isArray(a.speaker_segments)&&isObj(a.clinical_fields)
    &&Array.isArray(a.radar_events)&&Array.isArray(a.physician_corrections)
    &&isObj(a.model_versions),'CLINICAL_ARTIFACTS_REQUIRED');
  return Object.freeze({
    schema_version:CAPTURE_SCHEMA,origin:'clinical_assistance',
    encounter_id:input.encounter_id,owner_user_id:input.owner_user_id,
    source_version:input.source_version,captured_at:input.captured_at,
    artifacts:clone(a),contains_sensitive_clinical_data:true,
    persistently_saved:false,clinical_storage_required:true,
    training_export_allowed:false,training_authorized:false,
    external_egress_authorized:false
  });
}

/** Produces real JSONL bytes for fully ORIGINAL, reviewed, synthetic LAB
 *  cases only. Does not read files or export clinical records.
 *  Audio is referenced, never embedded or fetched; the asset itself must be
 *  separately supplied and lawfully usable. Empty audio means no ASR row.
 */
export function buildIndependentSyntheticBundle(items,{datasetVersion}={}){
  fail(typeof datasetVersion==='string'&&/^[a-z0-9][a-z0-9._-]{2,79}$/.test(datasetVersion),
    'DATASET_VERSION_REQUIRED');
  fail(Array.isArray(items)&&items.length>0&&items.length<=500,'SYNTHETIC_BATCH_REQUIRED');
  const seen=new Set(),asr=[],radar=[],documentation=[];
  for(const item of items){
    if(item?.origin==='clinical_assistance'||item?.origin==='real_clinical')
      throw Error('REAL_CLINICAL_TRAINING_EXPORT_BLOCKED');
    fail(keys(item,['case_id','origin','provenance','audio','reference_transcript','clinical_context','radar_questions','reference_documentation'])
      &&id.test(item.case_id)&&!seen.has(item.case_id)&&item.origin==='synthetic_original',
      'INDEPENDENT_SYNTHETIC_CASE_REQUIRED');
    seen.add(item.case_id);
    const p=item.provenance;
    fail(keys(p,['original_human_authored','no_real_patient_data','no_provider_output_labels','reviewed_by_clinician','rights_confirmed'])
      &&Object.values(p).every(v=>v===true),'SYNTHETIC_PROVENANCE_NOT_VERIFIED');
    const transcript=text(item.reference_transcript,'INDEPENDENT_TRANSCRIPT_REQUIRED');
    const context=text(item.clinical_context,'ORIGINAL_CONTEXT_REQUIRED');
    const doc=text(item.reference_documentation,'INDEPENDENT_DOCUMENTATION_REQUIRED');
    fail(Array.isArray(item.radar_questions)&&item.radar_questions.length<=64,
      'RADAR_REFERENCE_REQUIRED');
    const concepts=new Set();
    const questions=item.radar_questions.map(q=>{
      fail(keys(q,['concept_id','question'])&&id.test(q.concept_id)
        &&!concepts.has(q.concept_id),'RADAR_CONCEPT_INVALID');
      concepts.add(q.concept_id);
      return {concept_id:q.concept_id,question:text(q.question,'ORIGINAL_RADAR_QUESTION_REQUIRED')};
    });
    const base={schema_version:DATASET_SCHEMA,dataset_version:datasetVersion,
      case_id:item.case_id,split:split(item.case_id),origin:'synthetic_original'};
    const a=audioDescriptor(item.audio);
    if(a)asr.push(JSON.stringify({...base,task:'asr',input:{audio:a},
      target:{transcript}}));
    radar.push(JSON.stringify({...base,task:'radar',
      input:{clinical_context:context},
      target:{questions}}));
    documentation.push(JSON.stringify({...base,task:'documentation',
      input:{clinical_context:context},
      target:{documentation:doc}}));
  }
  const jsonl=rows=>rows.length?rows.join('\n')+'\n':'';
  return Object.freeze({
    schema_version:DATASET_SCHEMA,
    dataset_version:datasetVersion,
    status:'SYNTHETIC_LAB_EXPORT_READY',
    partitions:['train','validation','test'],
    case_count:seen.size,
    counts:{asr:asr.length,radar:radar.length,documentation:documentation.length},
    files:{asr_jsonl:jsonl(asr),radar_jsonl:jsonl(radar),
      documentation_jsonl:jsonl(documentation)},
    training_on_real_patients_allowed:false,
    clinical_deployment_authorized:false
  });
}

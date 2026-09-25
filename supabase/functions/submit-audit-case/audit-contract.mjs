const DIRECT_IDENTIFIER_KEY=/^(?:nome(?:_do)?_?paciente|patient_?name|cpf|rg|telefone|phone|celular|mobile|email|e_?mail|endereco|address|cep|documento|document_?id|patient_?id|medical_?record|prontuario|matricula)$/i;
const EMAIL=/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/;
const CPF=/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const PHONE=/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}\b/;
const EXPLICIT_NAME=/(?:\b(?:nome|paciente)\s*[:=-]\s*)(?:[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇ][\p{L}'-]+(?:\s+|$)){2,}/iu;

export function isPlainObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value)}
export function cleanStringArray(value,max=12){if(!Array.isArray(value))return[];return value.filter(x=>typeof x==='string').map(x=>String(x).trim().slice(0,800)).filter(Boolean).slice(0,max)}
export function cleanObjectArray(value,max=80){if(!Array.isArray(value))return[];return value.filter(isPlainObject).slice(0,max).map(x=>({...x}))}
export function normalizeSnapshotVersion(value){const v=String(value||'final-v1').trim();return /^[A-Za-z0-9._-]{1,80}$/.test(v)?v:'final-v1'}

function safeObject(value){return isPlainObject(value)?value:{}}
export function safeCoreContext(input={}){
  const hv=safeObject(input.hypothesis_validation),radar=safeObject(input.radar_learning),provenance=safeObject(input.provenance);
  const destination=safeObject(input.destination),snapshot=safeObject(input.audit_submission_snapshot),layers=safeObject(input.learning_layers);
  return{
    schema_version:String(input.schema_version||'3').slice(0,20),
    case_mode:String(input.case_mode||'').slice(0,40),
    hypothesis_validation:{status:String(hv.status||'').slice(0,40),ai:String(hv.ai||'').slice(0,4000),final:String(hv.final||'').slice(0,4000),cid:String(hv.cid||'').slice(0,80),source:String(hv.source||'').slice(0,120)},
    clinical_plan:isPlainObject(input.clinical_plan)?input.clinical_plan:{},
    protocol_usage:cleanObjectArray(input.protocol_usage,24),
    radar_learning:{chief_complaint:String(radar.chief_complaint||'').slice(0,1500),covered:cleanStringArray(radar.covered),missing:cleanStringArray(radar.missing),questions:cleanStringArray(radar.questions),alerts:cleanStringArray(radar.alerts),items:cleanObjectArray(radar.items,100),answers:safeObject(radar.answers)},
    destination:{recommended:String(destination.recommended||'').slice(0,40),final:String(destination.final||'').slice(0,40),status:String(destination.status||'').slice(0,40),source:String(destination.source||'').slice(0,120),updated_at:String(destination.updated_at||'').slice(0,80),recommendation_stale:!!destination.recommendation_stale,reason:String(destination.reason||'').slice(0,2000)},
    learning_layers:{original_ai:safeObject(layers.original_ai),physician_final:safeObject(layers.physician_final),audit_corrected:layers.audit_corrected==null?null:safeObject(layers.audit_corrected)},
    audit_submission_snapshot:{captured_at:String(snapshot.captured_at||'').slice(0,80),source_consultation_id:String(snapshot.source_consultation_id||'').slice(0,80),source_updated_at:String(snapshot.source_updated_at||'').slice(0,80),source_sync_version:Math.max(0,Number(snapshot.source_sync_version||0)),immutable_submission:snapshot.immutable_submission!==false,capture_reason:String(snapshot.capture_reason||'').slice(0,80),frontend_version:String(snapshot.frontend_version||'').slice(0,80),reviewed_at:String(snapshot.reviewed_at||'').slice(0,80)},
    provenance:{app_version:String(provenance.app_version||snapshot.frontend_version||'').slice(0,120),reviewed_documentation:true,radar_raw_transcript_saved:false,official_source:'final_review'}
  }
}

export function findDirectPii(value,path='$',issues=[]){
  if(typeof value==='string'){
    if(EMAIL.test(value))issues.push(`${path}:email`);
    if(CPF.test(value))issues.push(`${path}:cpf`);
    if(PHONE.test(value))issues.push(`${path}:phone`);
    if(EXPLICIT_NAME.test(value))issues.push(`${path}:explicit_name`);
    return issues;
  }
  if(Array.isArray(value)){value.forEach((v,i)=>findDirectPii(v,`${path}[${i}]`,issues));return issues}
  if(isPlainObject(value))for(const[k,v]of Object.entries(value)){
    if(DIRECT_IDENTIFIER_KEY.test(k)&&v!=null&&String(v).trim())issues.push(`${path}.${k}:direct_key`);
    findDirectPii(v,`${path}.${k}`,issues);
  }
  return issues;
}

export function validateDeidentifiedEnvelope(deid,{requireLearningLayers=false}={}){
  if(!isPlainObject(deid))return{ok:false,error:'INVALID_DEIDENTIFICATION_JSON',issues:['$:not_object']};
  if(!isPlainObject(deid.fields))return{ok:false,error:'DEIDENTIFICATION_FIELDS_REQUIRED',issues:['$.fields:missing']};
  if(!isPlainObject(deid.core_context))return{ok:false,error:'DEIDENTIFICATION_CORE_CONTEXT_REQUIRED',issues:['$.core_context:missing']};
  if(requireLearningLayers&&!isPlainObject(deid.core_context.learning_layers))return{ok:false,error:'DEIDENTIFICATION_LEARNING_LAYERS_REQUIRED',issues:['$.core_context.learning_layers:missing']};
  const issues=findDirectPii({fields:deid.fields,core_context:deid.core_context});
  return issues.length?{ok:false,error:'DEIDENTIFICATION_PII_REMAINS',issues}:{ok:true,error:null,issues:[]};
}

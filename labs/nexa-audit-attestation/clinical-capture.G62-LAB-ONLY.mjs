/* G62 SYNTHETIC clinical capture adapter. Isolated Node lab, no UI or reset access. */
import {canonicalEnvelope, clinicalDigest, ENVELOPE_SCHEMA, FIELDS, SECTIONS} from './authority-model.G60-LAB-ONLY.mjs';
const FORM=Object.freeze([
 'queixa_principal','hda','comorbidades','antecedentes','medicacoes','alergias',
 'hipotese_diagnostica','orientacoes_alta','sugestoes_perguntas','exame_fisico','sinais_vitais','conduta'
].sort());
const EXTRAS=Object.freeze(['exames_sugeridos','prescricao','conduta'].sort());
const SHAPE=Object.freeze({
 audit_context:{caseId:'string',auditVersion:'positive',sourceVersion:'positive',reviewStatus:'string',lockedAt:'string'},
 clinical_plan:{conduct:'string',exams:['string'],prescriptions:['string']},
 consent:{recordedAt:'string',granted:'boolean',withdrawn:'boolean',scope:'string'},
 destination:{decision:'string',followUp:'string'},
 hypothesis_review:{ai:'string',final:'string',cid:'string',status:'string',alternatives:['string'],discarded:['string']},
 medication_review:{current:['string'],allergies:['string'],interactions:['string'],reviewComplete:'boolean'},
 processing_meta:{provider:'string',model:'string',stages:['string'],appVersion:'string',pipelineVersion:'string',originalNexaFields:'fields',speakerAttribution:[{speaker:'string',confidence:'string'}],processingDurationMs:'positiveOrZero',rawAudioDisposed:'boolean'},
 protocol_usage:[{id:'string',version:'string'}],
 radar_review:{covered:['string'],missing:['string'],questions:[{id:'string',text:'string'}],alerts:['string'],ledger:[{id:'string',action:'string'}],provenance:'string'},
 supplemental_clinical_data:{includeHypothesis:'boolean',attachments:[{name:'string',type:'string'}],clinicalNotes:['string']},
 transcription:{status:'string',finalText:'string',visibleOnlyAfterProcess:'boolean',speakers:[{id:'string',role:'string'}],unprocessedAudio:'boolean'},
});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const keys=o=>Object.keys(o).sort();
const exact=(o,arr)=>object(o)&&JSON.stringify(keys(o))===JSON.stringify([...arr].sort());
const noError=(code)=>Object.freeze({status:'STOP',code,resetAuthorized:false});
const clone=v=>structuredClone(v);
function shape(v,rule,where='root',depth=0){
 if(depth>24)throw Error('SCHEMA_TOO_DEEP');
 if(rule==='string'){if(typeof v!=='string')throw Error('TYPE_MISMATCH:'+where);return}
 if(rule==='boolean'){if(typeof v!=='boolean')throw Error('TYPE_MISMATCH:'+where);return}
 if(rule==='positive'||rule==='positiveOrZero'){
  if(!Number.isSafeInteger(v)||(rule==='positive'&&v<1)||(rule==='positiveOrZero'&&v<0))
   throw Error('TYPE_MISMATCH:'+where);
  return;
 }
 if(rule==='fields'){
  if(!exact(v,FIELDS))throw Error('UNMAPPED_NESTED_CLINICAL_FIELD:'+where);
  for(const k of FIELDS)shape(v[k],'string',where+'.'+k,depth+1);
  return;
 }
 if(Array.isArray(rule)){
  if(!Array.isArray(v)||v.length>1000)throw Error('TYPE_MISMATCH:'+where);
  for(let i=0;i<v.length;i++)shape(v[i],rule[0],where+'['+i+']',depth+1);
  return;
 }
 if(!exact(v,Object.keys(rule)))throw Error('UNMAPPED_NESTED_METADATA:'+where);
 for(const k of Object.keys(rule))shape(v[k],rule[k],where+'.'+k,depth+1);
}
function mergeFields({bridgeFields,domFields,extras}){
 if(!exact(bridgeFields,FORM))throw Error('BRIDGE_FIELD_REGISTRY_CHANGED');
 if(!object(domFields)||!object(extras))throw Error('FIELD_SOURCE_INVALID');
 if(!exact(extras,EXTRAS))throw Error('EXTRA_FIELD_REGISTRY_CHANGED');
 const dkeys=keys(domFields);
 if(dkeys.some(k=>!FORM.includes(k)))throw Error('DYNAMIC_FIELD_UNMAPPED');
 for(const k of FORM)if(typeof bridgeFields[k]!=='string')throw Error('BRIDGE_FIELD_TYPE_INVALID');
 for(const k of dkeys){
  if(typeof domFields[k]!=='string')throw Error('DYNAMIC_FIELD_TYPE_INVALID');
  if(domFields[k]!==bridgeFields[k])throw Error('COMPETING_FIELD_VALUES');
 }
 for(const k of EXTRAS)if(typeof extras[k]!=='string')throw Error('EXTRA_FIELD_TYPE_INVALID');
 if(extras.conduta!==bridgeFields.conduta)throw Error('COMPETING_CONDUCT_VALUES');
 const merged={...bridgeFields,exames_sugeridos:extras.exames_sugeridos,prescricao:extras.prescricao};
 if(!exact(merged,FIELDS))throw Error('CLINICAL_FIELD_COVERAGE_INVALID');
 return merged;
}
export function captureSyntheticClinicalEnvelope(input){
 try{
  if(!exact(input,['bridgeFields','domFields','extras','includeHypothesis','sections']))
    throw Error('INPUT_SCOPE_INVALID');
  if(typeof input.includeHypothesis!=='boolean')throw Error('INCLUDE_DIAGNOSIS_TYPE_INVALID');
  const fields=mergeFields(input);
  const expected=SECTIONS.filter(x=>x!=='fields');
  if(!exact(input.sections,expected))throw Error('SECTION_REGISTRY_CHANGED');
  const sections=clone(input.sections);
  for(const [name,expectedShape] of Object.entries(SHAPE)){
   shape(sections[name],expectedShape,name);
  }
  if(sections.supplemental_clinical_data.includeHypothesis!==input.includeHypothesis)
   throw Error('INCLUDE_DIAGNOSIS_NOT_PRESERVED');
  if(sections.processing_meta.rawAudioDisposed!==true||
     sections.transcription.status!=='processed'||
     sections.transcription.visibleOnlyAfterProcess!==true||
     sections.transcription.unprocessedAudio!==false)
    throw Error('FINAL_TRANSCRIPTION_NOT_READY');
  if(sections.consent.granted!==true||sections.consent.withdrawn!==false)
    throw Error('CONSENT_MISSING_OR_WITHDRAWN');
  if(sections.audit_context.reviewStatus!=='reviewed'||sections.audit_context.lockedAt.length===0)
    throw Error('AUDIT_STATE_UNVERIFIED');
  if(JSON.stringify(sections.processing_meta.originalNexaFields)===JSON.stringify(fields)){
   // Equality is valid in a fixture, but not required for historic AI notes.
  }
  sections.fields=fields;
  const envelope={schema:ENVELOPE_SCHEMA,sections};
  canonicalEnvelope(envelope);
  return Object.freeze({status:'SYNTHETIC_CAPTURED',envelope,digest:clinicalDigest(envelope),
    realSourceCoverage:false, resetAuthorized:false});
 }catch(e){
  const reason=String(e?.message||'CAPTURE_INVALID').slice(0,180);
  return Object.freeze({status:'STOP',code:reason,resetAuthorized:false});
 }
}
export const SYNTHETIC_CAPTURE_SCHEMAS=Object.freeze({
 form:FORM,extras:EXTRAS,sectionNames:SECTIONS,nested:SHAPE,
});

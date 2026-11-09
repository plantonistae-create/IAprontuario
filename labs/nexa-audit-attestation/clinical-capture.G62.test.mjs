import test from 'node:test';
import assert from 'node:assert/strict';
import {clinicalDigest, FIELDS} from './authority-model.G60-LAB-ONLY.mjs';
import {captureSyntheticClinicalEnvelope,SYNTHETIC_CAPTURE_SCHEMAS} from './clinical-capture.G62-LAB-ONLY.mjs';
const dup=x=>structuredClone(x);
const make=()=>{
 const bridgeFields=Object.fromEntries(SYNTHETIC_CAPTURE_SCHEMAS.form.map(k=>[k,'']));
 bridgeFields.hda='Dor exclusivamente sintética';bridgeFields.queixa_principal='Queixa sintética';
 bridgeFields.conduta='Plano sintético';bridgeFields.hipotese_diagnostica='Hipótese sintética';
 const extras={conduta:bridgeFields.conduta,exames_sugeridos:'ECG fictício',prescricao:'Medicação fictícia, sem dose'};
 const fields={...bridgeFields,exames_sugeridos:extras.exames_sugeridos,prescricao:extras.prescricao};
 const sections={
  audit_context:{caseId:'audit-fixture',auditVersion:3,sourceVersion:6,reviewStatus:'reviewed',lockedAt:'synthetic-review'},
  clinical_plan:{conduct:'Observação sintética',exams:['Exame fictício'],prescriptions:['Sem prescrição real']},
  consent:{recordedAt:'2026-11-09T13:00:00.000Z',granted:true,withdrawn:false,scope:'lab-consent'},
  destination:{decision:'Observação fictícia',followUp:'Exemplo local'},
  hypothesis_review:{ai:'Hipótese IA falsa',final:'Hipótese validada simulada',cid:'R07',status:'reviewed',alternatives:['A'],discarded:[]},
  medication_review:{current:['Remédio sintético'],allergies:['Nenhuma relatada no fixture'],interactions:[],reviewComplete:true},
  processing_meta:{provider:'synthetic',model:'fake',stages:['ASR-test'],appVersion:'G62',pipelineVersion:'lab',
   originalNexaFields:Object.fromEntries(FIELDS.map(k=>[k,''])),
   speakerAttribution:[{speaker:'doctor-fixture',confidence:'unknown'}],
   processingDurationMs:1200,rawAudioDisposed:true},
  protocol_usage:[{id:'lab-protocol',version:'v1'}],
  radar_review:{covered:['Sintoma sintético'],missing:[],questions:[{id:'question-1',text:'Questão hipotética?'}],alerts:[],
   ledger:[{id:'question-1',action:'answer'}],provenance:'synthetic'},
  supplemental_clinical_data:{includeHypothesis:true,attachments:[{name:'attachment-fixture',type:'text/plain'}],clinicalNotes:['Adendo fictício']},
  transcription:{status:'processed',finalText:'Somente após processamento.',visibleOnlyAfterProcess:true,
   speakers:[{id:'speaker-1',role:'physician'}],unprocessedAudio:false}
 };
 return {bridgeFields,domFields:{hda:bridgeFields.hda},extras,includeHypothesis:true,sections};
};
const assess=source=>captureSyntheticClinicalEnvelope(source);
const stop=(x,expected)=>{assert.equal(x.status,'STOP');assert.equal(x.resetAuthorized,false);if(expected)assert.match(x.code,new RegExp(expected));};
test('G62 approved synthetic capture is never a reset authorization',()=>{
 const r=assess(make());
 assert.equal(r.status,'SYNTHETIC_CAPTURED');assert.equal(r.resetAuthorized,false);
 assert.equal(r.realSourceCoverage,false);
 assert.match(r.digest,/^sha256:[a-f0-9]{64}$/);
 assert.equal(r.envelope.sections.fields.prescricao,'Medicação fictícia, sem dose');
 assert.equal(r.envelope.sections.supplemental_clinical_data.includeHypothesis,true);
});
test('unknown or renamed dynamic DOM fields produce STOP, not silent drop',()=>{
 for(const key of ['new_clinical_item','prescricao','patient_name']){
  const f=make();f.domFields[key]='field from unknown widget';
  stop(assess(f),'DYNAMIC_FIELD_UNMAPPED');
 }
});
test('known dynamic DOM fields must match bridge fields exactly',()=>{
 const f=make();f.domFields.hda+=' ';stop(assess(f),'COMPETING_FIELD_VALUES');
 const other=make();other.domFields.queixa_principal=other.bridgeFields.queixa_principal;
 assert.equal(assess(other).status,'SYNTHETIC_CAPTURED');
});
test('bridge must include all 12 known source fields, never default missing to empty',()=>{
 const f=make();delete f.bridgeFields.alergias;stop(assess(f),'BRIDGE_FIELD_REGISTRY_CHANGED');
 const other=make();other.bridgeFields.newClinicalNote='field';stop(assess(other),'BRIDGE_FIELD_REGISTRY_CHANGED');
});
test('prescription and suggested exams must be explicit in extras',()=>{
 const f=make();delete f.extras.prescricao;stop(assess(f),'EXTRA_FIELD_REGISTRY_CHANGED');
 const x=make();x.extras.newClinicalOrder='new';stop(assess(x),'EXTRA_FIELD_REGISTRY_CHANGED');
});
test('conduct from autosave and bridge cannot diverge',()=>{
 const f=make();f.extras.conduta='Outro plano';stop(assess(f),'COMPETING_CONDUCT_VALUES');
});
test('unknown capture top-level keys are forbidden',()=>{
 const f=make();f.unmappedAudioMetadata='extra';stop(assess(f),'INPUT_SCOPE_INVALID');
});
test('unknown clinical section and missing section are both forbidden',()=>{
 const f=make();f.sections.otherMetadata={value:'synthetic'};stop(assess(f),'SECTION_REGISTRY_CHANGED');
 const missing=make();delete missing.sections.radar_review;stop(assess(missing),'SECTION_REGISTRY_CHANGED');
});
test('unknown nested fields in each clinical section are blocked by explicit schema',()=>{
 for(const section of Object.keys(make().sections)){
  if(section==='protocol_usage')continue;
  const f=make();f.sections[section].extraMedicalFact='synthetic';
  stop(assess(f),'UNMAPPED_NESTED_METADATA');
 }
 const protocol=make();protocol.sections.protocol_usage[0].newProtocolDecision='yes';
 stop(assess(protocol),'UNMAPPED_NESTED_METADATA');
});
test('missing key inside each clinical section is rejected',()=>{
 for(const name of Object.keys(make().sections)){
  if(name==='protocol_usage')continue;
  const f=make(),key=Object.keys(f.sections[name])[0];delete f.sections[name][key];
  stop(assess(f),'UNMAPPED_NESTED_METADATA');
 }
});
test('unexpected nested medication review or question metadata causes STOP',()=>{
 const f=make();f.sections.medication_review.allergies=[{name:'new allergy structure'}];
 stop(assess(f),'TYPE_MISMATCH');
 const g=make();g.sections.radar_review.ledger.push({id:'x',action:'answer',source:'unmapped'});
 stop(assess(g),'UNMAPPED_NESTED_METADATA');
});
test('unknown original AI source fields cannot be treated as audited clinical data',()=>{
 const f=make();f.sections.processing_meta.originalNexaFields.extraMedication='unknown';
 stop(assess(f),'UNMAPPED_NESTED_CLINICAL_FIELD');
});
test('wrong scalar/array types and unsafe integers block captured data',()=>{
 const f=make();f.sections.audit_context.sourceVersion='6';stop(assess(f),'TYPE_MISMATCH');
 const g=make();g.sections.processing_meta.processingDurationMs=NaN;stop(assess(g),'TYPE_MISMATCH');
 const h=make();h.sections.clinical_plan.exams='not-array';stop(assess(h),'TYPE_MISMATCH');
});
test('inclusion checkbox must be retained in supplemental clinical data',()=>{
 const f=make();f.includeHypothesis=false;stop(assess(f),'INCLUDE_DIAGNOSIS_NOT_PRESERVED');
 const g=make();g.includeHypothesis='true';stop(assess(g),'INCLUDE_DIAGNOSIS_TYPE_INVALID');
});
test('audio not yet processed, prematurely visible transcript and pending audio block',()=>{
 const changes=[
  ['status','recording'],
  ['visibleOnlyAfterProcess',false],
  ['unprocessedAudio',true]
 ];
 for(const [key,value] of changes){
  const f=make();f.sections.transcription[key]=value;
  stop(assess(f),'FINAL_TRANSCRIPTION_NOT_READY');
 }
 const g=make();g.sections.processing_meta.rawAudioDisposed=false;
 stop(assess(g),'FINAL_TRANSCRIPTION_NOT_READY');
});
test('consent withdrawn or not recorded blocks synthetic final capture',()=>{
 for(const edit of [
  f=>{f.sections.consent.withdrawn=true},
  f=>{f.sections.consent.granted=false},
  f=>{f.sections.consent.scope='';f.sections.consent.granted=false},
 ]){
  const f=make();edit(f);stop(assess(f),'CONSENT_MISSING_OR_WITHDRAWN');
 }
});
test('review state missing prevents capture',()=>{
 const f=make();f.sections.audit_context.reviewStatus='pending';stop(assess(f),'AUDIT_STATE_UNVERIFIED');
 const g=make();g.sections.audit_context.lockedAt='';stop(assess(g),'AUDIT_STATE_UNVERIFIED');
});
test('each section and each dynamic extra changes the synthetic digest',()=>{
 const source=make(),base=assess(source);
 assert.equal(base.status,'SYNTHETIC_CAPTURED');
 const changes=[
  f=>{f.bridgeFields.hda+=' alteração';f.domFields.hda=f.bridgeFields.hda},
  f=>{f.extras.prescricao+=' nova prescrição'},
  f=>{f.extras.exames_sugeridos+=' alteração'},
  f=>{f.sections.medication_review.current.push('Outra medicação fictícia')},
  f=>{f.sections.clinical_plan.prescriptions.push('Exemplo fictício')},
  f=>{f.sections.radar_review.alerts.push('Alerta hipotético')},
  f=>{f.sections.hypothesis_review.final+=' revisão'},
  f=>{f.sections.consent.recordedAt+=' retificação'},
  f=>{f.sections.destination.followUp+=' nova orientação'},
  f=>{f.sections.processing_meta.stages.push('postprocess')},
  f=>{f.sections.transcription.finalText+=' trecho adicional'},
  f=>{f.sections.audit_context.caseId+=' revised'},
  f=>{f.sections.protocol_usage[0].version='v2'},
  f=>{f.sections.supplemental_clinical_data.clinicalNotes.push('Anotação sintética nova')}
 ];
 for(const change of changes){
  const f=make();change(f);const r=assess(f);
  assert.equal(r.status,'SYNTHETIC_CAPTURED',JSON.stringify(change.toString()));
  assert.notEqual(r.digest,base.digest);
 }
});
test('same facts with shuffled keys produce an identical canonical digest',()=>{
 const f=make(),r=assess(f);assert.equal(r.status,'SYNTHETIC_CAPTURED');
 f.sections=Object.fromEntries(Object.entries(f.sections).reverse());
 f.bridgeFields=Object.fromEntries(Object.entries(f.bridgeFields).reverse());
 f.extras=Object.fromEntries(Object.entries(f.extras).reverse());
 assert.equal(assess(f).digest,r.digest);
});
test('capture cannot mutate the physician-source input',()=>{
 const f=make(),before=dup(f);
 const r=assess(f);assert.equal(r.status,'SYNTHETIC_CAPTURED');
 assert.deepEqual(f,before);
 r.envelope.sections.fields.hda='modified output';
 assert.equal(f.bridgeFields.hda,before.bridgeFields.hda);
});
test('cyclic metadata and getters always fail closed',()=>{
 const f=make();f.sections.processing_meta.stages.push(f.sections.processing_meta);
 stop(assess(f));
 const g=make();Object.defineProperty(g.sections.clinical_plan,'hidden',{enumerable:true,get(){throw Error('should not execute')}});
 stop(assess(g));
});
test('G62 capture never returns a positive real authorization',()=>{
 const x=assess(make());
 assert.equal(x.resetAuthorized,false);
 assert.equal('allowReset' in x,false);
 assert.equal(clinicalDigest(x.envelope),x.digest);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticClinicalFlow} from './clinical-flow.G63-LAB-ONLY.mjs';
import {SYNTHETIC_CAPTURE_SCHEMAS} from './clinical-capture.G62-LAB-ONLY.mjs';
import {FIELDS,clinicalDigest} from './authority-model.G60-LAB-ONLY.mjs';
const clone=structuredClone;
const ACTOR=Object.freeze({userId:'doctor-synthetic',tenantId:'clinic-synthetic',sessionId:'session-synthetic',authenticated:true});
const ENCOUNTER='encounter-synthetic';
function startState(){
 const bridgeFields=Object.fromEntries(SYNTHETIC_CAPTURE_SCHEMAS.form.map(x=>[x,'']));
 bridgeFields.hda='História exclusivamente sintética, sem dados de paciente.';
 bridgeFields.queixa_principal='Queixa fictícia';
 bridgeFields.conduta='Conduta fictícia';
 bridgeFields.hipotese_diagnostica='Hipótese fictícia';
 const extras={conduta:bridgeFields.conduta,exames_sugeridos:'',prescricao:''};
 const sections={
  audit_context:{caseId:'case-synthetic',auditVersion:1,sourceVersion:6,reviewStatus:'pending',lockedAt:''},
  clinical_plan:{conduct:'Observação fictícia',exams:[],prescriptions:[]},
  consent:{recordedAt:'not-confirmed',granted:false,withdrawn:false,scope:'synthetic-test'},
  destination:{decision:'em-observação',followUp:'teste'},
  hypothesis_review:{ai:'sugestão fictícia',final:'hipótese fictícia',cid:'R07',status:'pending',alternatives:[],discarded:[]},
  medication_review:{current:[],allergies:[],interactions:[],reviewComplete:false},
  processing_meta:{provider:'pending',model:'pending',stages:[],appVersion:'G63',pipelineVersion:'fixture',
   originalNexaFields:Object.fromEntries(FIELDS.map(x=>[x,''])),
   speakerAttribution:[],processingDurationMs:0,rawAudioDisposed:false},
  protocol_usage:[],
  radar_review:{covered:[],missing:['Alergias fictícias'],questions:[],alerts:[],ledger:[],provenance:'synthetic'},
  supplemental_clinical_data:{includeHypothesis:true,attachments:[],clinicalNotes:[]},
  transcription:{status:'recording',finalText:'',visibleOnlyAfterProcess:false,speakers:[],unprocessedAudio:true},
 };
 return {bridgeFields,domFields:{hda:bridgeFields.hda},extras,includeHypothesis:true,sections};
}
let eid=0;
const event=(type,data,actor=ACTOR)=>({id:'g63-event-'+(++eid),type,data,actor});
function source(){return createSyntheticClinicalFlow({actor:ACTOR,encounterId:ENCOUNTER,sourceVersion:6,initial:startState()})}
function applied(f,type,data,actor=ACTOR){
 const e=event(type,data,actor);
 const r=f.dispatch(e);
 assert.equal(r.status,'SYNTHETIC_EVENT_APPLIED',type+': '+r.code);
 assert.equal(r.resetAuthorized,false);
 return e;
}
function rejected(f,type,data,code,actor=ACTOR){
 const before=f.snapshot(),r=f.dispatch(event(type,data,actor));
 assert.equal(r.status,'STOP',type);
 if(code)assert.match(r.code,new RegExp(code));
 assert.equal(r.resetAuthorized,false);
 assert.deepEqual(f.snapshot(),before,'rejected event must not partly mutate the clinical state');
 return r;
}
function consent(f){
 return applied(f,'consent_update',{granted:true,withdrawn:false,recordedAt:'2026-11-09T15:15:00Z',scope:'lab-only-consent'});
}
function finish(f){
 applied(f,'transcript_chunk',{itemId:'turn-1',text:'Trecho sintético de consulta.',speakerId:'speaker-doctor',role:'clinician'});
 applied(f,'transcript_chunk',{itemId:'turn-2',text:'Segundo trecho sintético.',speakerId:'speaker-other',role:'other'});
 applied(f,'finish_processing',{provider:'fake-asr',model:'synthetic-no-network',durationMs:1200});
}
function checkpoint(f){
 applied(f,'autosave_checkpoint',{expectedSourceVersion:6});
}
function lock(f){
 applied(f,'audit_lock',{expectedSourceVersion:6,caseId:'audit-case-synthetic',auditVersion:4,lockedAt:'2026-11-09T15:20:00Z'});
}
function validLocked(){
 const f=source();consent(f);finish(f);checkpoint(f);lock(f);
 assert.equal(f.verify().status,'PROVISIONAL_SYNTHETIC_MATCH');
 return f;
}
test('G63 cross-module synthetic pipeline preserves prescription, clinical fields, Radar, consent and provenance',()=>{
 const f=source();
 const old=f.snapshot().state, row={bridgeFields:old.bridgeFields,domFields:old.domFields,extras:old.extras,
  includeHypothesis:old.includeHypothesis,sections:old.sections};
 applied(f,'history_restore',{encounterId:ENCOUNTER,ownerId:ACTOR.userId,tenantId:ACTOR.tenantId,
  sourceVersion:6,snapshot:clone(row)});
 applied(f,'field_edit',{key:'hda',value:'HDA alterada sinteticamente, sem identificação.'});
 applied(f,'reconciliation_open',{expectedSourceVersion:6});
 assert.equal(f.verify().status,'STOP');
 applied(f,'reconciliation_resolve',{expectedSourceVersion:6,
  resolvedFields:{hda:'HDA reconciliada; verificação sintética.'}});
 applied(f,'protocol_insert',{protocolId:'synthetic-protocol',version:'version-one',
  prescription:'Prescrição simulada, sem posologia.'});
 const meds=clone(f.snapshot().state.sections.medication_review);
 meds.current=['Substância fictícia'];meds.allergies=['Status fictício'];meds.reviewComplete=true;
 applied(f,'medication_review',{section:meds});
 const radar=clone(f.snapshot().state.sections.radar_review);
 radar.missing=[];radar.covered=['Alergias tratadas como evidência simulada'];
 radar.ledger=[{id:'allergy-check',action:'answer'}];radar.provenance='doctor-confirmed-synthetic';
 applied(f,'radar_update',{section:radar});
 const hyp=clone(f.snapshot().state.sections.hypothesis_review);
 hyp.final='Hipótese clínica simulada revista';hyp.status='reviewed';
 applied(f,'hypothesis_update',{section:hyp});
 const plan=clone(f.snapshot().state.sections.clinical_plan);
 plan.conduct='Reavaliação somente sintética';
 applied(f,'plan_update',{section:plan});
 consent(f);
 assert.equal(f.visibleTranscript(),'');
 finish(f);
 assert.equal(f.visibleTranscript(),'Trecho sintético de consulta.\nSegundo trecho sintético.');
 checkpoint(f);lock(f);
 const snapshot=f.snapshot().state;
 assert.equal(f.verify().status,'PROVISIONAL_SYNTHETIC_MATCH');
 assert.equal(f.verify().resetAuthorized,false);
 assert.match(snapshot.auditSnapshot.envelope.sections.fields.prescricao,/Prescrição simulada/);
 assert.equal(snapshot.auditSnapshot.envelope.sections.medication_review.current[0],'Substância fictícia');
 assert.equal(snapshot.auditSnapshot.envelope.sections.radar_review.ledger.length,1);
 assert.equal(snapshot.auditSnapshot.envelope.sections.hypothesis_review.status,'reviewed');
 assert.equal(snapshot.auditSnapshot.envelope.sections.consent.granted,true);
 assert.equal(snapshot.auditSnapshot.envelope.sections.transcription.status,'processed');
 assert.equal(snapshot.auditSnapshot.localRevision,snapshot.checkpoint.localRevision);
 assert.equal(f.auditedDigest,clinicalDigest(snapshot.auditSnapshot.envelope));
 assert.equal(f.requestReset().status,'STOP');
});
test('G63 transcript never visible during recording, even with completed synthetic chunks',()=>{
 const f=source();consent(f);
 applied(f,'transcript_chunk',{itemId:'one',text:'Texto de teste aguardando processamento.',speakerId:'doctor',role:'clinician'});
 assert.equal(f.visibleTranscript(),'');
 rejected(f,'autosave_checkpoint',{expectedSourceVersion:6},'CHECKPOINT_PRECONDITION_FAILED');
 applied(f,'finish_processing',{provider:'fake-asr',model:'offline-only',durationMs:3});
 assert.equal(f.visibleTranscript(),'Texto de teste aguardando processamento.');
});
test('duplicate event ID is idempotent only for exact duplicate payload',()=>{
 const f=source(),original=event('field_edit',{key:'hda',value:'Versão 1 sintética'});
 assert.equal(f.dispatch(original).status,'SYNTHETIC_EVENT_APPLIED');
 const after=f.snapshot();
 const same=f.dispatch(original);assert.equal(same.status,'DUPLICATE_IGNORED');
 assert.deepEqual(f.snapshot(),after);
 const changed={...original,data:{key:'hda',value:'Versão 2 fictícia'}};
 assert.equal(f.dispatch(changed).code,'EVENT_ID_COLLISION');
 assert.deepEqual(f.snapshot(),after);
});
test('cross-user, tenant, session and unauthenticated actions never mutate clinical state',()=>{
 for(const change of [
  {userId:'other-doctor'},{tenantId:'other-tenant'},
  {sessionId:'other-session'},{authenticated:false}
 ]){
  const f=source();rejected(f,'field_edit',{key:'hda',value:'rejected'},'EVENT_IDENTITY_INVALID',
   {...ACTOR,...change});
 }
});
test('unmapped or missing field input rejects new clinical state with no silent loss',()=>{
 const f=source();
 rejected(f,'field_edit',{key:'dynamic_allergy',value:'fictício'},'UNKNOWN_CLINICAL_FIELD');
 rejected(f,'reconciliation_resolve',{expectedSourceVersion:6,resolvedFields:{dynamic_risk:'yes'}},'VERSION_CONFLICT');
 rejected(f,'history_restore',{encounterId:ENCOUNTER,ownerId:ACTOR.userId,
  tenantId:ACTOR.tenantId,sourceVersion:6,snapshot:{fields:{hda:'partial'}}},'INCOMPLETE_HISTORY_SNAPSHOT');
});
test('reconciliation fails on wrong version and unknown clinical fields',()=>{
 const f=source();
 rejected(f,'reconciliation_open',{expectedSourceVersion:7},'VERSION_CONFLICT');
 applied(f,'reconciliation_open',{expectedSourceVersion:6});
 rejected(f,'reconciliation_resolve',{expectedSourceVersion:7,resolvedFields:{hda:'x'}},'VERSION_CONFLICT');
 rejected(f,'reconciliation_resolve',{expectedSourceVersion:6,resolvedFields:{new_medication:'x'}},'UNKNOWN_CLINICAL_FIELD');
 applied(f,'reconciliation_resolve',{expectedSourceVersion:6,resolvedFields:{hda:'resolvida'}});
 assert.equal(f.snapshot().state.reconciliationPending,false);
});
test('open reconciliation blocks processing, checkpoint and audit until resolved',()=>{
 const f=source();consent(f);finish(f);
 applied(f,'reconciliation_open',{expectedSourceVersion:6});
 rejected(f,'autosave_checkpoint',{expectedSourceVersion:6},'CHECKPOINT_PRECONDITION_FAILED');
 rejected(f,'audit_lock',{expectedSourceVersion:6,caseId:'case',auditVersion:5,lockedAt:'clock'},'AUDIT_CHECKPOINT_OR_VERSION_MISMATCH');
});
test('protocol insertion updates both prescription text and protocol usage, not just UI',()=>{
 const f=source();
 applied(f,'protocol_insert',{protocolId:'protocol-A',version:'version-A',prescription:'Prescrição sintética A'});
 applied(f,'protocol_insert',{protocolId:'protocol-B',version:'version-B',prescription:'Prescrição sintética B'});
 const s=f.snapshot().state;
 assert.equal(s.sections.protocol_usage.length,2);
 assert.equal(s.sections.clinical_plan.prescriptions.length,2);
 assert.equal(s.extras.prescricao,'Prescrição sintética A\nPrescrição sintética B');
});
test('unexpected protocol fields and extra metadata are rejected at ingress',()=>{
 const f=source();
 rejected(f,'protocol_insert',{protocolId:'rx',version:'version',prescription:'fictícia',unmapped:'x'},'EVENT_PAYLOAD_INVALID');
 const radar=f.snapshot().state.sections.radar_review;radar.unknown='clinical-change';
 rejected(f,'radar_update',{section:radar},'UNCATALOGUED_CLINICAL_STATE');
 const medication=f.snapshot().state.sections.medication_review;
 medication.externalAdvice='unknown';
 rejected(f,'medication_review',{section:medication},'UNCATALOGUED_CLINICAL_STATE');
});
test('historical restore is scoped to same source version, owner, tenant and full schema',()=>{
 const f=source(),initial=f.snapshot().state;
 const snapshot={bridgeFields:initial.bridgeFields,domFields:initial.domFields,extras:initial.extras,
  includeHypothesis:initial.includeHypothesis,sections:initial.sections};
 applied(f,'field_edit',{key:'hda',value:'Outra versão fictícia'});
 applied(f,'history_restore',{encounterId:ENCOUNTER,ownerId:ACTOR.userId,tenantId:ACTOR.tenantId,
  sourceVersion:6,snapshot});
 assert.equal(f.snapshot().state.bridgeFields.hda,initial.bridgeFields.hda);
 rejected(f,'history_restore',{encounterId:ENCOUNTER,ownerId:'another-doctor',tenantId:ACTOR.tenantId,
  sourceVersion:6,snapshot},'HISTORY_OWNER_OR_CASE_MISMATCH');
 rejected(f,'history_restore',{encounterId:ENCOUNTER,ownerId:ACTOR.userId,tenantId:ACTOR.tenantId,
  sourceVersion:7,snapshot},'VERSION_CONFLICT');
});
test('history restore with dynamic clinical fields or omitted section fails',()=>{
 const f=source(),s=f.snapshot().state;
 const input={bridgeFields:s.bridgeFields,domFields:s.domFields,extras:s.extras,
  includeHypothesis:s.includeHypothesis,sections:s.sections};
 const unexpected=clone(input);unexpected.bridgeFields.unknown_note='field';
 rejected(f,'history_restore',{encounterId:ENCOUNTER,ownerId:ACTOR.userId,tenantId:ACTOR.tenantId,
  sourceVersion:6,snapshot:unexpected},'UNCATALOGUED_CLINICAL_STATE');
 const missing=clone(input);delete missing.sections.consent;
 rejected(f,'history_restore',{encounterId:ENCOUNTER,ownerId:ACTOR.userId,tenantId:ACTOR.tenantId,
  sourceVersion:6,snapshot:missing},'UNCATALOGUED_CLINICAL_STATE');
});
test('consent missing or withdrawn fails processing',()=>{
 const f=source();
 applied(f,'transcript_chunk',{itemId:'turn-1',text:'Fala sintética',speakerId:'speaker-1',role:'doctor'});
 rejected(f,'finish_processing',{provider:'fake',model:'test',durationMs:1},'PROCESS_PRECONDITION_FAILED');
 applied(f,'consent_update',{granted:false,withdrawn:true,recordedAt:'2026-11-09T15:15Z',scope:'lab-scope'});
 rejected(f,'finish_processing',{provider:'fake',model:'test',durationMs:1},'PROCESS_PRECONDITION_FAILED');
});
test('duplicate transcript item inside one consultation is rejected, no text leaked',()=>{
 const f=source();consent(f);
 applied(f,'transcript_chunk',{itemId:'repeat',text:'Trecho sintético',speakerId:'speaker-1',role:'doctor'});
 rejected(f,'transcript_chunk',{itemId:'repeat',text:'Duplicado',speakerId:'speaker-1',role:'doctor'},'TRANSCRIPT_ITEM_REPLAY');
 assert.equal(f.visibleTranscript(),'');
});
test('unapproved transcript metadata cannot enter state',()=>{
 const f=source();
 rejected(f,'transcript_chunk',{itemId:'x',text:'texto',speakerId:'speaker-1',role:'doctor',confidence:0.99},'EVENT_PAYLOAD_INVALID');
});
test('checkpoint requires completed processing and matching source sync version',()=>{
 const f=source();consent(f);finish(f);
 rejected(f,'autosave_checkpoint',{expectedSourceVersion:7},'CHECKPOINT_PRECONDITION_FAILED');
 checkpoint(f);
 const s=f.snapshot().state;
 assert.equal(s.checkpoint.digest,clinicalDigest(s.checkpoint.snapshot));
 assert.equal(s.synced,true);assert.equal(s.dirty,false);
});
test('clinical edit after checkpoint invalidates checkpoint; audit must STOP',()=>{
 const f=source();consent(f);finish(f);checkpoint(f);
 applied(f,'field_edit',{key:'hda',value:'Editado depois de salvar.'});
 rejected(f,'audit_lock',{expectedSourceVersion:6,caseId:'audit-a',auditVersion:2,lockedAt:'2026-11-09T15:21Z'},'AUDIT_CHECKPOINT_OR_VERSION_MISMATCH');
 assert.equal(f.snapshot().state.checkpoint,null);
});
test('audit refuses wrong source version and does not change snapshot',()=>{
 const f=source();consent(f);finish(f);checkpoint(f);
 rejected(f,'audit_lock',{expectedSourceVersion:8,caseId:'audit-a',auditVersion:2,lockedAt:'2026-11-09T15:21Z'},'AUDIT_CHECKPOINT_OR_VERSION_MISMATCH');
 assert.equal(f.snapshot().state.auditSnapshot,null);
});
test('audit must not happen with an unprocessed audio buffer',()=>{
 const f=source();consent(f);
 applied(f,'transcript_chunk',{itemId:'turn-1',text:'Fala ainda pendente.',speakerId:'speaker-1',role:'doctor'});
 rejected(f,'audit_lock',{expectedSourceVersion:6,caseId:'audit-a',auditVersion:2,lockedAt:'2026-11-09T15:21Z'},'AUDIT_CHECKPOINT_OR_VERSION_MISMATCH');
});
test('replay of clinical mutation after audited locked is retained as pending addendum and STOP',()=>{
 const f=validLocked(),locked=f.snapshot().state.auditSnapshot;
 applied(f,'field_edit',{key:'hda',value:'Texto posterior à auditoria'});
 assert.equal(f.verify().code,'POST_REVIEW_CLINICAL_CHANGE');
 assert.deepEqual(f.snapshot().state.auditSnapshot,locked,'immutable reviewed copy must remain unchanged');
 assert.equal(f.snapshot().state.postReviewEdits,true);
 assert.equal(f.requestReset().status,'STOP');
});
test('post-review prescription and medication changes block receipt and preserve snapshot',()=>{
 const f=validLocked(),locked=f.snapshot().state.auditSnapshot;
 applied(f,'protocol_insert',{protocolId:'protocol-after-audit',version:'v-two',
  prescription:'Nova prescrição não auditada'});
 assert.equal(f.verify().code,'POST_REVIEW_CLINICAL_CHANGE');
 assert.deepEqual(f.snapshot().state.auditSnapshot,locked);
});
test('post-review consent withdrawal blocks review-equivalence without erasing locked audit',()=>{
 const f=validLocked(),locked=f.snapshot().state.auditSnapshot;
 applied(f,'consent_update',{granted:false,withdrawn:true,
  recordedAt:'2026-11-09T15:30:00Z',scope:'lab-consent'});
 assert.equal(f.verify().code,'POST_REVIEW_CLINICAL_CHANGE');
 assert.deepEqual(f.snapshot().state.auditSnapshot,locked);
});
test('remote source advancing after review blocks same-version evidence',()=>{
 const f=validLocked(),locked=f.snapshot().state.auditSnapshot;
 applied(f,'remote_version_advance',{sourceVersion:7});
 assert.equal(f.verify().code,'POST_REVIEW_CLINICAL_CHANGE');
 assert.deepEqual(f.snapshot().state.auditSnapshot,locked);
});
test('reconciliation or history restore after locked cannot silently overwrite audit',()=>{
 const f=validLocked(),before=f.snapshot();
 rejected(f,'reconciliation_open',{expectedSourceVersion:6},'AUDIT_IMMUTABLE_RECONCILIATION');
 rejected(f,'history_restore',{encounterId:ENCOUNTER,ownerId:ACTOR.userId,tenantId:ACTOR.tenantId,
  sourceVersion:6,snapshot:{}},'LOCKED_HISTORY_RESTORE');
 assert.deepEqual(f.snapshot(),before);
});
test('a second audit or checkpoint cannot overwrite an immutable locked snapshot',()=>{
 const f=validLocked(),before=f.snapshot();
 rejected(f,'audit_lock',{expectedSourceVersion:6,caseId:'audit-2',auditVersion:5,
  lockedAt:'synthetic-next'},'AUDIT_ALREADY_LOCKED');
 rejected(f,'autosave_checkpoint',{expectedSourceVersion:6},'AUDIT_ALREADY_LOCKED');
 assert.deepEqual(f.snapshot(),before);
});
test('unexpected event type, unexpected event top-level and malformed identity fail closed',()=>{
 const f=source();
 rejected(f,'unlisted_action',{payload:'x'},'UNKNOWN_CLINICAL_EVENT');
 const bad=event('field_edit',{key:'hda',value:'x'});
 bad.newProperty='hidden';
 assert.equal(f.dispatch(bad).code,'EVENT_SCHEMA_INVALID');
 assert.equal(f.snapshot().trace.length,0);
});
test('stale local version and unknown medical field are not absorbed in an audit retry',()=>{
 const f=source();consent(f);finish(f);checkpoint(f);
 applied(f,'remote_version_advance',{sourceVersion:7});
 rejected(f,'audit_lock',{expectedSourceVersion:6,caseId:'audit-a',auditVersion:2,lockedAt:'synthetic'},'AUDIT_CHECKPOINT_OR_VERSION_MISMATCH');
 rejected(f,'field_edit',{key:'extra_triage_score',value:'unmapped'},'UNKNOWN_CLINICAL_FIELD');
});
test('pipeline history has no raw clinical text and never contains reset permission',()=>{
 const f=validLocked(),snap=f.snapshot();
 assert.equal(snap.trace.length,6); // consent, two fragments, processing, checkpoint, audit
 assert.ok(snap.trace.every(row=>row.resetAuthorized===false));
 assert.ok(snap.trace.every(row=>!('text' in row)));
 assert.equal(snap.resetAuthorized,false);
});

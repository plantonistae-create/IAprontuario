/* G63 synthetic workflow laboratory; no UI, network, production guard or reset. */
import {clinicalDigest,FIELDS} from './authority-model.G60-LAB-ONLY.mjs';
import {captureSyntheticClinicalEnvelope,SYNTHETIC_CAPTURE_SCHEMAS} from './clinical-capture.G62-LAB-ONLY.mjs';

const FORM=SYNTHETIC_CAPTURE_SCHEMAS.form;
const EXTRA=SYNTHETIC_CAPTURE_SCHEMAS.extras;
const clone=x=>structuredClone(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,ks)=>obj(x)&&JSON.stringify(Object.keys(x).sort())===JSON.stringify([...ks].sort());
const isId=x=>typeof x==='string'&&x.trim()===x&&x.length>=3&&x.length<=128&&
 !/[\u0000-\u001f]/.test(x);
const stop=(code)=>Object.freeze({status:'STOP',code:String(code).slice(0,160),resetAuthorized:false});
const error=code=>{throw new Error(code)};
const keys=arr=>Object.keys(arr||{});
function mapFields(state){
 const x={...state.bridgeFields,exames_sugeridos:state.extras.exames_sugeridos,prescricao:state.extras.prescricao};
 if(!exact(x,FIELDS))error('FIELD_MANIFEST_DRIFT');
 return x;
}
function envelope(state){
 return {schema:'nexa.g60.synthetic-clinical-envelope.v1',
 sections:{...clone(state.sections),fields:mapFields(state)}};
}
function shapeCheck(state){
 const src=clone(state);
 src.sections.audit_context.reviewStatus='reviewed';
 src.sections.audit_context.lockedAt='synthetic-schema-check';
 src.sections.consent.granted=true;
 src.sections.consent.withdrawn=false;
 src.sections.transcription.status='processed';
 src.sections.transcription.visibleOnlyAfterProcess=true;
 src.sections.transcription.unprocessedAudio=false;
 src.sections.processing_meta.rawAudioDisposed=true;
 const candidate=captureSyntheticClinicalEnvelope({
  bridgeFields:src.bridgeFields,domFields:src.domFields,extras:src.extras,
  includeHypothesis:src.includeHypothesis,sections:src.sections
 });
 if(candidate.status!=='SYNTHETIC_CAPTURED')error('UNCATALOGUED_CLINICAL_STATE:'+candidate.code);
 return true;
}
function checkedPatch(patch,allowed){
 if(!obj(patch)||Object.keys(patch).some(k=>!allowed.includes(k)))error('UNKNOWN_CLINICAL_FIELD');
 for(const v of Object.values(patch))if(typeof v!=='string')error('INVALID_FIELD_TYPE');
}
function touch(state,postReview=false){
 state.localRevision+=1;
 state.checkpoint=null;
 state.synced=false;
 state.dirty=true;
 if(postReview||state.auditSnapshot)state.postReviewEdits=true;
 else state.phase='draft';
}
function checkedPayload(data,required){
 if(!exact(data,required))error('EVENT_PAYLOAD_INVALID');
}
function setField(state,key,value){
 if(typeof value!=='string')error('INVALID_FIELD_TYPE');
 if(FORM.includes(key)){
  state.bridgeFields[key]=value;
  if(Object.hasOwn(state.domFields,key))state.domFields[key]=value;
  if(key==='conduta')state.extras.conduta=value;
 }else if(['prescricao','exames_sugeridos'].includes(key))state.extras[key]=value;
 else error('UNKNOWN_CLINICAL_FIELD');
}
const status=(kind,details={})=>Object.freeze({status:kind,...details,resetAuthorized:false});

export function createSyntheticClinicalFlow({actor,encounterId,sourceVersion=6,initial}={}){
 if(!exact(actor,['userId','tenantId','sessionId','authenticated'])||
  actor.authenticated!==true||![actor.userId,actor.tenantId,actor.sessionId,encounterId].every(isId)||
  !Number.isSafeInteger(sourceVersion)||sourceVersion<1)throw Error('INVALID_SYNTHETIC_IDENTITY');
 if(!exact(initial,['bridgeFields','domFields','extras','includeHypothesis','sections']))
  throw Error('INITIAL_CLINICAL_SCOPE_INVALID');
 let state={...clone(initial),sourceVersion,localRevision:1,phase:'draft',dirty:true,synced:false,
  checkpoint:null,auditSnapshot:null,postReviewEdits:false,reconciliationPending:false,
  buffer:[],recording:true,unprocessedAudio:true};
 shapeCheck(state);
 const seen=new Map(),trace=[];
 function apply(event){
  try{
   if(!exact(event,['id','type','actor','data'])||!isId(event.id)||!isId(event.type))
    error('EVENT_SCHEMA_INVALID');
   if(!exact(event.actor,['userId','tenantId','sessionId','authenticated'])||
    event.actor.authenticated!==true||
    event.actor.userId!==actor.userId||event.actor.tenantId!==actor.tenantId||
    event.actor.sessionId!==actor.sessionId)error('EVENT_IDENTITY_INVALID');
   const fingerprint=JSON.stringify(event);
   if(seen.has(event.id))return seen.get(event.id)===fingerprint?
    status('DUPLICATE_IGNORED'):stop('EVENT_ID_COLLISION');
   const candidate=clone(state),wasAudited=Boolean(candidate.auditSnapshot);
   const d=event.data;
   switch(event.type){
    case 'field_edit':{
     checkedPayload(d,['key','value']);
     setField(candidate,d.key,d.value);touch(candidate,wasAudited);break;
    }
    case 'reconciliation_open':{
     checkedPayload(d,['expectedSourceVersion']);
     if(wasAudited)error('AUDIT_IMMUTABLE_RECONCILIATION');
     if(d.expectedSourceVersion!==candidate.sourceVersion)error('VERSION_CONFLICT');
     candidate.reconciliationPending=true;candidate.synced=false;candidate.checkpoint=null;
     candidate.dirty=true;break;
    }
    case 'reconciliation_resolve':{
     checkedPayload(d,['expectedSourceVersion','resolvedFields']);
     if(wasAudited)error('AUDIT_IMMUTABLE_RECONCILIATION');
     if(!candidate.reconciliationPending||d.expectedSourceVersion!==candidate.sourceVersion)
      error('VERSION_CONFLICT');
     checkedPatch(d.resolvedFields,FIELDS);
     if(Object.keys(d.resolvedFields).length===0)error('EMPTY_RECONCILIATION');
     for(const [k,v] of Object.entries(d.resolvedFields))setField(candidate,k,v);
     candidate.reconciliationPending=false;touch(candidate);break;
    }
    case 'protocol_insert':{
     checkedPayload(d,['protocolId','version','prescription']);
     if(![d.protocolId,d.version,d.prescription].every(isId))
      error('PROTOCOL_INVALID');
     candidate.sections.protocol_usage.push({id:d.protocolId,version:d.version});
     candidate.sections.clinical_plan.prescriptions.push(d.prescription);
     const newValue=[candidate.extras.prescricao,d.prescription].filter(Boolean).join('\n');
     setField(candidate,'prescricao',newValue);
     touch(candidate,wasAudited);break;
    }
    case 'history_restore':{
     checkedPayload(d,['encounterId','ownerId','tenantId','sourceVersion','snapshot']);
     if(wasAudited)error('LOCKED_HISTORY_RESTORE');
     if(d.encounterId!==encounterId||d.ownerId!==actor.userId||d.tenantId!==actor.tenantId)
      error('HISTORY_OWNER_OR_CASE_MISMATCH');
     if(d.sourceVersion!==candidate.sourceVersion)error('VERSION_CONFLICT');
     if(!exact(d.snapshot,['bridgeFields','domFields','extras','sections','includeHypothesis']))
      error('INCOMPLETE_HISTORY_SNAPSHOT');
     Object.assign(candidate,clone(d.snapshot));touch(candidate);break;
    }
    case 'consent_update':{
     checkedPayload(d,['granted','withdrawn','recordedAt','scope']);
     if(typeof d.granted!=='boolean'||typeof d.withdrawn!=='boolean'||
      !isId(d.recordedAt)||!isId(d.scope))error('INVALID_CONSENT');
     candidate.sections.consent={...d};
     touch(candidate,wasAudited);break;
    }
    case 'radar_update':case 'medication_review':case 'hypothesis_update':
    case 'plan_update':case 'destination_update':{
     checkedPayload(d,['section']);
     const section={
      radar_update:'radar_review',medication_review:'medication_review',
      hypothesis_update:'hypothesis_review',plan_update:'clinical_plan',
      destination_update:'destination'}[event.type];
     candidate.sections[section]=clone(d.section);
     touch(candidate,wasAudited);break;
    }
    case 'transcript_chunk':{
     checkedPayload(d,['itemId','text','speakerId','role']);
     if(wasAudited||candidate.phase==='processed'||candidate.phase==='saved')
      error('TRANSCRIPT_AFTER_FINAL');
     if(![d.itemId,d.text,d.speakerId,d.role].every(isId))error('TRANSCRIPT_FRAGMENT_INVALID');
     if(candidate.buffer.some(x=>x.itemId===d.itemId))error('TRANSCRIPT_ITEM_REPLAY');
     candidate.buffer.push(clone(d));
     candidate.recording=true;candidate.unprocessedAudio=true;
     candidate.sections.transcription.unprocessedAudio=true;
     candidate.dirty=true;candidate.checkpoint=null;break;
    }
    case 'finish_processing':{
     checkedPayload(d,['provider','model','durationMs']);
     if(wasAudited||candidate.phase==='processed'||candidate.phase==='saved')
      error('PROCESS_ALREADY_FINISHED');
     if(!isId(d.provider)||!isId(d.model)||!Number.isSafeInteger(d.durationMs)||d.durationMs<0)
      error('PROCESS_METADATA_INVALID');
     if(!candidate.sections.consent.granted||candidate.sections.consent.withdrawn||
      !candidate.buffer.length||candidate.reconciliationPending)
      error('PROCESS_PRECONDITION_FAILED');
     candidate.sections.transcription={
      ...candidate.sections.transcription,status:'processed',
      finalText:candidate.buffer.map(x=>x.text).join('\n'),
      visibleOnlyAfterProcess:true,unprocessedAudio:false,
      speakers:candidate.buffer.map(x=>({id:x.speakerId,role:x.role}))
     };
     candidate.sections.processing_meta.provider=d.provider;
     candidate.sections.processing_meta.model=d.model;
     candidate.sections.processing_meta.processingDurationMs=d.durationMs;
     candidate.sections.processing_meta.rawAudioDisposed=true;
     candidate.sections.processing_meta.speakerAttribution=candidate.buffer.map(x=>({
      speaker:x.speakerId,confidence:'unknown'}));
     candidate.buffer=[];candidate.recording=false;candidate.unprocessedAudio=false;
     candidate.phase='processed';touch(candidate);candidate.phase='processed';break;
    }
    case 'autosave_checkpoint':{
     checkedPayload(d,['expectedSourceVersion']);
     if(wasAudited)error('AUDIT_ALREADY_LOCKED');
     if(candidate.phase!=='processed'||candidate.reconciliationPending||
      candidate.recording||candidate.unprocessedAudio||
      d.expectedSourceVersion!==candidate.sourceVersion)error('CHECKPOINT_PRECONDITION_FAILED');
     shapeCheck(candidate);
     candidate.sections.audit_context.sourceVersion=candidate.sourceVersion;
     const versionDigest=clinicalDigest(envelope(candidate));
     candidate.checkpoint={sourceVersion:candidate.sourceVersion,localRevision:candidate.localRevision,
      digest:versionDigest,snapshot:clone(envelope(candidate))};
     candidate.phase='saved';candidate.synced=true;candidate.dirty=false;break;
    }
    case 'audit_lock':{
     checkedPayload(d,['expectedSourceVersion','caseId','auditVersion','lockedAt']);
     if(wasAudited)error('AUDIT_ALREADY_LOCKED');
     if(!isId(d.caseId)||!isId(d.lockedAt)||!Number.isSafeInteger(d.auditVersion)||d.auditVersion<1||
      !candidate.checkpoint||candidate.phase!=='saved'||!candidate.synced||
      candidate.dirty||candidate.reconciliationPending||
      candidate.localRevision!==candidate.checkpoint.localRevision||
      candidate.sourceVersion!==d.expectedSourceVersion||
      candidate.checkpoint.sourceVersion!==d.expectedSourceVersion||
      clinicalDigest(envelope(candidate))!==candidate.checkpoint.digest)
      error('AUDIT_CHECKPOINT_OR_VERSION_MISMATCH');
     candidate.sections.audit_context={
      caseId:d.caseId,auditVersion:d.auditVersion,sourceVersion:d.expectedSourceVersion,
      reviewStatus:'reviewed',lockedAt:d.lockedAt
     };
     const proof=captureSyntheticClinicalEnvelope({
      bridgeFields:candidate.bridgeFields,domFields:candidate.domFields,
      extras:candidate.extras,includeHypothesis:candidate.includeHypothesis,
      sections:candidate.sections
     });
     if(proof.status!=='SYNTHETIC_CAPTURED')error('AUDIT_SCOPE_INCOMPLETE:'+proof.code);
     candidate.auditSnapshot={sourceVersion:candidate.sourceVersion,
      localRevision:candidate.localRevision,digest:proof.digest,
      envelope:clone(proof.envelope),auditVersion:d.auditVersion,caseId:d.caseId};
     candidate.phase='audited';candidate.postReviewEdits=false;break;
    }
    case 'remote_version_advance':{
     checkedPayload(d,['sourceVersion']);
     if(!Number.isSafeInteger(d.sourceVersion)||d.sourceVersion<=candidate.sourceVersion)
      error('VERSION_ADVANCE_INVALID');
     candidate.sourceVersion=d.sourceVersion;
     candidate.synced=false;candidate.dirty=true;
     candidate.postReviewEdits=wasAudited;
     if(!wasAudited)candidate.phase='draft';
     break;
    }
    default:error('UNKNOWN_CLINICAL_EVENT');
   }
   shapeCheck(candidate);
   state=candidate;seen.set(event.id,fingerprint);
   trace.push(Object.freeze({type:event.type,id:event.id,
    revision:state.localRevision,sourceVersion:state.sourceVersion,
    auditLocked:Boolean(state.auditSnapshot),resetAuthorized:false}));
   return status('SYNTHETIC_EVENT_APPLIED',{eventType:event.type,revision:state.localRevision});
  }catch(e){return stop(e?.message||'FLOW_EVENT_REJECTED')}
 }
 function verify(){
  try{
   if(!state.auditSnapshot)return stop('AUDIT_NOT_LOCKED');
   if(state.postReviewEdits)return stop('POST_REVIEW_CLINICAL_CHANGE');
   if(state.reconciliationPending||state.recording||state.unprocessedAudio)
    return stop('UNRESOLVED_CLINICAL_STATE');
   if(!state.checkpoint||!state.synced||state.dirty||
    state.localRevision!==state.auditSnapshot.localRevision||
    state.sourceVersion!==state.auditSnapshot.sourceVersion)
    return stop('VERSION_OR_CHECKPOINT_DRIFT');
   const beforeAudit=clone(state);
   beforeAudit.sections.audit_context=clone(state.checkpoint.snapshot.sections.audit_context);
   if(clinicalDigest(envelope(beforeAudit))!==state.checkpoint.digest)
    return stop('CHECKPOINT_CONTENT_DRIFT');
   const current=captureSyntheticClinicalEnvelope({
    bridgeFields:state.bridgeFields,domFields:state.domFields,extras:state.extras,
    includeHypothesis:state.includeHypothesis,sections:state.sections
   });
   if(current.status!=='SYNTHETIC_CAPTURED'||current.digest!==state.auditSnapshot.digest)
    return stop('REVIEWED_CONTENT_DRIFT');
   return status('PROVISIONAL_SYNTHETIC_MATCH',{code:'AUTHORITATIVE_SERVER_PROOF_MISSING'});
  }catch(e){return stop('VERIFICATION_FAILED')}
 }
 return Object.freeze({
  dispatch:apply,verify,
  requestReset:()=>stop('RESET_NOT_AUTHORIZED_IN_LAB'),
  visibleTranscript:()=>state.phase==='processed'||state.phase==='saved'||state.phase==='audited'?
    state.sections.transcription.finalText:'', // only for synthetic post-processing; never mid-recording
  snapshot:()=>clone({state,trace,resetAuthorized:false}),
  get auditedDigest(){return state.auditSnapshot?.digest||null}
 });
}

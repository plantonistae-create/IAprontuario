/* NEXA P0 V2.7: physician actions over an EXACT SERVER-SYNCED snapshot.
 * DRAFT SOURCE ONLY. No automatic consent, no model admission, no audit send.
 * The #172 server endpoint unconditionally returns GATE_C_NO_GO (423).
 * This module never treats a client checkbox or a writer event as AI approval.
 */
(()=>{'use strict';
if(window.nexaP0PhysicianSourceReview)return;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const PURPOSES=new Set(['realtime_audio','radar_context','audio_diarization','final_documentation','audit_deidentification']);
const PROVIDERS=new Set(['openai','gemini','nexa-core']);
const ENDPOINT='/functions/v1/nexa-source-actions';
const q=id=>document.getElementById(id);
let prepared=null,owner=null,encounter=null,busy=false;
let viewGeneration=0,pendingAction=null;
let surface=null,preview=null,message=null,consentCheck=null,reviewCheck=null,policySelect=null,consentButton=null,reviewButton=null;
let revokeSelect=null,revokeCheck=null,revokeButton=null,revokeOwner=null,revocableEntries=[];

function clear(reason=''){
  ++viewGeneration;
  prepared=null;owner=null;encounter=null;
  revokeOwner=null;revocableEntries=[];
  if(revokeSelect)revokeSelect.replaceChildren();
  if(revokeCheck)revokeCheck.checked=false;
  if(revokeButton)revokeButton.disabled=true;
  if(preview)preview.textContent='';
  if(policySelect)policySelect.replaceChildren();
  if(consentCheck)consentCheck.checked=false;
  if(reviewCheck)reviewCheck.checked=false;
  if(consentButton)consentButton.disabled=true;
  if(reviewButton)reviewButton.disabled=true;
  if(message)message.textContent=reason;
  if(surface)surface.hidden=true;
}
function warn(text){if(message)message.textContent=text}
function create(tag,{text='',cls=''}={}){
  const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;
}
function ownerProfile(){
 const p=window.nexaClinicalRuntime18121?.getProfile?.();
 return p?.clinical_access===true&&p?.access_status==='active'&&UUID.test(String(p.id||''))?p:null;
}
async function syncedSource(){
 const p=ownerProfile(),a=window.nexaEncounterAutosave18101;
 if(!p||typeof a?.currentEncounterId!=='function'||typeof a?.get!=='function')
  throw Error('Sessão clínica ou fonte indisponível.');
 const id=a.currentEncounterId();
 if(!UUID.test(id||''))throw Error('Não existe consulta vinculada ao servidor.');
 const local=await a.get(id);
 if(local?.encounter_id!==id||local?.owner_user_id!==p.id||
   local?.sync_state!=='synced'||local?.requires_form_refresh||
   !Number.isSafeInteger(local.sync_version)||local.sync_version<1)
  throw Error('Sincronize a consulta e resolva conflitos antes da revisão.');
 // The visible form may contain edits not present in the last sync ACK.
 const current=a.collectFields?.()||{},saved=local.fields||{};
 if(Object.keys(current).length!==Object.keys(saved).length||
    Object.keys(current).some(key=>current[key]!==saved[key]))
  throw Error('Há campos modificados. Salve e sincronize novamente.');
 return{profile:p,id,revision:local.local_revision,version:local.sync_version};
}
async function send(request){
 const runtime=window.nexaClinicalRuntime18121,client=window.nexaClinicalSupabase18101;
 const base=String(runtime?.supabaseUrl||'');
 if(!base.startsWith('https://')||!client?.auth?.getSession)
  throw Error('Serviço de revisão indisponível.');
 const sess=await client.auth.getSession();
 const jwt=sess?.data?.session?.access_token;
 if(!jwt)throw Error('Sessão expirada. Entre novamente no NEXA.');
 // Strict routing-only client JSON; no fields, core_context or legacy claims.
 const r=await fetch(base+ENDPOINT,{
  method:'POST',cache:'no-store',
  headers:{Authorization:'Bearer '+jwt,apikey:String(runtime.publishableKey||''),
    'Content-Type':'application/json'},
  body:JSON.stringify(request)
 });
 if(r.status===423||r.status===404)
  throw Error('Gate C ainda não habilitado. Nenhuma ação foi registrada.');
 if(!r.ok)throw Error('O servidor rejeitou a ação. Nada foi confirmado.');
 const result=await r.json();
 if(result?.external_ai_authorized!==false||result?.gate_c_verified!==false)
  throw Error('Resposta de autorização inesperada: operação bloqueada.');
 return result;
}
function snapshotOK(source){
 return !!source&&UUID.test(source.encounter_id||'')&&
 Number.isSafeInteger(source.source_sync_version)&&source.source_sync_version>0&&
 source.canonicalization==='pg-jsonb-v1'&&DIGEST.test(source.server_digest||'')&&
 !!source.source_snapshot&&typeof source.source_snapshot==='object'&&
 !Array.isArray(source.source_snapshot)&&typeof source.source_snapshot.fields==='object'&&
 source.source_snapshot.fields!==null&&!Array.isArray(source.source_snapshot.fields)&&
 !!source.source_snapshot.processing_meta&&
 typeof source.source_snapshot.processing_meta==='object'&&
 !Array.isArray(source.source_snapshot.processing_meta)&&
 Array.isArray(source.source_snapshot.protocol_usage);
}
function validPersistedReceipt(event,kind,version){
 return !!event&&UUID.test(String(event.event_id||''))&&
  event.kind===kind&&
  Number.isSafeInteger(event.source_sync_version)&&
  event.source_sync_version===version&&
  event.canonicalization==='pg-jsonb-v1'&&
  typeof event.server_recorded_at==='string'&&
  Number.isFinite(Date.parse(event.server_recorded_at));
}
async function verifyStable(){
 if(!prepared)throw Error('Abra novamente a versão confirmada pelo servidor.');
 const now=await syncedSource();
 if(now.profile.id!==owner||now.id!==encounter||now.revision!==prepared.revision||
    now.version!==prepared.source.source_sync_version)
  throw Error('A consulta mudou. Abra novamente a versão sincronizada.');
 return now;
}
async function prepare(){
 if(busy)return;
 busy=true;clear();
 const generation=viewGeneration;
 if(surface)surface.hidden=false;
 if(openButton)openButton.disabled=true;
 try{
  const start=await syncedSource();
  if(generation!==viewGeneration||document.hidden)return;
  warn('Consultando exclusivamente a versão persistida no servidor…');
  const out=await send({action:'prepare_review',encounterId:start.id});
  if(generation!==viewGeneration||document.hidden)return;
  if(out?.status!=='PERSISTED_SNAPSHOT_FOR_PHYSICIAN_REVIEW'||
     !snapshotOK(out.source)||out.source.encounter_id!==start.id||
     out.source.source_sync_version!==start.version)
   throw Error('Fonte e versão servidor não conferem. Nenhuma revisão autorizada.');
  const end=await syncedSource();
  if(generation!==viewGeneration||document.hidden)return;
  if(end.profile.id!==start.profile.id||end.id!==start.id||
     end.version!==start.version||end.revision!==start.revision)
   throw Error('A consulta mudou durante a leitura. Atualize a revisão.');
  prepared={source:out.source,revision:start.revision};
  owner=start.profile.id;encounter=start.id;
  // Never retry a past action against a different snapshot or owner.
  if(pendingAction&&!pendingAction.key.startsWith(
     owner+'|'+encounter+'|'+out.source.source_sync_version+'|'+out.source.server_digest+'|'))
   pendingAction=null;
  // The exact fields and metadata included in the server digest are displayed.
  // No transcription/Radar text is shown while recording.
  preview.textContent=JSON.stringify(out.source.source_snapshot,null,2);
  const approved=Array.isArray(out.source.approved_policies)?out.source.approved_policies:[];
  for(const x of approved){
   if(!x||!PURPOSES.has(x.purpose)||!PROVIDERS.has(x.provider)||
      typeof x.policyVersion!=='string'||!/^[\w.-]{3,80}$/.test(x.policyVersion))
    continue;
   const o=create('option',{text:x.purpose+' · '+x.provider+' · '+x.policyVersion});
   o.value=JSON.stringify({purpose:x.purpose,provider:x.provider,policyVersion:x.policyVersion});
   policySelect.append(o);
  }
  // The DB currently has an unconditional STOP for final medical ACK.
  // A browser's ready_for_audit flag is never evidence of complete audio.
  // Do not offer an actionable ACK until an explicitly reviewed server
  // completeness receipt exists. Preview remains available independently.
  reviewButton.disabled=out.source.final_review_server_completeness_verified!==true;
  // A saved source/policy is not proof that no prior provider egress occurred.
  // The current #172 RPC deliberately does NOT supply a trusted pre-egress
  // certificate. Consent gesture must stay disabled until that exists.
  consentButton.disabled=policySelect.options.length===0||
    out.source.pre_egress_source_verified!==true;
  warn(out.source.pre_egress_source_verified!==true?
   'Consentimento pré-IA bloqueado: origem/ordem do primeiro egress ainda não comprovadas. Revisão final também aguarda prova de completude no servidor.':
   'Ações explícitas exigem revisão humana. Registrar não libera IA ou auditoria.');
 }catch(e){
  if(generation===viewGeneration){
   clear(String(e?.message||'Não foi possível abrir a revisão.'));
   if(surface&&!document.hidden)surface.hidden=false;
  }
 }finally{busy=false;if(openButton)openButton.disabled=false}
}
async function record(type){
 if(busy||!prepared)return;
 busy=true;
 const generation=viewGeneration;
 consentButton.disabled=true;reviewButton.disabled=true;
 let actionKey=null;
 try{
  const activeSnapshot=prepared.source;
  await verifyStable();
  if(generation!==viewGeneration||document.hidden)return;
  // Reuse the same idempotency key after an ambiguous network outcome on
  // this exact snapshot and action, never for another owner/version/digest.
  const policyIdentity=type==='consent'?policySelect.value:'final-review';
  actionKey=owner+'|'+encounter+'|'+activeSnapshot.source_sync_version+
    '|'+activeSnapshot.server_digest+'|'+type+'|'+policyIdentity;
  if(!pendingAction||pendingAction.key!==actionKey)
   pendingAction={key:actionKey,id:crypto.randomUUID()};
  if(type==='consent'){
   if(prepared.source.pre_egress_source_verified!==true)
    throw Error('A origem anterior à primeira IA não foi comprovada pelo servidor.');
   if(!consentCheck.checked||!policySelect.value)throw Error('Declaração médica explícita e finalidade aprovada necessárias.');
   const policy=JSON.parse(policySelect.value);
   if(!PURPOSES.has(policy.purpose)||!PROVIDERS.has(policy.provider))
    throw Error('Finalidade inválida.');
   const resp=await send({
    action:'attest_consent',encounterId:encounter,actionId:pendingAction.id,
    expectedSyncVersion:prepared.source.source_sync_version,
    displayedDigest:prepared.source.server_digest,
    purpose:policy.purpose,provider:policy.provider,policyVersion:policy.policyVersion,
    confirmation:{physicianAttestsPatientScope:true,explicitlyConfirmsPurpose:true}
   });
   if(generation!==viewGeneration||document.hidden)return;
   if(resp.status!=='SOURCE_ACTION_PERSISTED_ONLY'||
      resp.event?.receipt_readback_verified!==true||
      !validPersistedReceipt(resp.event,'PHYSICIAN_PATIENT_CONSENT_ATTESTATION',
        prepared.source.source_sync_version))
    throw Error('Declaração sem leitura posterior confirmada no servidor.');
   warn('Declaração médica confirmada pelo servidor para esta versão. ISSO NÃO autoriza processamento externo.');
  }else{
   if(prepared.source.final_review_server_completeness_verified!==true)
    throw Error('Revisão final bloqueada: completude não comprovada pelo servidor.');
   if(!reviewCheck.checked)throw Error('Confirme a revisão do conteúdo exibido.');
   const resp=await send({
    action:'ack_final_review',encounterId:encounter,actionId:pendingAction.id,
    expectedSyncVersion:prepared.source.source_sync_version,
    displayedDigest:prepared.source.server_digest,
    confirmation:{physicianReviewedPersistedSnapshot:true}
   });
   if(generation!==viewGeneration||document.hidden)return;
   if(resp.status!=='SOURCE_ACTION_PERSISTED_ONLY'||
      !validPersistedReceipt(resp.event,'PHYSICIAN_FINAL_REVIEW_ACK',
        prepared.source.source_sync_version))
    throw Error('Sem recibo verificável de revisão médica.');
   warn('Recibo da revisão desta versão confirmado. Auditoria e IA continuam bloqueadas.');
  }
  if(pendingAction?.key===actionKey)pendingAction=null;
  // A second action must explicitly re-open and re-check the current source.
  prepared=null;preview.textContent='';
 }catch(e){
  if(generation===viewGeneration&&!document.hidden)
   warn(String(e?.message||'Ação não concluída.'));
 }
 finally{
  busy=false;consentCheck.checked=false;reviewCheck.checked=false;
  consentButton.disabled=true;reviewButton.disabled=true;
 }
}

 // A historical attestation may be retracted even after the source changed
 // or was deleted. Never construct a revocation choice from local storage.
 async function loadRevocations(){
  if(busy)return;
  busy=true;clear();
  const generation=viewGeneration;
  if(surface)surface.hidden=false;
  try{
   const profile=ownerProfile();
   if(!profile)throw Error('Sessão clínica ativa necessária.');
   warn('Lendo exclusivamente os eventos persistidos do servidor…');
   const out=await send({action:'list_revocable_consents'});
   if(generation!==viewGeneration||document.hidden)return;
   if(out.status!=='OWNED_REVOCABLE_EVENTS_ONLY'||!Array.isArray(out.events)||
      out.events.length>100||
      out.events.some(e=>!e||!UUID.test(String(e.event_id||''))||
       !UUID.test(String(e.encounter_id||''))||
       !PURPOSES.has(e.purpose)||!PROVIDERS.has(e.provider)||
       typeof e.policy_version!=='string'||!/^[\w.-]{3,80}$/.test(e.policy_version)||
       !Number.isSafeInteger(e.source_sync_version)||e.source_sync_version<1||
       !Number.isFinite(Date.parse(e.server_recorded_at))))
    throw Error('Catálogo de revogação não confirmado pelo servidor.');
   if(ownerProfile()?.id!==profile.id)
    throw Error('A sessão médica mudou. Reabra o gerenciamento.');
   revokeOwner=profile.id;revocableEntries=out.events;
   for(const e of revocableEntries){
    const option=create('option',{text:e.purpose+' · '+e.provider+
      ' · '+e.policy_version+' · consulta '+e.encounter_id.slice(0,8)});
    option.value=e.event_id;revokeSelect.append(option);
   }
   revokeButton.disabled=revocableEntries.length===0;
   warn(revocableEntries.length?
    'Selecione uma declaração original e confirme expressamente sua revogação.':
    'Nenhuma declaração autoritativa revogável encontrada.');
  }catch(e){
   if(generation===viewGeneration){
    clear(String(e?.message||'Não foi possível consultar eventos.'));
    if(surface&&!document.hidden)surface.hidden=false;
   }
  }finally{busy=false}
 }
 async function recordRevocation(){
  if(busy)return;
  busy=true;
  const generation=viewGeneration;
  if(revokeButton)revokeButton.disabled=true;
  let key=null;
  try{
   const profile=ownerProfile();
   const target=revocableEntries.find(e=>e.event_id===revokeSelect?.value);
   if(!profile||profile.id!==revokeOwner||!target||!revokeCheck?.checked)
    throw Error('Selecione o evento original e confirme a revogação.');
   // Owner and eligibility are rechecked before the mutation. The database
   // separately locks source/intent and validates exact event identity.
   const fresh=await send({action:'list_revocable_consents'});
   if(generation!==viewGeneration||document.hidden)return;
   const active=fresh.status==='OWNED_REVOCABLE_EVENTS_ONLY'&&
      Array.isArray(fresh.events)&&
      fresh.events.some(e=>e.event_id===target.event_id&&
       e.encounter_id===target.encounter_id&&e.purpose===target.purpose&&
       e.provider===target.provider&&e.policy_version===target.policy_version);
   if(!active||ownerProfile()?.id!==revokeOwner)
    throw Error('O evento mudou. Atualize a lista do servidor.');
   key=revokeOwner+'|'+target.encounter_id+'|revoke|'+target.event_id;
   if(!pendingAction||pendingAction.key!==key)
    pendingAction={key,id:crypto.randomUUID()};
   const resp=await send({
    action:'revoke_consent',encounterId:target.encounter_id,
    targetEventId:target.event_id,actionId:pendingAction.id,
    confirmation:{physicianRevokesAttestation:true}
   });
   if(generation!==viewGeneration||document.hidden)return;
   if(resp.status!=='SOURCE_REVOCATION_PERSISTED_ONLY'||
      resp.event?.receipt_readback_verified!==true||
      resp.event?.target_event_id!==target.event_id||
      !validPersistedReceipt(resp.event,'CONSENT_REVOKED',target.source_sync_version))
    throw Error('Revogação sem recibo de releitura confirmado.');
   if(pendingAction?.key===key)pendingAction=null;
   revocableEntries=[];revokeSelect.replaceChildren();revokeOwner=null;
   warn('Revogação confirmada em releitura separada. IA e auditoria continuam bloqueadas.');
  }catch(e){
   if(generation===viewGeneration&&!document.hidden)
    warn(String(e?.message||'Revogação não confirmada.'));
  }finally{
   busy=false;
   if(revokeCheck)revokeCheck.checked=false;
   if(revokeButton)revokeButton.disabled=true;
  }
 }
const anchor=q('submitAuditBtn');
if(!anchor)return;
const openButton=create('button',{text:'Revisar fonte sincronizada · P0',cls:'btn ghost'});
openButton.type='button';openButton.style.width='auto';openButton.onclick=()=>void prepare();
anchor.parentElement?.insertBefore(openButton,anchor);
const revokeOpen=create('button',{text:'Gerenciar revogações registradas · P0',cls:'btn ghost'});
revokeOpen.type='button';revokeOpen.style.width='auto';
revokeOpen.onclick=()=>void loadRevocations();
openButton.after(revokeOpen);
surface=create('section',{cls:'card'});
surface.id='nexaP0SourceReview';surface.hidden=true;
surface.setAttribute('aria-label','Revisão médica do snapshot sincronizado');
const heading=create('h3',{text:'Revisão verificável da fonte · P0 (não habilitada)'});
const note=create('p',{text:'Apenas a versão persistida pelo servidor é elegível. Ação médica não substitui consentimento do paciente nem permite IA externa.'});
note.className='hint';
preview=create('pre');preview.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;font:11px/1.5 ui-monospace,monospace';
policySelect=create('select');policySelect.setAttribute('aria-label','Finalidade e política aprovadas pelo servidor');
policySelect.style.maxWidth='100%';
consentCheck=create('input');consentCheck.type='checkbox';
reviewCheck=create('input');reviewCheck.type='checkbox';
const cLabel=create('label');cLabel.append(consentCheck,document.createTextNode(' Declaro a informação e o escopo do consentimento para a finalidade selecionada.'));
const rLabel=create('label');rLabel.append(reviewCheck,document.createTextNode(' Revisei integralmente a versão persistida e exibida acima.'));
consentButton=create('button',{text:'Registrar declaração explícita',cls:'btn ghost'});
consentButton.type='button';consentButton.disabled=true;consentButton.onclick=()=>void record('consent');
reviewButton=create('button',{text:'Confirmar revisão da versão',cls:'btn ghost'});
reviewButton.type='button';reviewButton.disabled=true;reviewButton.onclick=()=>void record('review');
revokeSelect=create('select');
revokeSelect.setAttribute('aria-label','Declarações revogáveis verificadas pelo servidor');
revokeSelect.style.maxWidth='100%';
revokeCheck=create('input');revokeCheck.type='checkbox';
const revokeLabel=create('label');
revokeLabel.append(revokeCheck,document.createTextNode(
 ' Revogo expressamente a declaração selecionada, vinculada ao evento original.'));
revokeButton=create('button',{text:'Revogar declaração selecionada',cls:'btn ghost'});
revokeButton.type='button';revokeButton.disabled=true;
revokeButton.onclick=()=>void recordRevocation();
message=create('p',{text:'Gate C NO-GO. Nenhuma ação foi registrada.'});message.setAttribute('role','status');
const close=create('button',{text:'Fechar e descartar visualização',cls:'btn ghost'});
close.type='button';close.onclick=()=>clear();
surface.append(heading,note,preview,policySelect,cLabel,consentButton,
 rLabel,reviewButton,revokeSelect,revokeLabel,revokeButton,message,close);
anchor.closest('.toolbar')?.after(surface);
for(const name of ['nexa:encounter-started','nexa:encounter-sync-conflict',
 'nexa:encounter-synced','nexa:consultation-reset','nexa:encounter-locked'])
 window.addEventListener(name,()=>clear());
document.querySelector('.panel-right')?.addEventListener('input',event=>{
 if(!surface?.contains(event.target))clear();
});
window.nexaClinicalSupabase18101?.auth?.onAuthStateChange?.((event)=>{
 // Clear a displayed clinical snapshot on session/account transitions.
 if(event==='SIGNED_OUT'||event==='SIGNED_IN'||event==='USER_UPDATED'){
  pendingAction=null;clear();
 }
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)clear();
});
window.nexaP0PhysicianSourceReview=Object.freeze({clear});
})();

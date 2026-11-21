/* NEXA V4.62-B: owner-only direct cross-device history candidate.
 * Uses the logged-in Supabase user's RLS; no new endpoint, audit service,
 * paid AI call or automatic clinical-content loading. No server-signed digest. */
(()=>{
'use strict';
if(window.__NEXA_HISTORY_MULTIDEVICE_V438__)return;
window.__NEXA_HISTORY_MULTIDEVICE_V438__=true;
// No hard-coded endpoint: direct authenticated PostgREST queries only.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID=/^[A-Za-z0-9_-]{1,256}$/;
const CURSOR_TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const META_COLUMNS='id,encounter_id,user_id,status,encounter_state,created_at,updated_at,sync_version';
const TEXT_COLUMNS=META_COLUMNS+',fields,processing_meta,protocol_usage,consent_recorded_at';
const META_KEYS=META_COLUMNS.split(',').sort().join(',');
const TEXT_KEYS=TEXT_COLUMNS.split(',').sort().join(',');
const FIELDS=['record_id','encounter_id','created_at','updated_at','sync_version','status','encounter_state'];
let owner='',items=[],cursor=null,hasMore=false,busy=false;
const el=id=>document.getElementById(id);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=code=>{throw new Error(code)};
const validTime=t=>typeof t==='string'&&t.length<=40&&Number.isFinite(Date.parse(t));
const profile=()=>window.nexaClinicalRuntime18121?.getProfile?.()||window.currentProf||null;
const supa=()=>window.nexaClinicalSupabase18101||null;
function canonicalJson(v){
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonicalJson).join(',')+']';
 if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(v[k])).join(',')+'}';
 fail('NON_JSON_PACKAGE');
}
function validatePage(data){
 if(!object(data)||data.schema_version!=='nexa-clinical-history-list-v1'||
 data.scope!=='authenticated_owner_only'||data.content_included!==false||
 data.audio_included!==false||data.training_approved!==false||
 !Array.isArray(data.items)||data.items.length>20||typeof data.has_more!=='boolean')
 fail('HISTORY_LIST_NOT_VERIFIED');
 const seen=new Set();
 const rows=data.items.map(v=>{
  if(!object(v)||Object.keys(v).sort().join(',')!==FIELDS.slice().sort().join(',')||
   !SAFE_ID.test(v.record_id)||!UUID.test(v.encounter_id)||
   !validTime(v.created_at)||!validTime(v.updated_at)||
   !Number.isSafeInteger(v.sync_version)||v.sync_version<0||
   !['draft','final'].includes(v.status)||
   !['draft','ready_for_audit','audited','discarded'].includes(v.encounter_state)||
   seen.has(v.record_id))fail('HISTORY_ROW_NOT_VERIFIED');
  seen.add(v.record_id);
  return Object.freeze({...v});
 });
 const next=data.next_cursor;
 if(data.has_more){
  const last=rows.at(-1);
  if(!last||!object(next)||Object.keys(next).sort().join(',')!=='created_at,id'||
     next.created_at!==last.created_at||next.id!==last.record_id)fail('HISTORY_CURSOR_NOT_VERIFIED');
 }else if(next!==null)fail('HISTORY_CURSOR_NOT_VERIFIED');
 return Object.freeze({rows,has_more:data.has_more,next_cursor:next});
}
// Direct RLS reads are NOT server-signed, and a browser-calculated hash is not
// authoritative integrity evidence. We verify identity, version and timestamps;
// the protected clinical recovery handler still performs a local CAS checkpoint.
function validateDirectReadback(data,meta,expectedOwner){
 const row=data?.row;
 if(!object(data)||!object(row)||Object.keys(row).sort().join(',')!==TEXT_KEYS||
    !SAFE_ID.test(row.id)||!UUID.test(row.encounter_id)||!UUID.test(row.user_id)||
    row.id!==meta.record_id||row.encounter_id!==meta.encounter_id||
    row.user_id!==expectedOwner||row.sync_version!==meta.sync_version||
    row.status!==meta.status||row.encounter_state!==meta.encounter_state||
    row.created_at!==meta.created_at||row.updated_at!==meta.updated_at||
    !validTime(row.created_at)||!validTime(row.updated_at)||
    !Number.isSafeInteger(row.sync_version)||row.sync_version<0||
    !object(row.fields)||!object(row.processing_meta)||
    !Array.isArray(row.protocol_usage)||
    (row.consent_recorded_at!==null&&!validTime(row.consent_recorded_at)))
    fail('DIRECT_READBACK_NOT_VERIFIED');
 return Object.freeze({
  schema_version:'nexa-clinical-text-readback-v1',
  encounter_id:row.encounter_id,sync_version:row.sync_version,
  updated_at:row.updated_at,encounter_state:row.encounter_state,
  consent_recorded_at:row.consent_recorded_at,
  fields:row.fields,processing_meta:row.processing_meta,
  protocol_usage:row.protocol_usage
 });
}
async function authenticatedClient(expectedOwner){
 const c=supa();
 if(!UUID.test(expectedOwner)||profile()?.id!==expectedOwner||
    !c?.auth?.getSession||!c?.auth?.getUser||
    typeof c?.rpc!=='function'||typeof c?.from!=='function')
   fail('AUTH_REQUIRED');
 let session,authenticated,access;
 try{
  const current=await c.auth.getSession();session=current?.data?.session;
  if(current?.error||!session?.access_token||session?.user?.id!==expectedOwner)
    fail('AUTH_REQUIRED');
  authenticated=await c.auth.getUser();
 }catch{fail('AUTH_REQUIRED');}
 if(authenticated?.error||authenticated?.data?.user?.id!==expectedOwner||
    profile()?.id!==expectedOwner)fail('AUTH_REQUIRED');
 try{access=await c.rpc('has_active_clinical_access');}
 catch{fail('CLINICAL_ACCESS_UNAVAILABLE');}
 if(access?.error||typeof access?.data!=='boolean')fail('CLINICAL_ACCESS_UNAVAILABLE');
 if(access.data!==true)fail('CLINICAL_ACCESS_REQUIRED');
 if(profile()?.id!==expectedOwner)fail('OWNER_CHANGED');
 return c;
}
function validateMetadataRow(row,expectedOwner){
 if(!object(row)||Object.keys(row).sort().join(',')!==META_KEYS||
    !SAFE_ID.test(row.id)||!UUID.test(row.encounter_id)||row.user_id!==expectedOwner||
    !validTime(row.created_at)||!validTime(row.updated_at)||
    !Number.isSafeInteger(row.sync_version)||row.sync_version<0||
    !['draft','final'].includes(row.status)||
    !['draft','ready_for_audit','audited','discarded'].includes(row.encounter_state))
   fail('HISTORY_ROW_NOT_VERIFIED');
 return {
  record_id:row.id,encounter_id:row.encounter_id,
  created_at:row.created_at,updated_at:row.updated_at,
  sync_version:row.sync_version,status:row.status,encounter_state:row.encounter_state
 };
}
async function request(body,expectedOwner){
 const c=await authenticatedClient(expectedOwner);
 if(body?.action==='list'){
  if(body.limit!==20)fail('INVALID_PAGE_REQUEST');
  let query=c.from('consultation_history').select(META_COLUMNS)
   .eq('user_id',expectedOwner)
   .order('created_at',{ascending:false})
   .order('id',{ascending:false})
   .limit(21);
  if(body.cursor!==undefined){
   const cursor=body.cursor;
   if(!object(cursor)||Object.keys(cursor).sort().join(',')!=='created_at,id'||
      !SAFE_ID.test(cursor.id)||!CURSOR_TIME.test(cursor.created_at)||
      !validTime(cursor.created_at))fail('HISTORY_CURSOR_INVALID');
   // Keyset pagination: no omissions when timestamps tie, and no offset drift.
   query=query.or('created_at.lt.'+cursor.created_at+
     ',and(created_at.eq.'+cursor.created_at+',id.lt.'+cursor.id+')');
  }
  let result;try{result=await query;}catch{fail('REMOTE_HISTORY_QUERY_FAILED');}
  if(result?.error||!Array.isArray(result?.data)||result.data.length>21)
   fail('REMOTE_HISTORY_QUERY_FAILED');
  if(profile()?.id!==expectedOwner)fail('OWNER_CHANGED');
  const first=result.data.slice(0,20);
  const rows=first.map(row=>validateMetadataRow(row,expectedOwner));
  const last=rows.at(-1),hasMore=result.data.length>20;
  return {
   schema_version:'nexa-clinical-history-list-v1',
   scope:'authenticated_owner_only',
   content_included:false,audio_included:false,training_approved:false,
   items:rows,has_more:hasMore,
   next_cursor:hasMore?{created_at:last.created_at,id:last.record_id}:null
  };
 }
 if(object(body)&&SAFE_ID.test(body.record_id)&&UUID.test(body.encounter_id)&&
    Number.isSafeInteger(body.expected_sync_version)&&body.expected_sync_version>=0&&
    validTime(body.expected_updated_at)&&
    ['draft','final'].includes(body.expected_status)&&
    ['draft','ready_for_audit','audited','discarded'].includes(body.expected_encounter_state)){
  let result;
  try{
   result=await c.from('consultation_history').select(TEXT_COLUMNS)
    .eq('user_id',expectedOwner).eq('id',body.record_id)
    .eq('encounter_id',body.encounter_id)
    .eq('sync_version',body.expected_sync_version)
    .eq('updated_at',body.expected_updated_at)
    .eq('status',body.expected_status)
    .eq('encounter_state',body.expected_encounter_state).maybeSingle();
  }catch{fail('DIRECT_READBACK_QUERY_FAILED');}
  if(result?.error)fail('DIRECT_READBACK_QUERY_FAILED');
  if(profile()?.id!==expectedOwner)fail('OWNER_CHANGED');
  if(!result?.data)fail('DIRECT_READBACK_VERSION_CHANGED_OR_DENIED');
  return {row:result.data};
 }
 fail('INVALID_READBACK_REQUEST');
}
function status(message){const x=el('nexa438Status');if(x)x.textContent=message}
function clearPreviousOwner(nextOwner){
 if(!owner||owner===nextOwner)return;
 owner='';items=[];cursor=null;hasMore=false;
 const preview=el('nexa438Preview');
 if(preview){preview.hidden=true;preview.textContent='';}
 remoteRows();
 status('Sessão alterada. Consulte novamente o histórico privado.');
}
function remoteRows(){
 const list=el('nexa438Rows');if(!list)return;
 list.replaceChildren();
 for(const item of items){
  const card=document.createElement('div');
  card.className='n197-item';
  const info=document.createElement('div');
  const title=document.createElement('strong');title.textContent=new Date(item.created_at).toLocaleString('pt-BR')+' · '+item.status;
  const sub=document.createElement('div');sub.className='n197-meta';
  sub.textContent='Registro '+item.record_id.slice(0,32)+' · versão '+item.sync_version+' · metadados do servidor';
  info.append(title,sub);
  const btn=document.createElement('button');btn.type='button';btn.className='n197-btn';
  btn.textContent='Recuperar e verificar';
  btn.addEventListener('click',()=>void openItem(item));
  card.append(info,btn);list.appendChild(card);
 }
 const more=el('nexa438More');if(more)more.hidden=!hasMore;
}
async function loadPage(reset=true){
 if(busy)return;busy=true;status('Consultando histórico privado…');
 try{
  const who=profile()?.id||'';if(!UUID.test(who))fail('AUTH_REQUIRED');
  if(reset||owner!==who){
   clearPreviousOwner(who);
   owner=who;items=[];cursor=null;hasMore=false;
   const preview=el('nexa438Preview');if(preview){preview.hidden=true;preview.textContent='';}
   remoteRows();
  }
  const body={action:'list',limit:20,...(cursor?{cursor}:{})};
  const checked=validatePage(await request(body,who));
  const seen=new Set(items.map(x=>x.record_id));
  if(checked.rows.some(x=>seen.has(x.record_id)))fail('HISTORY_PAGE_OVERLAP');
  if(owner!==who)fail('OWNER_CHANGED');
  items.push(...checked.rows);cursor=checked.next_cursor;hasMore=checked.has_more;
  remoteRows();status(items.length+' registro(s) listados · nenhum conteúdo clínico carregado');
 }catch(error){status('Histórico remoto indisponível: '+String(error?.message||'FAIL'));hasMore=false;remoteRows();}
 finally{busy=false}
}
// Only the clinical app itself can determine whether an in-memory audio recording
// exists. Its trusted recovery handler refuses active/unprocessed audio and verifies
// the original session checkpoint. Never call window.fill(): it calls
// clearClinicalSession(), which destroys the in-memory audio buffer.
function pristineFormSnapshot(auto){
 const bridge=window.nexaClinicalBridge18101;
 if(typeof auto?.collectFields!=='function'||typeof bridge?.state!=='function')
  fail('CLINICAL_FORM_GUARD_UNAVAILABLE');
 const fields=auto.collectFields(),state=bridge.state();
 if(!object(fields)||Object.values(fields).some(v=>typeof v!=='string')||
    typeof state!=='string')fail('CLINICAL_FORM_GUARD_UNAVAILABLE');
 return {owner:profile()?.id||'',active:auto.currentEncounterId(),state,
  content:canonicalJson(fields)};
}
function requireCleanForm(auto,baseline,target){
 const current=pristineFormSnapshot(auto);
 if(current.owner!==baseline.owner||current.active!==baseline.active||
    current.state!==baseline.state||current.content!==baseline.content)
    fail('CLINICAL_FORM_CHANGED_DURING_READBACK');
 if(current.state!=='idle')fail('ACTIVE_CLINICAL_SESSION_PROTECTED');
 if(Object.values(auto.collectFields()).some(v=>v.trim()))fail('UNSAVED_FORM_PROTECTED');
 // An active encounter ID, even with blank fields, requires an explicit,
 // separately verified checkpoint before changing identity.
 if(current.active&&current.active!==target)fail('ACTIVE_ENCOUNTER_CHECKPOINT_REQUIRED');
}
async function openItem(meta){
 if(busy)return;busy=true;status('Verificando versão e integridade da consulta…');
 try{
  const who=profile()?.id||'',auto=window.nexaEncounterAutosave18101;
  if(who!==owner||!UUID.test(who))fail('OWNER_CHANGED');
  // Prevent callers from injecting a stale or out-of-list record. The index
  // contains metadata only and every selection repeats JWT/RLS readback.
  if(!items.some(x=>x.record_id===meta?.record_id&&x.encounter_id===meta?.encounter_id&&
      x.sync_version===meta?.sync_version))fail('HISTORY_SELECTION_NOT_VERIFIED');
  if(!auto?.get||!auto?.adoptExisting||!auto?.currentEncounterId||!auto?.preserve||
     typeof window.nexaRecoverSavedEncounter!=='function')
    fail('TRUSTED_RECOVERY_UNAVAILABLE');
  const baseline=pristineFormSnapshot(auto);
  requireCleanForm(auto,baseline,meta.encounter_id);
  const saved=await auto.get(meta.encounter_id);
  if(saved&&(saved.owner_user_id!==who||saved.sync_state!=='synced'||saved.requires_form_refresh||
    Number(saved.sync_version)>meta.sync_version))
     fail('LOCAL_DRAFT_OR_CONFLICT_PROTECTED');
  // RLS-backed readback requires exact identity and version. No signed digest.
  const pkg=validateDirectReadback(await request({
   record_id:meta.record_id,encounter_id:meta.encounter_id,
   expected_sync_version:meta.sync_version,expected_updated_at:meta.updated_at,
   expected_status:meta.status,expected_encounter_state:meta.encounter_state
  },who),meta,who);
  requireCleanForm(auto,baseline,meta.encounter_id);
  if(owner!==who)fail('OWNER_CHANGED');
  // A legacy text PK must never be silently converted into an editable UUID.
  if(meta.record_id!==meta.encounter_id){
   const preview=el('nexa438Preview');
   if(preview){preview.hidden=false;preview.textContent='Registro legado verificado (somente leitura).\n'+JSON.stringify(pkg.fields,null,2);}
   status('Leitura verificada. Registro legado preservado sem regravar ou renumerar.');
   return;
  }
  const refreshed=await auto.get(meta.encounter_id);
  requireCleanForm(auto,baseline,meta.encounter_id);
  if(refreshed&&(refreshed.owner_user_id!==who||refreshed.sync_state!=='synced'||
     refreshed.requires_form_refresh||Number(refreshed.sync_version)>meta.sync_version||
     (Number(refreshed.sync_version)===meta.sync_version&&
      canonicalJson(refreshed.fields)!==canonicalJson(pkg.fields))))
     fail('LOCAL_DRAFT_OR_CONFLICT_PROTECTED');
  // The real app exposes this trusted handler. Unlike window.fill(), it checks
  // lexical recording/audioBlob state and uses verified, owner-scoped IndexedDB.
  // Inert is mandatory to prevent user edits during async recovery.
  const body=document.body;
  if(!body||typeof body.inert!=='boolean')fail('CLINICAL_FORM_LOCK_UNAVAILABLE');
  const wasInert=body.inert;body.inert=true;
  try{
   requireCleanForm(auto,baseline,meta.encounter_id);
   const recovered=await window.nexaRecoverSavedEncounter({
     ...pkg,id:meta.record_id,owner_user_id:who,user_id:who,
     status:meta.status,created_at:meta.created_at
   });
   // This can return false when audio exists. Never claim recovery then.
   if(recovered!==true)fail('AUDIO_OR_RECOVERY_BLOCKED');
   if(owner!==who||profile()?.id!==who||auto.currentEncounterId()!==meta.encounter_id)
     fail('RECOVERY_IDENTITY_NOT_VERIFIED');
   const durable=await auto.get(meta.encounter_id);
   if(!durable||durable.owner_user_id!==who||durable.encounter_id!==meta.encounter_id||
      !['synced','pending'].includes(durable.sync_state)||
      Number(durable.sync_version)<meta.sync_version||
      canonicalJson(durable.fields)!==canonicalJson(pkg.fields))
      fail('RECOVERY_LOCAL_CHECKPOINT_NOT_VERIFIED');
   status('Consulta recuperada por identidade e versão; checkpoint local verificado. Não é arquivo de áudio nem prova criptográfica do servidor.');
  }finally{body.inert=wasInert;}
 }catch(error){status('Recuperação NÃO concluída: '+String(error?.message||'FAIL'));}
 finally{busy=false;}
}
function mount(){
 const root=el('nexa197History');if(!root||el('nexa438Remote'))return !!root;
 const section=document.createElement('section');section.id='nexa438Remote';
 section.style.cssText='margin-top:18px;padding-top:14px;border-top:1px solid var(--nf-line,var(--hair))';
 const head=document.createElement('h3');head.textContent='Consultas no servidor · todos os períodos';
 const desc=document.createElement('p');
 desc.textContent='Histórico privado paginado, pela sessão autenticada e RLS. Recuperação exige identidade, versão e checkpoint local. Não inclui arquivo de áudio nem valida consentimento para IA.';
 const btn=document.createElement('button');btn.id='nexa438Load';btn.className='n197-btn';btn.type='button';
 btn.textContent='Consultar servidor';btn.addEventListener('click',()=>void loadPage(true));
 const st=document.createElement('p');st.id='nexa438Status';st.className='n197-status';
 st.textContent='Consulta sob demanda; requer autenticação e acesso clínico ativo.';
 const rows=document.createElement('div');rows.id='nexa438Rows';rows.className='n197-list';
 const more=document.createElement('button');more.id='nexa438More';more.type='button';
 more.className='n197-btn';more.hidden=true;more.textContent='Carregar mais';
 more.addEventListener('click',()=>void loadPage(false));
 const preview=document.createElement('pre');preview.id='nexa438Preview';preview.hidden=true;
 preview.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';
 section.append(head,desc,btn,st,rows,more,preview);root.append(section);return true;
}
window.nexaMultideviceHistoryV438=Object.freeze({validatePage,validateDirectReadback,request,loadPage,openItem,mount});
try{
 const auth=supa()?.auth;
 if(typeof auth?.onAuthStateChange==='function')
  auth.onAuthStateChange((_event,session)=>clearPreviousOwner(session?.user?.id||''));
}catch{}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mount(),{once:true});
 else mount();
 if(typeof MutationObserver==='function'&&document.body){
  const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});
  observer.observe(document.body,{childList:true,subtree:true});
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)clearPreviousOwner(profile()?.id||'')});
 document.addEventListener('click',event=>{
  clearPreviousOwner(profile()?.id||'');
  if(event.target?.closest?.('[data-go="history"],.nexa-session-tab[data-stage="history"],#nexaMobileBottomNav [data-mobile-stage="history"]'))
   setTimeout(mount,50);
 },true);
}
})();
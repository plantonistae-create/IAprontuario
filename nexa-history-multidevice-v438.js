/* NEXA V4.38: additive cross-device history, candidate-only, no automatic network calls.
 * The historic 7-day view, audio buffer and audit guards remain unchanged.
 * The readback endpoint is disabled/unpublished until separately authorized. */
(()=>{
'use strict';
if(window.__NEXA_HISTORY_MULTIDEVICE_V438__)return;
window.__NEXA_HISTORY_MULTIDEVICE_V438__=true;
const ENDPOINT='https://fmkrcieubrlltiggyauc.supabase.co/functions/v1/nexa-clinical-text-readback';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID=/^[A-Za-z0-9_-]{1,256}$/;
const HASH=/^[a-f0-9]{64}$/;
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
async function validateReadback(data,meta){
 const pkg=data?.package;
 if(!object(data)||data.verified!==true||data.durable_archive!==false||
    data.audio_included!==false||!HASH.test(data.canonical_sha256)||
    !object(pkg)||pkg.schema_version!=='nexa-clinical-text-readback-v1'||
    pkg.encounter_id!==meta.encounter_id||pkg.sync_version!==meta.sync_version||
    !object(pkg.fields)||!object(pkg.processing_meta)||!Array.isArray(pkg.protocol_usage))
    fail('READBACK_NOT_VERIFIED');
 if(!window.crypto?.subtle?.digest||typeof window.TextEncoder!=='function')fail('HASH_VERIFIER_UNAVAILABLE');
 const bytes=new window.TextEncoder().encode(canonicalJson(pkg));
 const digest=await window.crypto.subtle.digest('SHA-256',bytes);
 const own=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(own!==data.canonical_sha256)fail('READBACK_DIGEST_MISMATCH');
 return pkg;
}
async function request(body,expectedOwner){
 const c=supa();if(!c?.auth?.getSession||!UUID.test(expectedOwner))fail('AUTH_REQUIRED');
 const {data,error}=await c.auth.getSession(),session=data?.session;
 if(error||!session?.access_token||session?.user?.id!==expectedOwner)fail('AUTH_REQUIRED');
 const key=c.supabaseKey||window.nexaClinicalRuntime18121?.publishableKey;
 if(typeof key!=='string'||!key)fail('PUBLIC_KEY_UNAVAILABLE');
 const response=await fetch(ENDPOINT,{
  method:'POST',cache:'no-store',
  headers:{Authorization:'Bearer '+session.access_token,apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify(body)
 });
 if(!response.ok)fail(response.status===404||response.status===503?'READBACK_BACKEND_NOT_READY':
   response.status===401||response.status===403?'AUTH_REQUIRED':'REMOTE_REQUEST_FAILED_'+response.status);
 const payload=await response.json();
 if(profile()?.id!==expectedOwner)fail('OWNER_CHANGED');
 return payload;
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
  // Server readback must match its own SHA-256 before any clinical state changes.
  const pkg=await validateReadback(await request({
   encounter_id:meta.encounter_id,expected_sync_version:meta.sync_version
  },who),meta);
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
   status('Consulta recuperada com SHA-256; checkpoint local verificado. Não é arquivo de áudio.');
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
 desc.textContent='Consulta privada, paginada e sob autenticação. Recuperação exige readback e integridade SHA-256. Não é arquivo de áudio ou autorização de IA.';
 const btn=document.createElement('button');btn.id='nexa438Load';btn.className='n197-btn';btn.type='button';
 btn.textContent='Consultar servidor';btn.addEventListener('click',()=>void loadPage(true));
 const st=document.createElement('p');st.id='nexa438Status';st.className='n197-status';
 st.textContent='Disponível somente após implantação e autorização separadas do endpoint de leitura.';
 const rows=document.createElement('div');rows.id='nexa438Rows';rows.className='n197-list';
 const more=document.createElement('button');more.id='nexa438More';more.type='button';
 more.className='n197-btn';more.hidden=true;more.textContent='Carregar mais';
 more.addEventListener('click',()=>void loadPage(false));
 const preview=document.createElement('pre');preview.id='nexa438Preview';preview.hidden=true;
 preview.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';
 section.append(head,desc,btn,st,rows,more,preview);root.append(section);return true;
}
window.nexaMultideviceHistoryV438=Object.freeze({validatePage,validateReadback,request,loadPage,openItem,mount});
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
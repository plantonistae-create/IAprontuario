/* NEXA text readback client v1 · CANDIDATE, synthetic review only.
 * Disabled unless the page defines window.__NEXA_TEXT_READBACK__ as an object
 * with enabled:true and mode:'synthetic-review-v1'. Nothing in index.html sets it; with the flag absent this
 * file makes no request and renders nothing.
 * Verifies ONLY the textual note (fields, protocol usage, consent timestamp)
 * against what the server reads back. It never covers audio, never claims an
 * archive, and never reports success unless every check below passes.
 */
(function(){
'use strict';
if(window.nexaTextReadback)return;
const FN='nexa-clinical-text-readback';
const SCHEMA='nexa-clinical-text-readback-v1';
const SHA=/^[a-f0-9]{64}$/;
const enabled=()=>{const c=window.__NEXA_TEXT_READBACK__;return !!(c&&c.enabled===true&&c.mode==='synthetic-review-v1')};
const api=()=>window.nexaEncounterAutosave18101||null;
const client=()=>{try{return window.nexaClinicalSupabase18101||null}catch{return null}};
const owner=()=>{try{return String(window.nexaClinicalRuntime18121?.getProfile?.()?.id||window.currentProf?.id||'')}catch{return''}};
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

// Same canonical form as supabase/functions/_shared/nexa-clinical-text-readback.mjs
// (pinned by tests/nexa-text-readback-integration.contract.test.mjs).
function canonicalJson(v){
  if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
  if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(canonicalJson).join(',')+']';
  if(isObj(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(v[k])).join(',')+'}';
  throw new Error('NON_JSON_PACKAGE');
}
async function sha256(text){
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');
}

let current={state:'idle',encounter_id:null};
let seq=0;
function el(){
  let e=document.getElementById('nexaReadbackStatus');
  if(e)return e;
  const anchor=document.getElementById('nexaSessionAutosaveText')||document.getElementById('status');
  if(!anchor||!anchor.parentNode)return null;
  e=document.createElement('small');e.id='nexaReadbackStatus';e.setAttribute('role','status');e.setAttribute('aria-live','polite');
  e.hidden=true;anchor.parentNode.insertBefore(e,anchor.nextSibling);return e;
}
function render(state,detail={}){
  current={state,encounter_id:detail.encounter_id||null,sync_version:detail.sync_version??null,sha256:detail.sha256||null,code:detail.code||null};
  const e=el();if(!e)return current;
  e.dataset.readbackState=state;
  if(state==='idle'){e.hidden=true;e.textContent='';return current}
  const text={
    checking:'Releitura textual: verificando…',
    pending:'Releitura textual PENDENTE — a nota ainda não foi confirmada pelo servidor'+(detail.code?' ('+detail.code+')':''),
    verified:'Releitura textual confirmada · versão '+detail.sync_version+' · SHA-256 '+String(detail.sha256||'').slice(0,12)+'… · somente texto, áudio não incluído',
    mismatch:'Releitura textual DIVERGENTE — NÃO confirmada ('+(detail.code||'conteúdo')+'). Mantenha esta tela e revise a nota',
    error:'Releitura textual com ERRO — NÃO confirmada'+(detail.code?' ('+detail.code+')':'')
  }[state];
  e.textContent=text;e.hidden=false;return current;
}
async function errorCode(error){
  try{const j=await error?.context?.json?.();if(j&&typeof j.error==='string')return j.error}catch{}
  return String(error?.message||'READBACK_UNAVAILABLE').slice(0,60);
}

async function verify(encounterId){
  if(!enabled())return {state:'disabled'};
  const my=++seq;
  const id=String(encounterId||'').toLowerCase();
  const a=api(),c=client(),who=owner();
  const stale=()=>my!==seq;
  if(!a?.get||!c?.functions?.invoke||!who||!id)return render('pending',{encounter_id:id,code:'READBACK_UNAVAILABLE'});
  const rec=await a.get(id).catch(()=>null);
  if(stale())return current;
  if(!rec||rec.owner_user_id!==who)return render('error',{encounter_id:id,code:'OWNER_SCOPE'});
  if(rec.sync_state!=='synced'||!Number.isSafeInteger(Number(rec.sync_version)))return render('pending',{encounter_id:id,code:'NOT_SYNCED'});
  const version=Number(rec.sync_version);
  render('checking',{encounter_id:id});
  let res;
  try{res=await c.functions.invoke(FN,{body:{encounter_id:id,expected_sync_version:version}})}
  catch(e){return stale()?current:render('pending',{encounter_id:id,code:'READBACK_UNAVAILABLE'})}
  if(stale())return current;
  if(res?.error){
    const code=await errorCode(res.error);
    if(stale())return current;
    const hard=['SOURCE_VERSION_CHANGED','SOURCE_CONTENT_MISMATCH','OWNER_SCOPE_VIOLATION','SOURCE_NOT_FOUND','SOURCE_INVALID'].includes(code);
    return render(hard?'mismatch':'pending',{encounter_id:id,code});
  }
  const d=res?.data,p=d?.package;
  const fail=code=>render('mismatch',{encounter_id:id,code});
  if(!isObj(d)||d.verified!==true||!isObj(p))return fail('RESPONSE_INVALID');
  if(d.durable_archive!==false||d.audio_included!==false)return fail('SCOPE_CLAIM_INVALID');
  if(p.schema_version!==SCHEMA||String(p.encounter_id).toLowerCase()!==id)return fail('PACKAGE_IDENTITY');
  if(p.sync_version!==version)return fail('SOURCE_VERSION_CHANGED');
  if(typeof d.canonical_sha256!=='string'||!SHA.test(d.canonical_sha256))return fail('HASH_INVALID');
  let recomputed,localFields,remoteFields,localUse,remoteUse;
  try{
    recomputed=await sha256(canonicalJson(p));
    localFields=canonicalJson(rec.fields||{});remoteFields=canonicalJson(p.fields);
    localUse=canonicalJson(Array.isArray(rec.protocol_usage)?rec.protocol_usage:[]);remoteUse=canonicalJson(p.protocol_usage);
  }catch{return fail('PACKAGE_NOT_CANONICAL')}
  if(stale())return current;
  if(recomputed!==d.canonical_sha256)return fail('HASH_MISMATCH');
  if(localFields!==remoteFields)return fail('CONTENT_MISMATCH');
  if(localUse!==remoteUse)return fail('PROTOCOL_USAGE_MISMATCH');
  if((rec.consent_recorded_at||null)!==(p.consent_recorded_at??null))return fail('CONSENT_TIMESTAMP_MISMATCH');
  // The local note may have been edited while the request was in flight: a
  // confirmation of OLD content must never be shown for the CURRENT note.
  const now=await a.get(id).catch(()=>null);
  if(stale())return current;
  if(!now||now.local_revision!==rec.local_revision||canonicalJson(now.fields||{})!==localFields)
    return render('pending',{encounter_id:id,code:'LOCAL_CHANGED'});
  return render('verified',{encounter_id:id,sync_version:version,sha256:d.canonical_sha256});
}

window.addEventListener('nexa:encounter-synced',e=>{if(enabled())void verify(e.detail?.encounter_id)});
window.addEventListener('nexa:session-restored',e=>{if(enabled())void verify(e.detail?.encounter_id)});
window.addEventListener('nexa:encounter-sync-failed',e=>{if(enabled()){seq++;render('pending',{encounter_id:e.detail?.encounter_id,code:'SYNC_FAILED'})}});
window.addEventListener('nexa:encounter-sync-conflict',e=>{if(enabled()){seq++;render('mismatch',{encounter_id:e.detail?.encounter_id,code:'SYNC_CONFLICT'})}});
// New local edits invalidate any earlier confirmation until the next readback.
window.addEventListener('nexa:encounter-local-saved',e=>{if(enabled()&&current.state==='verified'){seq++;render('pending',{encounter_id:e.detail?.encounter_id,code:'LOCAL_CHANGED'})}});
window.addEventListener('nexa:consultation-reset',()=>{seq++;render('idle')});
window.nexaTextReadback=Object.freeze({verify,state:()=>({...current}),canonicalJson,version:'v1'});
})();

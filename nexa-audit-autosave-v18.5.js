/* NEXA v18.5 · automatic audit handoff · 2026-09-05
   When a clinician intentionally clears/starts a new case (or logs out), persist the latest
   reviewed fields and hand a deidentified copy to the existing NEXA Core audit endpoint.
   Network failures are queued locally and retried after the next authenticated opportunity. */
(()=>{
'use strict';
if(window.__NEXA_AUDIT_AUTOSAVE_V18_5__)return;
window.__NEXA_AUDIT_AUTOSAVE_V18_5__=true;

const QUEUE_KEY='nexa-audit-retry-v18-5';
const SENT_KEY='nexa-audit-sent-v18-5';
const $=id=>document.getElementById(id);
const RESET_IDS=new Set(['resetBtn','nexaRadarResetBtn','nfClear','nfTopClear']);
const NEW_IDS=new Set(['nexaNewCaseBtn']);
const LOGOUT_IDS=new Set(['logoutBtn','nfLogout']);
let bypass=false;
let busy=false;

function currentUserId(){
  try{return typeof currentProf!=='undefined'&&currentProf?.id?String(currentProf.id):''}catch{return''}
}
function canClinical(){
  try{return !!(typeof currentProf!=='undefined'&&currentProf?.clinical_access)}catch{return false}
}
function getFields(){
  try{return typeof collect==='function'?collect():{}}catch{return{}}
}
function hasMeaningfulCase(){
  const fields=getFields();
  return Object.values(fields).some(v=>typeof v==='string'&&v.trim());
}
function loadJson(key,fallback){
  try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}
}
function saveJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function sentSet(){return new Set(loadJson(SENT_KEY,[]))}
function markSent(id){if(!id)return;const s=sentSet();s.add(id);saveJson(SENT_KEY,[...s].slice(-300))}
function wasSent(id){return !!id&&sentSet().has(id)}

function toast(message,error=false){
  let el=$('nexaAuditAutoToast');
  if(!el){
    el=document.createElement('div');
    el.id='nexaAuditAutoToast';
    el.style.cssText='position:fixed;z-index:14000;right:18px;bottom:18px;max-width:min(430px,calc(100vw - 36px));padding:11px 13px;border-radius:10px;font:700 11px/1.35 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.16);transition:.2s;opacity:0;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent=message;
  el.style.background=error?'#fff0f0':'#ecfbf7';
  el.style.border=error?'1px solid #df8790':'1px solid #8fd8c8';
  el.style.color=error?'#8d2530':'#086f61';
  el.style.opacity='1';
  clearTimeout(el.__hide);
  el.__hide=setTimeout(()=>{el.style.opacity='0'},4200);
}

function enrichFields(fields){
  const out={...(fields||{})};
  try{
    if(typeof hypothesisReview!=='undefined'){
      if(hypothesisReview?.ai)out.hipotese_ia_original=hypothesisReview.ai;
      if(hypothesisReview?.final)out.hipotese_medico_final=hypothesisReview.final;
      if(hypothesisReview?.cid)out.cid_medico_final=hypothesisReview.cid;
      out.status_validacao_hipotese=hypothesisReview?.status||'pending';
    }
  }catch{}
  return out;
}

function buildCoreContext(){
  let plan=null;
  try{
    plan=clinicalPlanCache?.both||{exams:clinicalPlanCache?.exams||null,prescription:clinicalPlanCache?.prescription||null};
  }catch{plan={exams:null,prescription:null}}
  let hyp={status:'pending',ai:'',final:'',cid:'',source:''};
  try{hyp={status:hypothesisReview?.status||'pending',ai:hypothesisReview?.ai||'',final:hypothesisReview?.final||'',cid:hypothesisReview?.cid||'',source:hypothesisReview?.source||''}}catch{}
  let radar={chief_complaint:'',covered:[],missing:[],questions:[],alerts:[]};
  try{radar={chief_complaint:radarState?.chief_complaint||'',covered:Array.isArray(radarState?.covered)?radarState.covered:[],missing:Array.isArray(radarState?.missing)?radarState.missing:[],questions:Array.isArray(radarState?.questions)?radarState.questions:[],alerts:Array.isArray(radarState?.alerts)?radarState.alerts:[]}}catch{}
  let appVersion='unknown';
  try{appVersion=APP_CONFIG?.appVersion||'unknown'}catch{}
  let caseMode='upper';
  try{caseMode=typeof mode==='function'?mode():'upper'}catch{}
  return{
    schema_version:'2',
    case_mode:caseMode,
    hypothesis_validation:hyp,
    clinical_plan:plan,
    radar_learning:radar,
    provenance:{app_version:appVersion,reviewed_documentation:true,radar_raw_transcript_saved:false,official_source:'final_review',automatic_audit_handoff:true}
  };
}

async function ensureHistoryId(){
  try{
    if(typeof saveHistory==='function')await saveHistory();
  }catch(e){console.warn('NEXA auto-audit: saveHistory threw',e)}
  try{
    if(typeof activeHistoryId!=='undefined'&&activeHistoryId)return String(activeHistoryId);
  }catch{}
  throw new Error('Não foi possível salvar a consulta no histórico antes de finalizar.');
}

async function authHeaders(){
  if(typeof sessionHeaders==='function')return sessionHeaders();
  throw new Error('Sessão de auditoria indisponível.');
}

async function sendAuditPayload(payload){
  if(!payload?.source_consultation_id)throw new Error('Consulta sem identificador para auditoria.');
  if(wasSent(payload.source_consultation_id))return{ok:true,already:true};
  let endpoint='';
  try{endpoint=SUPABASE_URL+APP_CONFIG.submitAuditPath}catch{}
  if(!endpoint)throw new Error('Endpoint de auditoria indisponível.');
  const r=await fetch(endpoint,{method:'POST',headers:await authHeaders(),body:JSON.stringify(payload)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok&&d.error!=='ALREADY_SUBMITTED')throw new Error(d.error||`Falha ao enviar para auditoria (${r.status}).`);
  markSent(payload.source_consultation_id);
  return{ok:true,already:d.error==='ALREADY_SUBMITTED'};
}

function queuePayload(payload,reason){
  const uid=currentUserId();
  const queue=loadJson(QUEUE_KEY,[]).filter(x=>x?.payload?.source_consultation_id!==payload.source_consultation_id);
  queue.push({user_id:uid,payload,queued_at:new Date().toISOString(),reason:String(reason||'network')});
  saveJson(QUEUE_KEY,queue.slice(-100));
}

async function retryQueue(){
  if(busy||!canClinical())return;
  const uid=currentUserId();if(!uid)return;
  const queue=loadJson(QUEUE_KEY,[]);if(!queue.length)return;
  const keep=[];
  for(const item of queue){
    if(item?.user_id&&item.user_id!==uid){keep.push(item);continue}
    try{await sendAuditPayload(item.payload)}catch(e){keep.push({...item,reason:e.message||String(e)})}
  }
  saveJson(QUEUE_KEY,keep);
  if(queue.length&&!keep.filter(x=>!x.user_id||x.user_id===uid).length)toast('Fila automática de auditoria sincronizada.');
}

async function archiveCurrentCase(){
  if(!canClinical()||!hasMeaningfulCase())return{skipped:true};
  const fields=enrichFields(getFields());
  const sourceId=await ensureHistoryId();
  const payload={source_consultation_id:sourceId,fields,core_context:buildCoreContext()};
  try{
    const result=await sendAuditPayload(payload);
    toast(result.already?'Consulta já estava na auditoria.':'Consulta salva e enviada automaticamente à auditoria.');
    return{queued:false,sourceId};
  }catch(e){
    // The durable draft already exists. Keep an authenticated retry payload so a transient
    // network/backend failure never makes the clinician lose the case while starting the next one.
    queuePayload(payload,e.message);
    toast('Consulta salva. Auditoria ficou em fila e será reenviada automaticamente.',true);
    return{queued:true,sourceId,error:e};
  }
}

function nativeConfirm(action){
  if(action==='logout')return window.confirm('Sair agora? A consulta atual será salva e enviada automaticamente para auditoria antes de encerrar a sessão.');
  return window.confirm('Finalizar esta consulta e iniciar outra? O NEXA salvará a revisão atual e enviará automaticamente uma cópia desidentificada para a auditoria antes de limpar.');
}

function clickWithExistingConfirmBypassed(el){
  if(!el)return;
  const original=window.confirm;
  bypass=true;
  try{
    window.confirm=()=>true;
    el.click();
  }finally{
    window.confirm=original;
    setTimeout(()=>{bypass=false},0);
  }
}

async function finishThen(action,target){
  if(busy)return;
  if(!hasMeaningfulCase()){
    bypass=true;try{target?.click()}finally{setTimeout(()=>{bypass=false},0)}
    return;
  }
  if(!nativeConfirm(action))return;
  busy=true;
  try{
    await archiveCurrentCase();
    if(action==='logout'){
      clickWithExistingConfirmBypassed($('logoutBtn')||target);
      return;
    }
    const reset=$('resetBtn');
    if(reset)clickWithExistingConfirmBypassed(reset);
    if(action==='new')setTimeout(()=>clickWithExistingConfirmBypassed(target),20);
  }catch(e){
    console.error('NEXA auto-audit finalization',e);
    toast(`A consulta não foi apagada: ${e.message||'falha ao salvar.'}`,true);
    try{if(typeof show==='function')show(`Não foi possível finalizar com segurança: ${e.message||'falha ao salvar.'}`,true)}catch{}
  }finally{busy=false}
}

function identifyAction(el){
  if(!el?.id)return null;
  if(RESET_IDS.has(el.id))return'clear';
  if(NEW_IDS.has(el.id))return'new';
  if(LOGOUT_IDS.has(el.id))return'logout';
  return null;
}

// Capture at document level so proxy buttons cannot clear the clinical state before the audit handoff.
document.addEventListener('click',e=>{
  if(bypass||busy)return;
  const el=e.target?.closest?.('#resetBtn,#nexaRadarResetBtn,#nfClear,#nfTopClear,#nexaNewCaseBtn,#logoutBtn,#nfLogout');
  const action=identifyAction(el);if(!action||!hasMeaningfulCase())return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  finishThen(action,el);
},true);

window.addEventListener('online',()=>setTimeout(retryQueue,250));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(retryQueue,250)});
let tries=0;
const warm=setInterval(()=>{retryQueue();if(++tries>24)clearInterval(warm)},2500);
setInterval(retryQueue,60000);

window.nexaAutoArchiveForAudit=archiveCurrentCase;
window.nexaRetryAuditQueue=retryQueue;
})();

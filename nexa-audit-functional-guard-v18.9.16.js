/* NEXA v18.9.16 — Audit/Core functional bridge + safety guard · 2026-09-11 */
(()=>{
'use strict';
if(window.__NEXA_AUDIT_FUNCTIONAL_GUARD_V18_9_16__)return;
window.__NEXA_AUDIT_FUNCTIONAL_GUARD_V18_9_16__=true;

const SUPABASE_URL='https://fmkrcieubrlltiggyauc.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImZta3JjaWV1YnJsbHRpZ2d5YXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTQzNjQsImV4cCI6MjEwMDU5MDM2NH0.lueZ5Czs3oHGXmQKNhw1egzuSBUOaMWpm3VoZucvIR4';
const AUDIT_SUBMIT_PATH='/functions/v1/submit-audit-case';
const DESTINATION_STORAGE_KEY='nexa-destination-state-v18915';
const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const originalFetch=window.fetch.bind(window);

let capabilitiesReady=false;
let activeCaseId='';
let queueEpoch=0;
let latestQueuePromise=null;
const caseCache=new Map();
const auditSubmitInflight=new Map();
const reviewInflight=new Map();

// Fail closed until capabilities are resolved. The legacy auditor used to fail open
// when currentProf was outside its lexical scope.
window.currentProf=window.currentProf&&typeof window.currentProf==='object'?window.currentProf:{id:'',clinical_access:false,is_admin:false,is_reviewer:false,access_status:'unknown'};
window.currentProf.is_admin=!!window.currentProf.is_admin;
window.currentProf.is_reviewer=!!window.currentProf.is_reviewer;

function currentAuth(){
  let access='',userId='';
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      if(!key.includes('auth-token'))continue;
      const parsed=JSON.parse(localStorage.getItem(key)||'{}');
      const session=parsed?.currentSession||parsed?.session||parsed;
      if(session?.access_token){access=session.access_token;userId=session.user?.id||parsed?.user?.id||'';break}
    }
  }catch{}
  return{access,userId};
}
function authHeaders(){
  const {access}=currentAuth();
  if(!access)throw new Error('Sessão do NEXA Core indisponível.');
  return{Authorization:`Bearer ${access}`,apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'};
}
function clone(value){try{return structuredClone(value)}catch{try{return JSON.parse(JSON.stringify(value))}catch{return value}}}
function directIdentifierKey(key){return /^(?:nome(?:_do)?_?paciente|patient_?name|cpf|telefone|phone|celular|mobile|email|e_?mail|endereco|address|cep|rg|documento|document_?id|user_?id|doctor_?id|medico_?id|physician_?id|reviewer_?id)$/i.test(String(key||''))}
function redactText(value){
  return String(value??'')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,'[E-MAIL REMOVIDO]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[CPF REMOVIDO]')
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}\b/g,'[TELEFONE REMOVIDO]');
}
function sanitizeFields(fields){
  const out={};
  for(const [key,value] of Object.entries(fields&&typeof fields==='object'?fields:{})){
    if(directIdentifierKey(key))continue;
    if(typeof value==='string')out[key]=redactText(value);
    else if(Array.isArray(value))out[key]=value.map(v=>typeof v==='string'?redactText(v):v);
    else out[key]=value;
  }
  return out;
}
function sanitizeAuditCase(row){
  const out=clone(row||{});if(!out||typeof out!=='object')return out;
  for(const key of ['user_id','doctor_id','medico_id','physician_id','reviewer_id','submitted_by'])delete out[key];
  out.deidentified_fields=sanitizeFields(out.deidentified_fields||{});
  return out;
}
function sanitizeQueue(data){
  const list=Array.isArray(data)?data:[];
  const safe=list.map(sanitizeAuditCase);
  for(const row of safe){if(row?.id)caseCache.set(String(row.id),row)}
  return safe;
}
async function rpcFetch(name,args={}){
  const r=await originalFetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',headers:authHeaders(),body:JSON.stringify(args||{})});
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(d?.message||d?.error||`Falha no NEXA Core (${r.status}).`);
  return d;
}
async function guardedRpc(name,args={}){
  try{
    if(name==='get_audit_queue'){
      const epoch=++queueEpoch;
      const p=rpcFetch(name,args).then(sanitizeQueue);
      latestQueuePromise=p;
      const data=await p;
      if(epoch!==queueEpoch&&latestQueuePromise)return{data:await latestQueuePromise,error:null};
      return{data,error:null};
    }
    if(name==='submit_audit_review'){
      const key=String(args?.case_id||'');
      if(key&&reviewInflight.has(key))return{data:await reviewInflight.get(key),error:null};
      const p=rpcFetch(name,args);
      if(key)reviewInflight.set(key,p);
      try{return{data:await p,error:null}}finally{if(key&&reviewInflight.get(key)===p)reviewInflight.delete(key)}
    }
    return{data:await rpcFetch(name,args),error:null};
  }catch(error){return{data:null,error}}
}

// Minimal bridge used only by the existing auditor modules, which expect a global sb.rpc.
// It does not replace the clinical Supabase client kept inside index.html.
const previousSb=window.sb;
window.sb={...(previousSb||{}),rpc:guardedRpc};

async function refreshCapabilities(){
  const auth=currentAuth();
  if(!auth.access){capabilitiesReady=false;window.currentProf={id:'',clinical_access:false,is_admin:false,is_reviewer:false,access_status:'signed_out'};syncRoleUi();return false}
  try{
    const data=await rpcFetch('get_my_capabilities',{});
    const p=Array.isArray(data)?data[0]:data;
    window.currentProf={
      id:auth.userId||'',
      clinical_access:!!p?.clinical_access,
      is_admin:!!p?.is_admin,
      is_reviewer:!!p?.is_reviewer,
      access_status:String(p?.access_status||'active')
    };
    capabilitiesReady=true;syncRoleUi();
    window.dispatchEvent(new CustomEvent('nexa:audit-capabilities',{detail:{is_admin:window.currentProf.is_admin,is_reviewer:window.currentProf.is_reviewer}}));
    return window.currentProf.is_admin||window.currentProf.is_reviewer;
  }catch{
    capabilitiesReady=false;
    window.currentProf={id:auth.userId||'',clinical_access:false,is_admin:false,is_reviewer:false,access_status:'unverified'};
    syncRoleUi();return false;
  }
}
function syncRoleUi(){
  const role=window.currentProf?.is_admin?'Administrador':window.currentProf?.is_reviewer?'Revisor':'Sem acesso à Auditoria';
  const user=q('#nexaAuditExact .ax-user');if(user)user.innerHTML=`<b>${role}</b>NEXA Core`;
}

function normalizeDestination(value){
  const src=value&&typeof value==='object'?value:{};
  const pick=v=>['alta','reavaliacao','internacao'].includes(String(v||'').toLowerCase())?String(v).toLowerCase():'';
  const status=['pending','recommended','confirmed','altered'].includes(src.status)?src.status:'pending';
  return{recommended:pick(src.recommended),final:pick(src.final),status,source:String(src.source||''),updated_at:String(src.updated_at||''),recommendation_stale:!!src.recommendation_stale,reason:String(src.reason||'')};
}
function currentDestination(){
  try{if(window.nexaDestinationFlow18915?.state)return normalizeDestination(window.nexaDestinationFlow18915.state)}catch{}
  try{return normalizeDestination(JSON.parse(localStorage.getItem(DESTINATION_STORAGE_KEY)||'{}'))}catch{return normalizeDestination({})}
}
async function destinationFromHistory(sourceId){
  if(!sourceId)return null;
  try{
    const r=await originalFetch(`${SUPABASE_URL}/rest/v1/consultation_history?select=processing_meta&id=eq.${encodeURIComponent(sourceId)}&limit=1`,{headers:authHeaders()});
    if(!r.ok)return null;const rows=await r.json().catch(()=>[]);const meta=rows?.[0]?.processing_meta||{};const saved=meta.destinationState||meta.destination;
    return saved?normalizeDestination(saved):null;
  }catch{return null}
}
async function augmentAuditPayload(payload){
  const out=clone(payload&&typeof payload==='object'?payload:{});
  out.core_context=out.core_context&&typeof out.core_context==='object'?out.core_context:{};
  const historyDestination=await destinationFromHistory(out.source_consultation_id);
  const destination=historyDestination||currentDestination();
  if(destination.recommended||destination.final)out.core_context.destination={...destination};
  out.core_context.audit_submission_snapshot={captured_at:new Date().toISOString(),source_consultation_id:String(out.source_consultation_id||''),immutable_submission:true};
  return out;
}

window.fetch=async function auditAwareFetch(input,init={}){
  const url=typeof input==='string'?input:(input?.url||'');
  if(!url.includes(AUDIT_SUBMIT_PATH))return originalFetch(input,init);
  let payload=null;
  try{payload=typeof init?.body==='string'?JSON.parse(init.body):null}catch{}
  if(!payload)return originalFetch(input,init);
  payload=await augmentAuditPayload(payload);
  const key=String(payload.source_consultation_id||'no-source');
  if(auditSubmitInflight.has(key)){
    const shared=await auditSubmitInflight.get(key);
    window.dispatchEvent(new CustomEvent('nexa:audit-submit-deduplicated',{detail:{source_consultation_id:key}}));
    return shared.clone();
  }
  const request=originalFetch(input,{...init,body:JSON.stringify(payload)});
  auditSubmitInflight.set(key,request);
  try{const response=await request;return response.clone()}finally{if(auditSubmitInflight.get(key)===request)auditSubmitInflight.delete(key)}
};

function reviewShellMarkup(){return `<div class="ax-rhead"><div class="ax-rbar"><button class="ax-back" data-ax-back>←</button><div><div class="ax-rtitle" id="axRTitle">Revisão de caso</div><div class="ax-rmeta" id="axRMeta"></div></div><div class="ax-rnav"><button data-ax-back>↶ Voltar para a lista</button></div></div><div class="ax-tabs">${['documentacao','hipotese','conduta','radar','comparacao','historico'].map((x,i)=>`<button class="${i?'':'active'}" data-ax-tab="${x}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}</div></div><div class="ax-rbody" id="axRBody"></div><div class="ax-decision"><button class="ax-return" data-ax-back>↶ Voltar para a fila</button><button class="ax-discard" data-ax-decision="discarded">⌫ Descartar do aprendizado</button><button class="ax-bluebtn" data-ax-decision="corrected">✓ Aprovar com correções</button><button class="ax-greenbtn" data-ax-decision="approved">✓ Aprovar sem alteração</button></div><nav class="ax-mobile-review-nav"><button class="active" data-ax-tab="documentacao">▣<br>Caso</button><button data-ax-tab="comparacao">⇄<br>Comparar</button><button data-ax-tab="radar">◎<br>Radar</button><button data-ax-tab="decisao">✓<br>Decisão</button></nav>`}
function repairReviewShell(){const root=$('axReview');if(!root||$('axRTitle'))return false;root.innerHTML=reviewShellMarkup();return true}
function destinationLabel(v){return({alta:'ALTA',reavaliacao:'REAVALIAÇÃO',internacao:'INTERNAÇÃO'})[v]||'—'}
function destinationStatus(v){return({pending:'Pendente',recommended:'Recomendado pela IA',confirmed:'Confirmado pelo médico',altered:'Alterado pelo médico'})[v]||String(v||'Pendente')}
function injectDestinationSnapshot(){
  const body=$('axRBody');if(!body||!activeCaseId||$('axAuditDestinationSnapshot'))return;
  const row=caseCache.get(String(activeCaseId));const d=normalizeDestination(row?.core_context?.destination||{});
  if(!d.recommended&&!d.final)return;
  const card=document.createElement('section');card.id='axAuditDestinationSnapshot';card.className='ax-pane';card.style.gridColumn='1 / -1';
  card.innerHTML=`<h3>Destino / desfecho clínico · snapshot enviado</h3><div class="ax-section"><strong>Recomendação da IA</strong><div class="ax-original">${destinationLabel(d.recommended)}</div></div><div class="ax-section"><strong>Decisão médica final</strong><div class="ax-original">${destinationLabel(d.final)}</div></div><div class="ax-section"><strong>Status / origem</strong><div class="ax-original">${destinationStatus(d.status)} · ${redactText(d.source||'—')}</div></div>`;
  body.prepend(card);
}
function normalizeAuditDom(){
  syncRoleUi();
  qa('#axReview .ax-actions').forEach(el=>el.remove()); // legacy per-field buttons had no handler/backend contract
  qa('#axReview .ax-rnav button:not([data-ax-back])').forEach(el=>el.remove()); // legacy prev/next were inert
  const back=q('#axReview .ax-return');if(back)back.textContent='↶ Voltar para a fila';
  injectDestinationSnapshot();
  const success=q('#axReview .ax-success');if(success&&!success.dataset.nexaGuardBound){
    success.dataset.nexaGuardBound='1';const btn=success.querySelector('button');btn?.addEventListener('click',()=>setTimeout(repairReviewShell,0),{once:true});
  }
}

function bind(){
  document.addEventListener('click',e=>{
    const open=e.target?.closest?.('[data-ax-open]');if(open){activeCaseId=String(open.dataset.axOpen||'');repairReviewShell();setTimeout(normalizeAuditDom,0)}
    const auth=e.target?.closest?.('#authSubmitBtn,#signInTab,#signUpTab');if(auth)setTimeout(refreshCapabilities,700);
  },true);
  const observer=new MutationObserver(()=>{queueMicrotask(normalizeAuditDom)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('focus',()=>{if(!capabilitiesReady)refreshCapabilities()});
  refreshCapabilities();
  let retries=0;const timer=setInterval(async()=>{if(capabilitiesReady||retries++>=8){clearInterval(timer);return}await refreshCapabilities()},1500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();

window.nexaAuditFunctionalGuard18916={
  get capabilitiesReady(){return capabilitiesReady},
  get activeCaseId(){return activeCaseId},
  sanitizeFields,sanitizeAuditCase,augmentAuditPayload,refreshCapabilities,repairReviewShell,reviewShellMarkup,
  get caseCache(){return caseCache},get auditSubmitInflight(){return auditSubmitInflight},get reviewInflight(){return reviewInflight}
};
})();

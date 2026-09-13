/* NEXA v18.9.19 — persistent Audit outbox + reset safety */
(()=>{
'use strict';
if(window.__NEXA_AUDIT_OUTBOX_V18_9_19__)return;window.__NEXA_AUDIT_OUTBOX_V18_9_19__=true;
const DB='nexa-audit-outbox-v18919',STORE='items',RESET='#resetBtn,#nexaRadarResetBtn,#nfClear,#nfTopClear,#nexaNewCaseBtn';
const KEYS=['queixa_principal','hda','comorbidades','antecedentes','medicacoes','alergias','hipotese_diagnostica','orientacoes_alta','sugestoes_perguntas','exame_fisico','conduta'];
let bypass=false;
const clone=x=>{try{return structuredClone(x)}catch{return JSON.parse(JSON.stringify(x))}};
const uuid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
function owner(){return String(window.currentProf?.id||'')}
function field(k){return String(document.querySelector(`.field[data-key="${k}"] textarea`)?.value||'').trim()}
function collect(){const o={};for(const k of KEYS)o[k]=field(k);return o}
function valid(f){const xs=[f.queixa_principal,f.hda,f.exame_fisico,f.hipotese_diagnostica,f.conduta].map(v=>String(v||'').trim()),n=xs.filter(v=>v.length>=5).length;return xs[1].length>=20||(xs[0].length>=5&&n>=2)||n>=3}
function redact(v){return String(v??'').replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,'[E-MAIL REMOVIDO]').replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[CPF REMOVIDO]').replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}\b/g,'[TELEFONE REMOVIDO]')}
function sanitize(f){const o={};for(const[k,v]of Object.entries(f||{})){if(/^(nome(?:_do)?_?paciente|patient_?name|cpf|rg|telefone|phone|celular|email|endereco|address|cep|documento|patient_?id)$/i.test(k))continue;o[k]=typeof v==='string'?redact(v):v}return o}
function destination(){try{return clone(window.nexaDestinationFlow18915?.state||{})}catch{return{}}}
function hypothesis(f){return{ai:String(document.getElementById('aiHypothesisOriginal')?.textContent||'').trim(),physician_final:String(document.getElementById('physicianHypothesis')?.value||f.hipotese_diagnostica||'').trim(),cid:String(document.getElementById('physicianCid')?.value||'').trim()}}
function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'idempotency_key'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function get(key){const d=await openDb();return new Promise((res,rej)=>{const t=d.transaction(STORE,'readonly'),r=t.objectStore(STORE).get(key);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);t.oncomplete=()=>d.close()})}
async function put(item){const d=await openDb();return new Promise((res,rej)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).put(clone(item));t.oncomplete=()=>{d.close();res(item)};t.onerror=()=>{d.close();rej(t.error)}})}
async function all(){const d=await openDb();return new Promise((res,rej)=>{const t=d.transaction(STORE,'readonly'),r=t.objectStore(STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);t.oncomplete=()=>d.close()})}
async function snapshot(reason='reset_safety_net'){
 const raw=collect();if(!valid(raw))return null;const who=owner();if(!who)throw new Error('Sessão clínica não identificada.');const source=uuid(),version='final-v1',key=`${source}:${version}`,captured=new Date().toISOString(),fields=sanitize(raw),h=hypothesis(fields),dest=destination();
 return{local_submission_id:uuid(),idempotency_key:key,source_consultation_id:source,snapshot_version:version,owner_user_id:who,captured_at:captured,state:'queued',attempt_count:0,last_attempt_at:null,last_error:null,payload:{source_consultation_id:source,snapshot_version:version,idempotency_key:key,fields,core_context:{schema_version:'3',hypothesis_validation:{ai:h.ai,final:h.physician_final,cid:h.cid},destination:dest,learning_layers:{original_ai:{hypothesis:h.ai},physician_final:{hypothesis:h.physician_final,cid:h.cid,destination:dest},audit_corrected:null},audit_submission_snapshot:{captured_at:captured,source_consultation_id:source,immutable_submission:true,capture_reason:reason,frontend_version:'18.9.19'}}}};
}
async function enqueue(item){const old=await get(item.idempotency_key);if(old){window.dispatchEvent(new CustomEvent('nexa:audit-submission-deduplicated',{detail:{idempotency_key:item.idempotency_key}}));return old}await put(item);window.dispatchEvent(new CustomEvent('nexa:audit-snapshot-created',{detail:{idempotency_key:item.idempotency_key}}));window.dispatchEvent(new CustomEvent('nexa:audit-outbox-queued',{detail:{idempotency_key:item.idempotency_key}}));return item}
function toast(msg,bad=false){let x=document.getElementById('nexaAuditOutboxToast');if(!x){x=document.createElement('div');x.id='nexaAuditOutboxToast';x.style.cssText='position:fixed;z-index:40000;right:16px;bottom:92px;max-width:440px;padding:10px 12px;border-radius:10px;font:800 11px/1.35 system-ui;box-shadow:0 10px 28px rgba(0,0,0,.2)';document.body.appendChild(x)}x.textContent=msg;x.style.background=bad?'#fff0f1':'#eaf8f4';x.style.color=bad?'#8e2931':'#086f61';clearTimeout(x.__t);x.__t=setTimeout(()=>x.remove(),4200)}
async function preserve(reason){const s=await snapshot(reason);if(!s)return null;return enqueue(s)}
async function beforeReset(el){try{const s=await preserve('reset_safety_net');if(s)toast('Atendimento preservado localmente para Auditoria.');bypass=true;el.click();queueMicrotask(()=>bypass=false);window.dispatchEvent(new CustomEvent('nexa:audit-outbox-flush-request'))}catch(e){toast(`Atendimento não apagado: ${e.message||e}`,true)}}
async function manual(btn){try{const s=await preserve('manual_early_submit');if(!s)return toast('Não há conteúdo clínico suficiente para Auditoria.',true);toast('Snapshot preservado na fila de Auditoria.');window.dispatchEvent(new CustomEvent('nexa:audit-outbox-flush-request'));if(btn){const old=btn.textContent;btn.textContent='Enfileirada ✓';setTimeout(()=>btn.textContent=old,1500)}}catch(e){toast(e.message||'Falha ao preservar snapshot.',true)}}
document.addEventListener('click',e=>{const r=e.target?.closest?.(RESET);if(r&&!bypass){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();beforeReset(r);return}const b=e.target?.closest?.('#submitAuditBtn');if(b){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();manual(b)}},true);
window.nexaAuditOutbox18919={snapshot,preserve,enqueue,get,put,all,valid,sanitize,owner};
})();

/* NEXA v18.9.5 · native save+audit safety before clear/new case · 2026-09-06 */
(()=>{
'use strict';
if(window.__NEXA_AUDIT_CLEAR_SAFETY_V18_9_5__)return;
window.__NEXA_AUDIT_CLEAR_SAFETY_V18_9_5__=true;
const $=s=>document.querySelector(s);
const SELECTOR='#resetBtn,#nexaRadarResetBtn,#nfClear,#nfTopClear,#nexaNewCaseBtn';
let bypass=false,busy=false;
function hasCase(){return [...document.querySelectorAll('.field textarea')].some(x=>x.value?.trim())}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function waitFor(fn,timeout=8000,step=80){const t=Date.now();while(Date.now()-t<timeout){if(fn())return true;await sleep(step)}return false}
function bannerText(){return ($('#bannerArea')?.innerText||'').trim()}
async function nativeSave(){
  const b=$('#updateHistoryBtn');if(!b)throw new Error('Botão nativo de salvar revisão não encontrado.');
  b.click();
  const ok=await waitFor(()=>$('#saveState')?.classList.contains('saved')||/salvo/i.test($('#saveState')?.textContent||''),9000);
  if(!ok)throw new Error('A consulta não confirmou salvamento no histórico.');
}
async function nativeAudit(){
  const b=$('#submitAuditBtn');if(!b)throw new Error('Botão nativo de auditoria não encontrado.');
  const original=window.confirm;
  try{window.confirm=()=>true;b.click();}finally{window.confirm=original}
  await waitFor(()=>b.disabled||/enviando/i.test(b.textContent||''),1500);
  const done=await waitFor(()=>!b.disabled&&!/enviando/i.test(b.textContent||''),12000);
  if(!done)throw new Error('O envio para auditoria não confirmou conclusão.');
  const msg=bannerText();
  if(/falha|erro|sessão expirada|não possui acesso|não há conteúdo/i.test(msg))throw new Error(msg||'Falha ao enviar para auditoria.');
  if(/já foi enviada|já foi enviado|ALREADY_SUBMITTED/i.test(msg))return {already:true};
  return {already:false};
}
function toast(msg,error=false){
  let x=$('#nexaAuditClearSafetyToast');if(!x){x=document.createElement('div');x.id='nexaAuditClearSafetyToast';x.style.cssText='position:fixed;z-index:30000;right:16px;bottom:92px;max-width:min(430px,calc(100vw - 32px));padding:10px 12px;border-radius:10px;font:800 11px/1.35 Inter,system-ui;box-shadow:0 10px 28px rgba(0,0,0,.18)';document.body.appendChild(x)}
  x.textContent=msg;x.style.background=error?'#fff0f1':'#eaf8f4';x.style.border=error?'1px solid #df9da5':'1px solid #91d7c5';x.style.color=error?'#8e2931':'#086f61';
  clearTimeout(x.__t);x.__t=setTimeout(()=>x.remove(),4200);
}
async function finish(el){
  if(busy)return;busy=true;
  try{
    await nativeSave();
    const result=await nativeAudit();
    toast(result.already?'Consulta já estava na Auditoria. Limpando com segurança.':'Consulta salva e enviada à Auditoria.');
    bypass=true;el.click();setTimeout(()=>{bypass=false},0);
  }catch(e){
    console.error('NEXA safe clear',e);toast(`Consulta não foi apagada: ${e.message||'falha ao salvar/enviar.'}`,true);
  }finally{busy=false}
}
document.addEventListener('click',e=>{
  if(bypass||busy)return;
  const el=e.target?.closest?.(SELECTOR);if(!el||!hasCase())return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  if(!window.confirm('Finalizar esta consulta? O NEXA vai salvá-la e enviá-la automaticamente para Auditoria antes de limpar.'))return;
  finish(el);
},true);
window.nexaFinalizeCaseSafely=()=>{const el=$('#resetBtn')||$('#nfClear')||$('#nfTopClear');if(el)return finish(el)};
})();
/* NEXA v18.9.16 — Audit UI integrity: do not present unsupported analytics as live data */
(()=>{
'use strict';
if(window.__NEXA_AUDIT_UI_INTEGRITY_V18_9_16__)return;
window.__NEXA_AUDIT_UI_INTEGRITY_V18_9_16__=true;
const qa=s=>[...document.querySelectorAll(s)];
function normalize(){
  // There is no in_review state/claim RPC in the current audited contract.
  // Do not display a hard-coded zero as if it were a functional queue state.
  qa('#nexaAuditExact .ax-kpi').forEach(card=>{
    const label=card.querySelector('small')?.textContent?.trim();
    if(label==='Em revisão')card.remove();
  });
  // Legacy deltas were static copy (+3 today, +12 this week, etc.), not backend data.
  qa('#nexaAuditExact .ax-kpi em').forEach(el=>{if(/^\+\d/.test(el.textContent?.trim()||''))el.remove()});
  // Field-correction percentages were fixed demo values and belong to future Core Insights,
  // not to the functional Audit queue being validated here.
  qa('#nexaAuditExact .ax-card h3').forEach(h=>{if(h.textContent?.trim()==='Principais campos com correções')h.closest('.ax-card')?.remove()});
}
function boot(){normalize();new MutationObserver(()=>queueMicrotask(normalize)).observe(document.documentElement,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.nexaAuditUiIntegrity18916={normalize};
})();

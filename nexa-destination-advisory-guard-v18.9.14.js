/* NEXA v18.9.14 — Destination advisory dedupe guard · 2026-09-11 */
(()=>{
  'use strict';
  if(window.__NEXA_DESTINATION_ADVISORY_GUARD_V18_9_14__)return;
  window.__NEXA_DESTINATION_ADVISORY_GUARD_V18_9_14__=true;

  let dockObserver=null;
  let rootObserver=null;

  function markPrimaryAdvisory(){
    const primary=document.getElementById('nexaDispositionCard');
    if(!primary)return false;
    primary.dataset.destinationRole='radar-advisory';
    primary.setAttribute?.('aria-label','Tendência assistiva do Radar; não representa desfecho clínico final confirmado pelo médico.');
    return true;
  }

  function suppressLegacyDuplicate(){
    const dock=document.getElementById('nexaRadarStableDock');
    if(!dock)return false;
    let suppressed=false;
    for(const card of dock.querySelectorAll?.('.nrs-card')||[]){
      const text=String(card.textContent||'').toLowerCase();
      const isDisposition=!!card.querySelector?.('.nrs-disp-main')||text.includes('disposição do ps');
      if(!isDisposition)continue;
      card.hidden=true;
      card.style?.setProperty?.('display','none','important');
      card.dataset.destinationDuplicate='suppressed';
      suppressed=true;
    }
    return suppressed;
  }

  function sync(){
    markPrimaryAdvisory();
    suppressLegacyDuplicate();
  }

  function observeDock(){
    const dock=document.getElementById('nexaRadarStableDock');
    if(!dock||dockObserver)return !!dock;
    dockObserver=new MutationObserver(()=>suppressLegacyDuplicate());
    dockObserver.observe(dock,{childList:true,subtree:true});
    suppressLegacyDuplicate();
    return true;
  }

  function boot(){
    sync();
    if(observeDock())return;
    rootObserver=new MutationObserver(()=>{
      sync();
      if(observeDock()){
        rootObserver?.disconnect?.();
        rootObserver=null;
      }
    });
    rootObserver.observe(document.documentElement||document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  window.nexaDestinationAdvisoryGuard18914={
    sync,
    suppressLegacyDuplicate,
    markPrimaryAdvisory,
    get hasMedicalDispositionFlow(){return false}
  };
})();

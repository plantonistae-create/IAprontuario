/* NEXA production loader · clean UI v7 + mobile viewport fix v8 + stability/auditor v9 + desktop/auth v10.5 + pause compatibility · 2026-09-04 */
(()=>{
  // Compatibility guard for legacy inline handlers that still call Pause().
  // It delegates to the current NEXA pause control instead of creating new audio logic.
  if(typeof window.Pause!=='function'){
    window.Pause=function(){
      const candidates=['nexaDesktopPause','nexaRadarPauseProxy','n7Pause','recBtn'];
      for(const id of candidates){
        const el=document.getElementById(id);
        if(el && el.offsetParent!==null && typeof el.click==='function'){ el.click(); return true; }
      }
      for(const id of candidates){
        const el=document.getElementById(id);
        if(el && typeof el.click==='function'){ el.click(); return true; }
      }
      return false;
    };
  }
  const load=(src)=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  load('./nexa-hotfix-v1.js?v=20260904-clean')
    .catch(console.error)
    .finally(()=>load('./nexa-ui-v3.js?v=20260904-clean')
      .catch(console.error)
      .finally(()=>load('./nexa-radar-v4.js?v=20260904-clean')
        .catch(console.error)
        .finally(()=>load('./nexa-clean-ui-v7.js?v=20260904-1')
          .catch(console.error)
          .finally(()=>load('./nexa-mobile-viewport-fix-v8.js?v=20260904-4')
            .catch(console.error)
            .finally(()=>load('./nexa-auditor-mobile-guard-v9.js?v=20260904-5')
              .catch(console.error)
              .finally(()=>load('./nexa-desktop-stability-v10.js?v=20260904-7').catch(console.error)))))));
})();
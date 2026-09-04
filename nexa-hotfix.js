/* NEXA production loader · desktop parity v11 + recording state compatibility · 2026-09-04 */
(()=>{
  // Legacy recording code still references the global identifier `paused`.
  // Keep one compatibility state until the recorder is fully consolidated.
  if(typeof window.paused==='undefined') window.paused=false;

  // Compatibility alias for older inline Pause() calls. Never proxy to n7Pause
  // itself, which would recurse through the clean UI shell.
  if(typeof window.Pause!=='function'){
    window.Pause=function(){
      const candidates=['nexaDesktopPause','nexaRadarPauseProxy','recBtn'];
      for(const id of candidates){const el=document.getElementById(id);if(el&&el.offsetParent!==null&&typeof el.click==='function'){el.click();return true}}
      for(const id of candidates){const el=document.getElementById(id);if(el&&typeof el.click==='function'){el.click();return true}}
      return false;
    };
  }
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  load('./nexa-hotfix-v1.js?v=20260904-recstate1').catch(console.error)
  .finally(()=>load('./nexa-ui-v3.js?v=20260904-recstate1').catch(console.error)
  .finally(()=>load('./nexa-radar-v4.js?v=20260904-recstate1').catch(console.error)
  .finally(()=>load('./nexa-clean-ui-v7.js?v=20260904-recstate1').catch(console.error)
  .finally(()=>load('./nexa-mobile-viewport-fix-v8.js?v=20260904-recstate1').catch(console.error)
  .finally(()=>load('./nexa-auditor-mobile-guard-v9.js?v=20260904-recstate1').catch(console.error)
  .finally(()=>load('./nexa-desktop-stability-v10.js?v=20260904-recstate1').catch(console.error)
  .finally(()=>load('./nexa-desktop-mockup-v11.js?v=20260904-recstate1').catch(console.error))))))));
})();
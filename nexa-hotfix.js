/* NEXA production loader · auth rescue v13 + desktop layout v12 · 2026-09-04 */
(()=>{
  if(typeof window.paused==='undefined') window.paused=false;
  if(typeof window.Pause!=='function'){
    window.Pause=function(){
      const candidates=['nexaDesktopPause','nexaRadarPauseProxy','recBtn'];
      for(const id of candidates){const el=document.getElementById(id);if(el&&el.offsetParent!==null&&typeof el.click==='function'){el.click();return true}}
      for(const id of candidates){const el=document.getElementById(id);if(el&&typeof el.click==='function'){el.click();return true}}
      return false;
    };
  }
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  load('./nexa-auth-rescue-v13.js?v=20260904-authfix2').catch(console.error)
  .finally(()=>load('./nexa-hotfix-v1.js?v=20260904-authfix2').catch(console.error)
  .finally(()=>load('./nexa-ui-v3.js?v=20260904-authfix2').catch(console.error)
  .finally(()=>load('./nexa-radar-v4.js?v=20260904-authfix2').catch(console.error)
  .finally(()=>load('./nexa-clean-ui-v7.js?v=20260904-authfix2').catch(console.error)
  .finally(()=>load('./nexa-mobile-viewport-fix-v8.js?v=20260904-authfix2').catch(console.error)
  .finally(()=>load('./nexa-auditor-mobile-guard-v9.js?v=20260904-authfix2').catch(console.error)
  .finally(()=>load('./nexa-desktop-stability-v10.js?v=20260904-authfix2').catch(console.error)
  .finally(()=>load('./nexa-desktop-mockup-v11.js?v=20260904-authfix2').catch(console.error)
  .finally(()=>load('./nexa-desktop-layout-v12.js?v=20260904-authfix2').catch(console.error))))))))));
})();
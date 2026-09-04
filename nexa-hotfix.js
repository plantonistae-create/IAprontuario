/* NEXA production loader · functional core + single UI v18.1 · 2026-09-04 */
(()=>{
  if(typeof window.paused==='undefined')window.paused=false;
  if(typeof window.Pause!=='function')window.Pause=()=>document.getElementById('nexaLocalPauseBtn')?.click()||false;
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  load('./nexa-hotfix-v1.js?v=20260904-v181').catch(console.error)
    .finally(()=>load('./nexa-ui-v3.js?v=20260904-v181').catch(console.error)
    .finally(()=>load('./nexa-radar-v4.js?v=20260904-v181').catch(console.error)
    .finally(()=>load('./nexa-final-ui-v18.js?v=20260904-v181').catch(console.error)
    .finally(()=>load('./nexa-layout-flow-v18.1.js?v=20260904-v181').catch(console.error)))));
})();

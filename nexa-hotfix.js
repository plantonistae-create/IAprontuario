/* NEXA production loader · consolidated runtime + approved UI v17 · 2026-09-04 */
(()=>{
  if(typeof window.paused==='undefined') window.paused=false;
  if(typeof window.Pause!=='function')window.Pause=()=>document.getElementById('nexaLocalPauseBtn')?.click()||false;
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  load('./nexa-hotfix-v1.js?v=20260904-v17').catch(console.error)
  .finally(()=>load('./nexa-ui-v3.js?v=20260904-v17').catch(console.error)
  .finally(()=>load('./nexa-radar-v4.js?v=20260904-v17').catch(console.error)
  .finally(()=>load('./nexa-runtime-consolidated-v14.js?v=20260904-v17').catch(console.error)
  .finally(()=>load('./nexa-approved-ui-v15.js?v=20260904-v17').catch(console.error)
  .finally(()=>load('./nexa-parity-v17.js?v=20260904-v17').catch(console.error)
  .finally(()=>load('./nexa-parity-v17-hotfix.js?v=20260904-v17').catch(console.error)))))));
})();
/* NEXA production loader · functional History + My Style + safe audit clear v18.9.6 · 2026-09-06 */
(async()=>{
  if(typeof window.paused==='undefined')window.paused=false;
  if(typeof window.Pause!=='function')window.Pause=()=>document.getElementById('nexaLocalPauseBtn')?.click()||false;
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  const modules=[
    './nexa-hotfix-v1.js?v=20260906-v1896',
    './nexa-ui-v3.js?v=20260906-v1896',
    './nexa-radar-v4.js?v=20260906-v1896',
    './nexa-final-ui-v18.js?v=20260906-v1896',
    './nexa-layout-static-v18.6.5.js?v=20260906-v1896',
    './nexa-record-draft-history-v18.6.6.js?v=20260906-v1896',
    './nexa-mobile-shell-v18.6.7.js?v=20260906-v1896',
    './nexa-mobile-flow-v18.8.1.js?v=20260906-v1896',
    './nexa-auditor-exact-v18.9.js?v=20260906-v1896',
    './nexa-auditor-panel-queue-v18.9.2.js?v=20260906-v1896',
    './nexa-medical-layout-state-v18.9.3.js?v=20260906-v1896',
    './nexa-radar-stable-state-v18.9.4.js?v=20260906-v1896',
    './nexa-history-native-v18.9.5.js?v=20260906-v1896',
    './nexa-audit-clear-safety-v18.9.5.js?v=20260906-v1896',
    './nexa-history-style-v18.9.6.js?v=20260906-v1896'
  ];
  for(const src of modules){try{await load(src)}catch(error){console.error('NEXA module load failed:',src,error)}}
})();

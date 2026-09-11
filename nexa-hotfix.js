/* NEXA production loader · Hypothesis/CID functional guard v18.9.11 · 2026-09-11 */
(async()=>{
  if(typeof window.paused==='undefined')window.paused=false;
  if(typeof window.Pause!=='function')window.Pause=()=>document.getElementById('nexaLocalPauseBtn')?.click()||false;
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  const modules=[
    './nexa-hotfix-v1.js?v=20260907-v1898','./nexa-ui-v3.js?v=20260907-v1898','./nexa-radar-v4.js?v=20260907-v1898','./nexa-final-ui-v18.js?v=20260907-v1898','./nexa-layout-static-v18.6.5.js?v=20260907-v1898','./nexa-record-draft-history-v18.6.6.js?v=20260907-v1898','./nexa-mobile-shell-v18.6.7.js?v=20260907-v1898','./nexa-mobile-flow-v18.8.1.js?v=20260907-v1898','./nexa-auditor-exact-v18.9.js?v=20260907-v1898','./nexa-auditor-panel-queue-v18.9.2.js?v=20260907-v1898','./nexa-medical-layout-state-v18.9.3.js?v=20260907-v1898','./nexa-radar-stable-state-v18.9.4.js?v=20260907-v1898','./nexa-history-style-audit-v18.9.7.js?v=20260907-v1898','./nexa-recording-timer-state-v18.9.8.js?v=20260907-v1898','./nexa-sic-documentation-rule-v18.9.8.js?v=20260907-v1898','./nexa-radar-state-bridge-v18.9.9.js?v=20260911-v1899','./nexa-summary-state-guard-v18.9.10.js?v=20260911-v18910','./nexa-hypothesis-cid-guard-v18.9.11.js?v=20260911-v18911'
  ];
  for(const src of modules){try{await load(src)}catch(error){console.error('NEXA module load failed:',src,error)}}
})();

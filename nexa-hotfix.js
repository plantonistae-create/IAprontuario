/* NEXA production loader · exact auditor v18.9 · 2026-09-05 */
(async()=>{
  if(typeof window.paused==='undefined')window.paused=false;
  if(typeof window.Pause!=='function')window.Pause=()=>document.getElementById('nexaLocalPauseBtn')?.click()||false;
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  const modules=[
    './nexa-hotfix-v1.js?v=20260905-v1890',
    './nexa-ui-v3.js?v=20260905-v1890',
    './nexa-radar-v4.js?v=20260905-v1890',
    './nexa-final-ui-v18.js?v=20260905-v1890',
    './nexa-layout-static-v18.6.5.js?v=20260905-v1890',
    './nexa-audit-autosave-v18.5.js?v=20260905-v1890',
    './nexa-record-draft-history-v18.6.6.js?v=20260905-v1890',
    './nexa-mobile-shell-v18.6.7.js?v=20260905-v1890',
    './nexa-history-lifecycle-v18.6.9.js?v=20260905-v1890',
    './nexa-mobile-flow-v18.8.1.js?v=20260905-v1890',
    './nexa-auditor-exact-v18.9.js?v=20260905-v1890'
  ];
  for(const src of modules){try{await load(src)}catch(error){console.error('NEXA module load failed:',src,error)}}
})();

/* NEXA production loader · stability hotfix v18.7.2 · 2026-09-05 */
(async()=>{
  if(typeof window.paused==='undefined')window.paused=false;
  if(typeof window.Pause!=='function')window.Pause=()=>document.getElementById('nexaLocalPauseBtn')?.click()||false;
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  const modules=[
    './nexa-hotfix-v1.js?v=20260905-v1872',
    './nexa-ui-v3.js?v=20260905-v1872',
    './nexa-radar-v4.js?v=20260905-v1872',
    './nexa-final-ui-v18.js?v=20260905-v1872',
    './nexa-layout-static-v18.6.5.js?v=20260905-v1872',
    './nexa-audit-autosave-v18.5.js?v=20260905-v1872',
    './nexa-record-draft-history-v18.6.6.js?v=20260905-v1872',
    './nexa-mobile-shell-v18.6.7.js?v=20260905-v1872',
    './nexa-mobile-safe-area-v18.6.8.js?v=20260905-v1872',
    './nexa-history-lifecycle-v18.6.9.js?v=20260905-v1872'
  ];
  for(const src of modules){try{await load(src)}catch(error){console.error('NEXA module load failed:',src,error)}}
})();

/* NEXA production loader · functional core + detached stage UI v18.6 · 2026-09-05 */
(async()=>{
  if(typeof window.paused==='undefined')window.paused=false;
  if(typeof window.Pause!=='function')window.Pause=()=>document.getElementById('nexaLocalPauseBtn')?.click()||false;
  const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  const modules=[
    './nexa-hotfix-v1.js?v=20260905-v186',
    './nexa-ui-v3.js?v=20260905-v186',
    './nexa-radar-v4.js?v=20260905-v186',
    './nexa-final-ui-v18.js?v=20260905-v186',
    './nexa-layout-flow-v18.6.js?v=20260905-v186',
    './nexa-audit-autosave-v18.5.js?v=20260905-v186'
  ];
  for(const src of modules){
    try{await load(src)}catch(error){console.error('NEXA module load failed:',src,error)}
  }
})();

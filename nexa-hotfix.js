/* NEXA hotfix loader · 2026-09-03 */
(()=>{
  const load=(src)=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  load('./nexa-hotfix-v1.js?v=20260903-legacy').catch(console.error).finally(()=>load('./nexa-ui-v3.js?v=20260903-1').catch(console.error));
})();

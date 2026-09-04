/* NEXA production loader · 2026-09-04 */
(()=>{
  const load=(src)=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  load('./nexa-hotfix-v1.js?v=20260903-legacy')
    .catch(console.error)
    .finally(()=>load('./nexa-ui-v3.js?v=20260903-1')
      .catch(console.error)
      .finally(()=>load('./nexa-radar-v4.js?v=20260903-1')
        .catch(console.error)
        .finally(()=>load('./nexa-role-mobile-v4.js?v=20260904-1')
          .catch(console.error)
          .finally(()=>load('./nexa-shell-v5.js?v=20260904-1').catch(console.error)))));
})();

/* NEXA v18.9.3 · medical layout state guard · 2026-09-06 */
(()=>{
'use strict';
if(window.__NEXA_MEDICAL_LAYOUT_STATE_V18_9_3__)return;
window.__NEXA_MEDICAL_LAYOUT_STATE_V18_9_3__=true;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function auditOpen(){return !!$('#nexaAuditExact.open,#axReview.open')}
function clinicalVisible(){const host=$('#nexaStageHost');if(!host)return false;const cs=getComputedStyle(host);return cs.display!=='none'&&cs.visibility!=='hidden'}
function medicalState(){return !auditOpen()&&clinicalVisible()}
function repair(){
  if(!medicalState())return;
  document.body.classList.add('nexa-v340','nexa-doctor-view');
  document.body.classList.remove('doctor-home-open');
  const host=$('#nexaStageHost');
  if(host){host.style.removeProperty('display');host.style.removeProperty('position');host.style.removeProperty('left');host.style.removeProperty('right');host.style.removeProperty('top');host.style.removeProperty('bottom');host.style.removeProperty('width');host.style.removeProperty('height');host.style.removeProperty('margin');host.style.removeProperty('transform')}
  $$('.nexa-stage-view').forEach(v=>{v.style.removeProperty('left');v.style.removeProperty('right');v.style.removeProperty('width');v.style.removeProperty('margin');v.style.removeProperty('transform')});
  window.dispatchEvent(new Event('resize'));
}
function returnMedicalHard(){
  $('#axReview')?.classList.remove('open');
  $('#nexaAuditExact')?.classList.remove('open');
  document.documentElement.style.overflow='';document.body.style.overflow='';
  document.body.classList.add('nexa-v340','nexa-doctor-view');document.body.classList.remove('doctor-home-open');
  const medical=$$('[data-mode="medical"],[data-work-mode="medical"],[data-mode="medico"],#n15Medico,#n9Medico,#nfDoctor').find(Boolean);
  try{medical?.click()}catch{}
  setTimeout(repair,0);setTimeout(repair,80);setTimeout(repair,220);
}
document.addEventListener('click',e=>{const el=e.target.closest('#axBackMedical192,#axBackMedicalTop192,[data-mode="medical"],[data-work-mode="medical"],[data-mode="medico"],#n15Medico,#n9Medico,#nfDoctor');if(!el)return;setTimeout(repair,0);setTimeout(repair,120)},true);
window.addEventListener('pageshow',()=>setTimeout(repair,80));
window.addEventListener('resize',()=>{if(!auditOpen())setTimeout(repair,0)},{passive:true});
[200,600,1200].forEach(ms=>setTimeout(repair,ms));
window.nexaReturnToMedicalModeStable=returnMedicalHard;
})();
/* NEXA auditor desktop-only guard v9 */
(()=>{
'use strict';
if(window.__NEXA_AUDITOR_MOBILE_GUARD_V9__) return;
window.__NEXA_AUDITOR_MOBILE_GUARD_V9__=true;
const $=id=>document.getElementById(id);
const mobile=()=>window.matchMedia('(max-width:820px)').matches;
function forceDoctorOnMobile(){
  if(!mobile()) return;
  if(!document.body.classList.contains('nexa-auditor-view')) return;
  const role=$('nexaRoleSwitchBtn');
  if(role){
    role.click();
  }else{
    document.body.classList.remove('nexa-auditor-view','n8-auditor-shell');
    document.body.classList.add('nexa-doctor-view','doctor-home-open');
  }
  try{localStorage.setItem('nexa-view','doctor')}catch{}
  requestAnimationFrame(()=>{try{window.scrollTo(0,0)}catch{}});
}
function addCss(){
  if($('nexaAuditorMobileGuardV9Style')) return;
  const s=document.createElement('style');
  s.id='nexaAuditorMobileGuardV9Style';
  s.textContent=`@media(max-width:820px){
    #n8AuditorEntry,[data-n8-role]{display:none!important}
    body.nexa-auditor-view .nexa-auditor-launch{margin:0!important;padding:16px!important;min-height:auto!important;transform:none!important}
    body.nexa-auditor-view .nexa-auditor-launch:before{display:none!important}
  }`;
  document.head.appendChild(s);
}
function init(){
  addCss();
  forceDoctorOnMobile();
  let last=document.body.classList.contains('nexa-auditor-view');
  new MutationObserver(()=>{
    const now=document.body.classList.contains('nexa-auditor-view');
    if(now!==last||now) forceDoctorOnMobile();
    last=now;
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',forceDoctorOnMobile);
  window.addEventListener('orientationchange',()=>setTimeout(forceDoctorOnMobile,120));
  window.addEventListener('pageshow',()=>setTimeout(forceDoctorOnMobile,0));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

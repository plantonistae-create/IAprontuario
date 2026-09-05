/* NEXA v18.7.1 · audit route + mobile header flow fix · 2026-09-05 */
(()=>{
'use strict';
if(window.__NEXA_AUDITOR_MOBILE_FIX_V18_7_1__)return;
window.__NEXA_AUDITOR_MOBILE_FIX_V18_7_1__=true;
const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
const mobile=()=>matchMedia('(max-width:900px)').matches;

function forceAuditorWorkspace(){
  const launch=$('nexaAuditorLaunch');
  if(!launch)return false;
  document.body.classList.add('nexa-auditor-view','nexa-auditor-mode','nexa-privileged');
  document.body.classList.remove('nexa-doctor-view','doctor-home-open');
  launch.style.setProperty('display','block','important');
  const modal=$('coreAdminModal');
  if(modal&&!document.body.classList.contains('na17-native-bridge-open')){
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
  }
  requestAnimationFrame(()=>{
    const app=$('na17App');
    if(app){
      app.style.setProperty('display','block','important');
      launch.classList.add('na17-mounted');
      try{window.scrollTo({top:0,left:0,behavior:'auto'})}catch{}
    }
  });
  return true;
}

function installCss(){
  if($('nexaV1871FixStyle'))return;
  const s=document.createElement('style');s.id='nexaV1871FixStyle';s.textContent=`
/* Audit workspace must replace the legacy audit pane visually. */
body.nexa-auditor-view #nexaAuditorLaunch,
body.nexa-auditor-mode #nexaAuditorLaunch{display:block!important;visibility:visible!important;opacity:1!important;max-width:none!important}
body.nexa-auditor-view #nexaAuditorLaunch.na17-mounted>#na17App,
body.nexa-auditor-mode #nexaAuditorLaunch.na17-mounted>#na17App{display:block!important;visibility:visible!important;opacity:1!important}
body.nexa-auditor-view #nexaAuditorLaunch.na17-mounted>#na17NativeBridge,
body.nexa-auditor-mode #nexaAuditorLaunch.na17-mounted>#na17NativeBridge{display:none!important}
body.nexa-auditor-view:not(.na17-native-bridge-open) #coreAdminModal,
body.nexa-auditor-mode:not(.na17-native-bridge-open) #coreAdminModal{display:none!important}

@media(max-width:900px){
  /* Header participates in document flow; nothing can scroll underneath it. */
  html.nexa-mobile-v1867 #nexaMobileHeader{
    position:sticky!important;
    top:0!important;
    left:auto!important;right:auto!important;
    width:100%!important;
    height:auto!important;
    min-height:calc(116px + env(safe-area-inset-top,0px))!important;
    z-index:18000!important;
    margin:0!important;
    box-sizing:border-box!important;
  }
  html.nexa-mobile-v1867 body{padding-top:0!important}
  html.nexa-mobile-v1867 body.nexa-v340 #mainApp>main,
  html.nexa-mobile-v1867 #mainApp>main{
    padding-top:12px!important;
    scroll-margin-top:12px!important;
  }
  html.nexa-mobile-v1867 #nexaStageHost,
  html.nexa-mobile-v1867 #nexaStageHost>.nexa-stage-view.active{
    scroll-margin-top:12px!important;
  }
  /* Auditor mobile gets its own safe top instead of the clinical fixed-header offset. */
  body.nexa-auditor-view #nexaAuditorLaunch,
  body.nexa-auditor-mode #nexaAuditorLaunch{
    margin:0!important;width:100%!important;min-height:100dvh!important;
    padding:0!important;position:relative!important;inset:auto!important;
  }
  body.nexa-auditor-view #na17App,
  body.nexa-auditor-mode #na17App{padding-top:0!important;margin-top:0!important}
  body.nexa-auditor-view #na17App .na17-wrap,
  body.nexa-auditor-mode #na17App .na17-wrap{padding-top:14px!important}
}
`;
  document.head.appendChild(s);
}

function placeMobileHeader(){
  if(!mobile())return;
  const h=$('nexaMobileHeader'),app=$('mainApp');
  if(!h||!app)return;
  if(h.nextElementSibling!==app){
    try{document.body.insertBefore(h,app)}catch{}
  }
  document.documentElement.style.setProperty('--nm-header-live','0px');
  document.documentElement.style.setProperty('--nm-header','0px');
}

function bindAuditRoute(){
  document.addEventListener('click',e=>{
    const trigger=e.target.closest?.('#navAuditBtn,#n14Audit,#n15Auditor,#n9AuditorDrawer,[data-quick="auditor"]');
    if(!trigger)return;
    if(document.body.classList.contains('na17-native-bridge-open'))return;
    if(trigger.id==='navAuditBtn'){
      e.preventDefault();e.stopImmediatePropagation();
    }
    setTimeout(forceAuditorWorkspace,0);
    setTimeout(forceAuditorWorkspace,120);
  },true);
}

function settle(){
  installCss();
  placeMobileHeader();
  if(document.body.classList.contains('nexa-auditor-view')||document.body.classList.contains('nexa-auditor-mode'))forceAuditorWorkspace();
}

installCss();bindAuditRoute();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',settle,{once:true});else settle();
[80,250,700,1500].forEach(ms=>setTimeout(settle,ms));
addEventListener('pageshow',settle);
addEventListener('resize',settle,{passive:true});
addEventListener('orientationchange',()=>setTimeout(settle,80),{passive:true});
new MutationObserver(()=>settle()).observe(document.body,{attributes:true,attributeFilter:['class']});
})();

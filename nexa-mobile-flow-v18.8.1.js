/* NEXA v18.8.1 · mobile document-flow geometry · 2026-09-05
   One mobile scroll context. The header participates in document flow instead of
   floating over the clinical content. No observers, polling or scroll resets. */
(()=>{
'use strict';
if(window.__NEXA_MOBILE_FLOW_V18_8_1__)return;
window.__NEXA_MOBILE_FLOW_V18_8_1__=true;
const $=id=>document.getElementById(id);
const mobile=()=>matchMedia('(max-width:900px)').matches;

function installStyle(){
 if($('nexaMobileFlowV1881Style'))return;
 const s=document.createElement('style');
 s.id='nexaMobileFlowV1881Style';
 s.textContent=`
@media(max-width:900px){
 :root{--nm1881-bottom:70px}
 html,body{overflow-x:hidden!important;scroll-padding-top:0!important}
 body{min-height:100dvh!important}
 #nexaMobileHeader{
   display:block!important;
   position:sticky!important;
   inset:auto!important;
   top:0!important;
   left:auto!important;
   right:auto!important;
   width:100%!important;
   height:auto!important;
   min-height:calc(116px + env(safe-area-inset-top,0px))!important;
   padding-top:env(safe-area-inset-top,0px)!important;
   margin:0!important;
   z-index:30000!important;
   box-sizing:border-box!important;
 }
 #mainApp{position:relative!important;inset:auto!important;overflow:visible!important;min-height:0!important}
 body.nexa-v340 #mainApp>main,#mainApp>main{
   position:relative!important;
   inset:auto!important;
   top:auto!important;
   left:auto!important;
   right:auto!important;
   width:100%!important;
   max-width:none!important;
   min-width:0!important;
   min-height:0!important;
   margin:0!important;
   padding:12px 12px calc(var(--nm1881-bottom) + env(safe-area-inset-bottom,0px) + 18px)!important;
   overflow:visible!important;
   transform:none!important;
   scroll-margin-top:0!important;
 }
 #nexaStageHost,#nexaStageHost>.nexa-stage-view,#nexaStageHost>.nexa-stage-view.active{
   position:relative!important;
   inset:auto!important;
   top:auto!important;
   left:auto!important;
   right:auto!important;
   bottom:auto!important;
   width:100%!important;
   max-width:none!important;
   height:auto!important;
   min-height:0!important;
   margin:0!important;
   padding-top:0!important;
   overflow:visible!important;
   transform:none!important;
   scroll-margin-top:0!important;
 }
 #nexaStageHost>.nexa-stage-view.active>:first-child{margin-top:0!important}
 #nexaMobileBottomNav{position:fixed!important;left:0!important;right:0!important;bottom:0!important;z-index:30000!important}
 #nexaAuditWorkspace{overscroll-behavior:contain}
}
`;
 document.head.appendChild(s);
}

function placeHeader(){
 if(!mobile())return;
 const header=$('nexaMobileHeader'),app=$('mainApp');
 if(!header||!app)return;
 if(header.nextElementSibling!==app) document.body.insertBefore(header,app);
 document.documentElement.classList.add('nexa-mobile-flow-v1881');
 window.__NEXA_V18_8_1_MOBILE_FLOW_DIAGNOSTIC__={
   headerInFlow:header.nextElementSibling===app,
   headerPosition:getComputedStyle(header).position,
   mainPaddingTop:getComputedStyle(app.querySelector(':scope > main')||app).paddingTop
 };
}

function boot(){installStyle();placeHeader()}
boot();
addEventListener('pageshow',boot,{once:false});
addEventListener('orientationchange',()=>setTimeout(placeHeader,60),{passive:true});
window.nexaRepairMobileFlow=placeHeader;
})();

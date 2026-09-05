/* NEXA v18.8 · mobile top safe-area hardening · 2026-09-05
   CSS-only geometry override. No observers, timers or scroll loops. */
(()=>{
'use strict';
if(window.__NEXA_MOBILE_TOP_SAFE_V18_8__)return;
window.__NEXA_MOBILE_TOP_SAFE_V18_8__=true;
const s=document.createElement('style');s.id='nexaMobileTopSafeV188';s.textContent=`
@media(max-width:900px){
 :root{--nm18-safe-top:env(safe-area-inset-top,0px);--nm18-header:128px;--nm18-bottom:74px}
 html,body{scroll-padding-top:calc(var(--nm18-header) + var(--nm18-safe-top) + 12px)!important;overflow-x:hidden!important}
 #nexaMobileHeader{position:fixed!important;top:0!important;left:0!important;right:0!important;height:calc(var(--nm18-header) + var(--nm18-safe-top))!important;min-height:calc(var(--nm18-header) + var(--nm18-safe-top))!important;padding-top:var(--nm18-safe-top)!important;box-sizing:border-box!important;z-index:30000!important}
 body.nexa-v340 #mainApp>main,#mainApp>main{position:relative!important;top:auto!important;left:auto!important;right:auto!important;margin:0!important;padding-top:calc(var(--nm18-header) + var(--nm18-safe-top) + 16px)!important;padding-bottom:calc(var(--nm18-bottom) + env(safe-area-inset-bottom,0px) + 18px)!important;min-height:100dvh!important;overflow:visible!important}
 #nexaStageHost,#nexaStageHost>.nexa-stage-view,#nexaStageHost>.nexa-stage-view.active{position:relative!important;top:auto!important;inset:auto!important;transform:none!important;overflow:visible!important;scroll-margin-top:calc(var(--nm18-header) + var(--nm18-safe-top) + 16px)!important}
 #nexaStageHost>.nexa-stage-view.active>:first-child{margin-top:0!important}
 #nexaMobileBottomNav{z-index:30000!important}
}
`;
document.head.appendChild(s);
})();

/* NEXA desktop/auth stability v10.3 · 2026-09-04 */
(()=>{
'use strict';
if(window.__NEXA_DESKTOP_STABILITY_V103__) return;
window.__NEXA_DESKTOP_STABILITY_V103__=true;
const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
function visible(el){if(!el)return false;const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0}
function syncAuth(){const login=$('loginGate');const loginOpen=visible(login);document.body.classList.toggle('n10-auth-login',loginOpen);document.body.classList.toggle('n10-app-ready',!loginOpen);if(loginOpen){try{window.scrollTo(0,0)}catch{};document.documentElement.classList.remove('n7-lock','n9-modal-lock')}}
function addCss(){
 $('nexaDesktopStabilityV10Style')?.remove();
 const s=document.createElement('style');s.id='nexaDesktopStabilityV10Style';s.textContent=`
body.n10-auth-login #nexaCleanUIv7,body.n10-auth-login #n7Sidebar,body.n10-auth-login #n7Top,body.n10-auth-login #n7MobileHeader,body.n10-auth-login #n7Bottom,body.n10-auth-login #n7Drawer,body.n10-auth-login #n7Overlay{display:none!important;visibility:hidden!important;pointer-events:none!important}
body.n10-auth-login #loginGate{position:fixed!important;inset:0!important;z-index:30000!important;display:flex!important;width:100vw!important;height:100dvh!important;min-height:100vh!important;margin:0!important;padding:24px!important;overflow:auto!important;background:var(--bg,#f5f8f7)!important}
body.n10-auth-login{overflow:hidden!important;background:var(--bg,#f5f8f7)!important}

@media(min-width:821px){
 html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready{--n7-side:176px;--n7-top:64px;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready #mainApp{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready #n7Sidebar{width:var(--n7-side)!important;max-width:var(--n7-side)!important;padding:16px 10px 12px!important;overflow:hidden!important}
 body.nexa-clean-v7.n10-app-ready .n7-logo{font-size:25px!important;margin:0 8px 18px!important}
 body.nexa-clean-v7.n10-app-ready .n7-nav{gap:3px!important}
 body.nexa-clean-v7.n10-app-ready .n7-nav button{height:42px!important;padding:0 12px!important;font-size:13px!important}
 body.nexa-clean-v7.n10-app-ready .n7-lockbox{font-size:11px!important;padding:8px 10px!important}

 body.nexa-clean-v7.n10-app-ready #n7Top{left:var(--n7-side)!important;right:0!important;width:auto!important;height:var(--n7-top)!important;padding:8px 10px!important;gap:8px!important;display:flex!important;align-items:center!important;overflow:hidden!important;white-space:nowrap!important}
 body.nexa-clean-v7.n10-app-ready #n7Top>.n7-grow{display:block!important;flex:1 1 20px!important;min-width:12px!important}
 body.nexa-clean-v7.n10-app-ready .n7-pill{height:42px!important;padding:0 10px!important;gap:7px!important;font-size:12px!important;flex:0 0 auto!important}
 body.nexa-clean-v7.n10-app-ready .n7-ring{width:25px!important;height:25px!important;border-width:3px!important;flex:0 0 25px!important}
 body.nexa-clean-v7.n10-app-ready .n7-metric{font-size:11px!important;flex:0 0 auto!important}
 body.nexa-clean-v7.n10-app-ready .n7-metric:before{width:9px!important;height:9px!important;margin-right:5px!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec{height:42px!important;min-width:250px!important;max-width:315px!important;padding:0 8px!important;gap:7px!important;display:flex!important;justify-content:center!important;overflow:hidden!important;flex:0 1 315px!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec>span{font-size:10px!important;flex:0 0 auto!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec strong{font-size:23px!important;line-height:1!important;flex:0 0 auto!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec button{font-size:10px!important;line-height:1!important;padding:7px 7px!important;flex:0 0 auto!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec .end{padding:8px 10px!important}
 body.nexa-clean-v7.n10-app-ready #n7Process,body.nexa-clean-v7.n10-app-ready #n7TopClear{height:40px!important;padding:0 9px!important;font-size:10px!important;line-height:1.05!important;white-space:normal!important;flex:0 0 auto!important;max-width:94px!important}
 body.nexa-clean-v7.n10-app-ready #n7Top>.n7-action[data-go="radar"]{height:40px!important;font-size:10px!important;padding:0 9px!important;flex:0 0 auto!important}

 body.nexa-clean-v7.n10-app-ready #mainApp>main{box-sizing:border-box!important;margin-left:var(--n7-side)!important;width:calc(100vw - var(--n7-side))!important;max-width:calc(100vw - var(--n7-side))!important;padding:calc(var(--n7-top) + 12px) 14px 28px!important;overflow-x:hidden!important;min-width:0!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-host{box-sizing:border-box!important;width:100%!important;max-width:1440px!important;min-width:0!important;margin:0 auto!important;padding:0!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready .panel-right,body.nexa-clean-v7.n10-app-ready .nexa-stage-view{box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding-left:0!important;padding-right:0!important;transform:none!important;overflow-x:hidden!important}

 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"].active{display:grid!important;grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr)!important;gap:14px!important;align-items:start!important;width:100%!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>#realtimeRadarCard,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>.card.rec-zone,body.nexa-clean-v7.n10-app-ready #nexaRadarAlertsDock,body.nexa-clean-v7.n10-app-ready #nexaDispositionCard{min-width:0!important;max-width:none!important;width:100%!important;box-sizing:border-box!important;margin-left:0!important;margin-right:0!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>#realtimeRadarCard{grid-column:1!important;grid-row:1 / span 5!important;justify-self:stretch!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>.card.rec-zone{grid-column:2!important;grid-row:1!important;justify-self:stretch!important}
 body.nexa-clean-v7.n10-app-ready #realtimeRadarCard>*,body.nexa-clean-v7.n10-app-ready .card.rec-zone>*{max-width:none!important;width:100%!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important}
 body.nexa-clean-v7.n10-app-ready #realtimeRadarCard .card,body.nexa-clean-v7.n10-app-ready .card.rec-zone .card{max-width:none!important;width:100%!important;margin-left:0!important;margin-right:0!important}
 body.nexa-clean-v7.n10-app-ready canvas,body.nexa-clean-v7.n10-app-ready svg,body.nexa-clean-v7.n10-app-ready img{max-width:100%!important}

 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="summary"].active,
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="hypothesis"].active,
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="plan"].active,
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="history"].active{display:block!important;width:min(100%,1160px)!important;max-width:1160px!important;margin:0 auto!important;overflow:visible!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="summary"].active>*,
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="hypothesis"].active>*,
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="plan"].active>*,
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="history"].active>*{box-sizing:border-box!important;margin-left:auto!important;margin-right:auto!important}
}

@media(min-width:821px) and (max-width:1250px){
 body.nexa-clean-v7.n10-app-ready{--n7-side:156px;--n7-top:60px}
 body.nexa-clean-v7.n10-app-ready #n7Sidebar{padding:13px 8px 10px!important}
 body.nexa-clean-v7.n10-app-ready .n7-logo{font-size:22px!important;margin-bottom:12px!important}
 body.nexa-clean-v7.n10-app-ready .n7-nav button{height:38px!important;font-size:11px!important;padding:0 10px!important}
 body.nexa-clean-v7.n10-app-ready #n7Top{gap:5px!important;padding:6px!important}
 body.nexa-clean-v7.n10-app-ready #n7Top>.n7-action[data-go="radar"]{display:none!important}
 body.nexa-clean-v7.n10-app-ready .n7-pill{height:38px!important;font-size:10px!important;padding:0 7px!important}
 body.nexa-clean-v7.n10-app-ready .n7-ring{width:21px!important;height:21px!important;flex-basis:21px!important}
 body.nexa-clean-v7.n10-app-ready .n7-metric{font-size:9px!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec{height:38px!important;min-width:225px!important;max-width:270px!important;flex-basis:270px!important;gap:5px!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec>span{display:none!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec strong{font-size:20px!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec button{font-size:9px!important;padding:6px!important}
 body.nexa-clean-v7.n10-app-ready #n7Process,body.nexa-clean-v7.n10-app-ready #n7TopClear{font-size:9px!important;padding:0 6px!important;max-width:82px!important}
 body.nexa-clean-v7.n10-app-ready #mainApp>main{padding-left:10px!important;padding-right:10px!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"].active{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:10px!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="summary"].active,
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="hypothesis"].active,
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="plan"].active,
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="history"].active{width:100%!important;max-width:100%!important}
}
`;
 document.head.appendChild(s)
}
function clampViewport(){if(!document.body.classList.contains('n10-app-ready')||innerWidth<821)return;[document.documentElement,document.body,$('mainApp'),q('#mainApp>main'),q('.nexa-stage-host')].filter(Boolean).forEach(el=>{try{el.style.setProperty('overflow-x','hidden','important')}catch{}});try{if(window.scrollX)window.scrollTo(0,window.scrollY)}catch{}}
function init(){addCss();syncAuth();clampViewport();const mo=new MutationObserver(()=>{syncAuth();clampViewport()});mo.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','style','hidden']});window.addEventListener('resize',()=>{syncAuth();clampViewport()});window.addEventListener('pageshow',()=>setTimeout(()=>{syncAuth();clampViewport()},0));setTimeout(()=>{syncAuth();clampViewport()},250);setTimeout(()=>{syncAuth();clampViewport()},1000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
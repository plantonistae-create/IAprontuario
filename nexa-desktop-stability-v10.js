/* NEXA desktop/auth stability v10.1 · 2026-09-04 */
(()=>{
'use strict';
if(window.__NEXA_DESKTOP_STABILITY_V101__) return;
window.__NEXA_DESKTOP_STABILITY_V101__=true;
const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
function visible(el){if(!el)return false;const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0}
function syncAuth(){
  const login=$('loginGate');
  const loginOpen=visible(login);
  document.body.classList.toggle('n10-auth-login',loginOpen);
  document.body.classList.toggle('n10-app-ready',!loginOpen);
  if(loginOpen){
    try{window.scrollTo(0,0)}catch{}
    document.documentElement.classList.remove('n7-lock','n9-modal-lock');
  }
}
function addCss(){
  $('nexaDesktopStabilityV10Style')?.remove();
  const s=document.createElement('style');s.id='nexaDesktopStabilityV10Style';s.textContent=`
/* AUTH: shell must never be visible behind login. */
body.n10-auth-login #nexaCleanUIv7,body.n10-auth-login #n7Sidebar,body.n10-auth-login #n7Top,body.n10-auth-login #n7MobileHeader,body.n10-auth-login #n7Bottom,body.n10-auth-login #n7Drawer,body.n10-auth-login #n7Overlay{display:none!important;visibility:hidden!important;pointer-events:none!important}
body.n10-auth-login #loginGate{position:fixed!important;inset:0!important;z-index:30000!important;display:flex!important;width:100vw!important;height:100dvh!important;min-height:100vh!important;margin:0!important;padding:24px!important;overflow:auto!important;background:var(--bg,#f5f8f7)!important}
body.n10-auth-login{overflow:hidden!important;background:var(--bg,#f5f8f7)!important}

@media(min-width:821px){
 html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready{--n7-side:168px;--n7-top:62px;width:100%!important;max-width:100%!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready #nexaCleanUIv7,body.nexa-clean-v7.n10-app-ready #mainApp{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready #n7Sidebar{width:var(--n7-side)!important;max-width:var(--n7-side)!important;padding:14px 8px 10px!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready .n7-logo{font-size:24px!important;margin:0 8px 14px!important}
 body.nexa-clean-v7.n10-app-ready .n7-nav{gap:2px!important}
 body.nexa-clean-v7.n10-app-ready .n7-nav button{height:40px!important;padding:0 11px!important;font-size:12px!important;min-width:0!important;max-width:100%!important}
 body.nexa-clean-v7.n10-app-ready .n7-lockbox{font-size:11px!important;padding:7px 10px!important}

 /* Topbar is deliberately constrained: no item is allowed to enlarge the page. */
 body.nexa-clean-v7.n10-app-ready #n7Top{left:var(--n7-side)!important;right:0!important;width:auto!important;max-width:none!important;height:var(--n7-top)!important;padding:7px 8px!important;gap:6px!important;display:grid!important;grid-template-columns:auto auto auto minmax(210px,1fr) auto auto!important;align-items:center!important;overflow:hidden!important;white-space:nowrap!important}
 body.nexa-clean-v7.n10-app-ready #n7Top>*{min-width:0!important;max-width:100%!important;margin:0!important}
 body.nexa-clean-v7.n10-app-ready #n7Top>.n7-grow{display:none!important}
 body.nexa-clean-v7.n10-app-ready #n7Top>.n7-action[data-go="radar"]{display:none!important}
 body.nexa-clean-v7.n10-app-ready .n7-pill{height:40px!important;padding:0 8px!important;gap:6px!important;font-size:11px!important;width:auto!important}
 body.nexa-clean-v7.n10-app-ready .n7-ring{width:23px!important;height:23px!important;border-width:3px!important;flex:0 0 23px!important}
 body.nexa-clean-v7.n10-app-ready .n7-metric{font-size:10px!important;overflow:hidden!important;text-overflow:ellipsis!important}
 body.nexa-clean-v7.n10-app-ready .n7-metric:before{width:8px!important;height:8px!important;margin-right:4px!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec{height:40px!important;min-width:0!important;width:100%!important;max-width:100%!important;padding:0 6px!important;gap:5px!important;display:flex!important;justify-content:flex-end!important;overflow:hidden!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec>span{font-size:9px!important;overflow:hidden!important;text-overflow:ellipsis!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec strong{font-size:19px!important;line-height:1!important;flex:0 0 auto!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec button{font-size:9px!important;line-height:1!important;padding:7px 6px!important;flex:0 0 auto!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec .end{padding:8px 8px!important}
 body.nexa-clean-v7.n10-app-ready #n7Process,body.nexa-clean-v7.n10-app-ready #n7TopClear{height:38px!important;padding:0 7px!important;font-size:9px!important;line-height:1.05!important;white-space:normal!important;min-width:58px!important;max-width:92px!important;overflow:hidden!important}

 /* Main area can never create a horizontal scrollbar. */
 body.nexa-clean-v7.n10-app-ready #mainApp>main{box-sizing:border-box!important;margin-left:var(--n7-side)!important;width:calc(100vw - var(--n7-side))!important;max-width:calc(100vw - var(--n7-side))!important;padding:calc(var(--n7-top) + 10px) 10px 26px!important;overflow-x:hidden!important;min-width:0!important}
 body.nexa-clean-v7.n10-app-ready #mainApp>main *,body.nexa-clean-v7.n10-app-ready .nexa-stage-host *,body.nexa-clean-v7.n10-app-ready .nexa-stage-view *{box-sizing:border-box!important;min-width:0!important;max-width:100%!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-host,body.nexa-clean-v7.n10-app-ready .panel-right,body.nexa-clean-v7.n10-app-ready .nexa-stage-view{width:100%!important;max-width:100%!important;min-width:0!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"].active{display:grid!important;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr)!important;gap:10px!important;width:100%!important;max-width:100%!important;overflow:hidden!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>#realtimeRadarCard,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>.card.rec-zone,body.nexa-clean-v7.n10-app-ready #nexaRadarAlertsDock,body.nexa-clean-v7.n10-app-ready #nexaDispositionCard{width:100%!important;min-width:0!important;max-width:100%!important;overflow:hidden!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>.card.rec-zone{grid-column:2!important;grid-row:1!important}
 body.nexa-clean-v7.n10-app-ready #realtimeRadarCard{grid-column:1!important}
 body.nexa-clean-v7.n10-app-ready canvas,body.nexa-clean-v7.n10-app-ready svg,body.nexa-clean-v7.n10-app-ready img,body.nexa-clean-v7.n10-app-ready textarea,body.nexa-clean-v7.n10-app-ready input,body.nexa-clean-v7.n10-app-ready select{max-width:100%!important}
}

/* Typical 1024/1366 clinic PCs: compact even further. */
@media(min-width:821px) and (max-width:1180px){
 body.nexa-clean-v7.n10-app-ready{--n7-side:146px;--n7-top:58px}
 body.nexa-clean-v7.n10-app-ready #n7Top{grid-template-columns:96px 76px 68px minmax(170px,1fr) 76px 68px!important;gap:4px!important;padding:5px!important}
 body.nexa-clean-v7.n10-app-ready .n7-pill{font-size:9px!important;padding:0 5px!important}.n7-ring{width:19px!important;height:19px!important;flex-basis:19px!important}
 body.nexa-clean-v7.n10-app-ready .n7-metric{font-size:9px!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec>span{display:none!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec strong{font-size:18px!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec button{font-size:8px!important;padding:6px 4px!important}
 body.nexa-clean-v7.n10-app-ready #n7Process,body.nexa-clean-v7.n10-app-ready #n7TopClear{font-size:8px!important;padding:0 4px!important;min-width:0!important;width:100%!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"].active{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}
}
`;
  document.head.appendChild(s);
}
function hardClamp(){
  if(!document.body.classList.contains('n10-app-ready')||innerWidth<821)return;
  const nodes=[document.documentElement,document.body,$('mainApp'),q('#mainApp>main'),q('.nexa-stage-host'),q('.nexa-stage-view.active')].filter(Boolean);
  nodes.forEach(el=>{try{el.style.setProperty('max-width',el===document.documentElement||el===document.body?'100%':'100%','important');el.style.setProperty('overflow-x','hidden','important')}catch{}});
  try{window.scrollTo({left:0,top:window.scrollY,behavior:'auto'})}catch{}
}
function init(){addCss();syncAuth();hardClamp();const mo=new MutationObserver(()=>{syncAuth();hardClamp()});mo.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','style','hidden']});window.addEventListener('resize',()=>{syncAuth();hardClamp()});window.addEventListener('pageshow',()=>setTimeout(()=>{syncAuth();hardClamp()},0));setTimeout(()=>{syncAuth();hardClamp()},250);setTimeout(()=>{syncAuth();hardClamp()},1000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

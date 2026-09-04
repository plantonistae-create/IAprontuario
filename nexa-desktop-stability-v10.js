/* NEXA desktop/auth stability v10.5 · 2026-09-04 */
(()=>{
'use strict';
if(window.__NEXA_DESKTOP_STABILITY_V105__) return;
window.__NEXA_DESKTOP_STABILITY_V105__=true;
const $=id=>document.getElementById(id),q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
function visible(el){if(!el)return false;const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0}
function syncAuth(){const login=$('loginGate');const open=visible(login);document.body.classList.toggle('n10-auth-login',open);document.body.classList.toggle('n10-app-ready',!open)}
function normalizeRadarDom(){if(innerWidth<821)return;const stage=q('.nexa-stage-view[data-stage="radar"]');if(!stage)return;const nodes=[$('realtimeRadarCard'),$('nexaDispositionCard'),stage.querySelector('.card.rec-zone')||q('.card.rec-zone'),$('nexaRadarAlertsDock')].filter(Boolean);nodes.forEach(el=>{if(el.parentElement!==stage)stage.appendChild(el)})}
function hideDesktopTheme(){if(innerWidth<821)return;const side=$('n7Sidebar');if(!side)return;qa('button').forEach(b=>{if(!side.contains(b))return;const t=(b.textContent||'').trim().toLowerCase();if(t==='escuro'||t==='claro'||t.includes(' escuro')||t.includes(' claro'))b.style.setProperty('display','none','important')})}
function addCss(){
 $('nexaDesktopStabilityV10Style')?.remove();
 const s=document.createElement('style');s.id='nexaDesktopStabilityV10Style';s.textContent=`
body.n10-auth-login #nexaCleanUIv7,body.n10-auth-login #n7Sidebar,body.n10-auth-login #n7Top,body.n10-auth-login #n7MobileHeader,body.n10-auth-login #n7Bottom,body.n10-auth-login #n7Drawer,body.n10-auth-login #n7Overlay{display:none!important}
body.n10-auth-login #loginGate{position:fixed!important;inset:0!important;z-index:30000!important;display:flex!important;width:100vw!important;height:100dvh!important;margin:0!important;padding:24px!important;overflow:auto!important}
@media(min-width:821px){
 html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready{--n7-side:156px;--n7-top:60px;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready .nexa-desktop-sidebar,body.nexa-clean-v7.n10-app-ready .nexa-desktop-header{display:none!important}
 body.nexa-clean-v7.n10-app-ready #n7Sidebar{width:var(--n7-side)!important;max-width:var(--n7-side)!important;padding:12px 8px 10px!important;overflow-y:auto!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready .n7-logo{font-size:22px!important;margin:0 8px 12px!important}.n7-nav{gap:2px!important}.n7-nav button{height:38px!important;padding:0 10px!important;font-size:11px!important}
 body.nexa-clean-v7.n10-app-ready #n7Top{left:var(--n7-side)!important;right:0!important;height:var(--n7-top)!important;padding:6px 8px!important;gap:6px!important;display:flex!important;align-items:center!important;overflow:hidden!important}
 body.nexa-clean-v7.n10-app-ready #n7Top>.n7-grow{display:block!important;flex:1 1 auto!important;min-width:6px!important}
 body.nexa-clean-v7.n10-app-ready .n7-pill{height:38px!important;padding:0 8px!important;font-size:10px!important}.n7-ring{width:21px!important;height:21px!important;flex:0 0 21px!important}
 body.nexa-clean-v7.n10-app-ready .n7-metric{font-size:9px!important;flex:0 0 auto!important}
 body.nexa-clean-v7.n10-app-ready .n7-rec{height:38px!important;min-width:220px!important;max-width:280px!important;flex:0 1 280px!important;gap:5px!important;padding:0 6px!important;justify-content:center!important}.n7-rec>span{display:none!important}.n7-rec strong{font-size:20px!important}.n7-rec button{font-size:9px!important;padding:6px!important}
 body.nexa-clean-v7.n10-app-ready #n7Process,body.nexa-clean-v7.n10-app-ready #n7TopClear{height:36px!important;font-size:9px!important;padding:0 6px!important;max-width:86px!important}
 body.nexa-clean-v7.n10-app-ready #n7Top>.n7-action[data-go="radar"]{display:none!important}
 body.nexa-clean-v7.n10-app-ready #mainApp{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready #mainApp>main{box-sizing:border-box!important;margin-left:var(--n7-side)!important;width:calc(100vw - var(--n7-side))!important;max-width:calc(100vw - var(--n7-side))!important;padding:calc(var(--n7-top) + 8px) 8px 24px!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-host,body.nexa-clean-v7.n10-app-ready .panel-right,body.nexa-clean-v7.n10-app-ready .nexa-stage-view{position:relative!important;left:0!important;right:auto!important;float:none!important;box-sizing:border-box!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important;transform:none!important;overflow-x:hidden!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"].active{display:grid!important;grid-template-columns:minmax(0,1.04fr) minmax(0,.96fr)!important;grid-template-areas:"radar recording" "disposition alerts"!important;gap:10px!important;align-items:start!important;width:100%!important;max-width:none!important}
 body.nexa-clean-v7.n10-app-ready #realtimeRadarCard{grid-area:radar!important;display:block!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:12px!important;left:0!important;transform:none!important}
 body.nexa-clean-v7.n10-app-ready #realtimeRadarCard>*{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important;transform:none!important}
 body.nexa-clean-v7.n10-app-ready #realtimeRadarCard>div,body.nexa-clean-v7.n10-app-ready #realtimeRadarCard>section{display:block!important;width:100%!important;max-width:none!important}
 body.nexa-clean-v7.n10-app-ready #nexaDispositionCard{grid-area:disposition!important;width:100%!important;max-width:none!important;margin:0!important;left:0!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>.card.rec-zone{grid-area:recording!important;position:relative!important;top:auto!important;left:0!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:14px!important;transform:none!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>.card.rec-zone>*{max-width:none!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important}
 body.nexa-clean-v7.n10-app-ready #nexaRadarAlertsDock{grid-area:alerts!important;width:100%!important;max-width:none!important;margin:0!important;left:0!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="summary"].active,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="hypothesis"].active,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="plan"].active,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="history"].active{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
 body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="summary"].active>*,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="hypothesis"].active>*,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="plan"].active>*,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="history"].active>*{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important}
}
@media(min-width:1260px){body.nexa-clean-v7.n10-app-ready{--n7-side:178px;--n7-top:64px}body.nexa-clean-v7.n10-app-ready #mainApp>main{padding:calc(var(--n7-top) + 10px) 12px 28px!important}body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"].active{gap:12px!important}}
`;
 document.head.appendChild(s)
}
function stabilize(){syncAuth();if(innerWidth<821)return;normalizeRadarDom();hideDesktopTheme();[document.documentElement,document.body,$('mainApp'),q('#mainApp>main'),q('.nexa-stage-host')].filter(Boolean).forEach(el=>el.style.setProperty('overflow-x','hidden','important'));try{if(scrollX)scrollTo(0,scrollY)}catch{}}
function init(){addCss();stabilize();new MutationObserver(stabilize).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden']});addEventListener('resize',stabilize);addEventListener('pageshow',()=>setTimeout(stabilize,0));setTimeout(stabilize,250);setTimeout(stabilize,900)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
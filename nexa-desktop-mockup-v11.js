/* NEXA desktop mockup parity v11 · approved desktop composition */
(()=>{
'use strict';
if(window.__NEXA_DESKTOP_MOCKUP_V11__)return;window.__NEXA_DESKTOP_MOCKUP_V11__=true;
const $=id=>document.getElementById(id),q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
function move(){if(innerWidth<821)return;const stage=q('.nexa-stage-view[data-stage="radar"]');if(!stage)return;const radar=$('realtimeRadarCard'),rec=stage.querySelector('.card.rec-zone')||q('.card.rec-zone'),disp=$('nexaDispositionCard'),alerts=$('nexaRadarAlertsDock');[radar,rec,disp,alerts].filter(Boolean).forEach(x=>{if(x.parentElement!==stage)stage.appendChild(x)});}
function css(){if($('nexaDesktopMockupV11Style'))return;const s=document.createElement('style');s.id='nexaDesktopMockupV11Style';s.textContent=`
@media(min-width:821px){
html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
body.nexa-clean-v7.n10-app-ready{--n7-side:174px!important;--n7-top:58px!important;background:#f7f9fb!important}
body.nexa-clean-v7.n10-app-ready #n7Sidebar{width:174px!important;padding:12px 10px!important}
body.nexa-clean-v7.n10-app-ready .n7-logo{font-size:25px!important;margin:0 8px 12px!important}
body.nexa-clean-v7.n10-app-ready .n7-nav{gap:1px!important}body.nexa-clean-v7.n10-app-ready .n7-nav button{height:36px!important;padding:0 11px!important;font-size:11px!important}
body.nexa-clean-v7.n10-app-ready #n7Top{left:174px!important;right:0!important;height:58px!important;padding:6px 10px!important;gap:8px!important;overflow:hidden!important}
body.nexa-clean-v7.n10-app-ready #n7Top>.n7-grow{flex:1 1 auto!important;min-width:8px!important}
body.nexa-clean-v7.n10-app-ready .n7-pill{height:38px!important;padding:0 9px!important;font-size:10px!important}.n7-ring{width:22px!important;height:22px!important;flex:0 0 22px!important}
body.nexa-clean-v7.n10-app-ready .n7-metric{font-size:10px!important}.n7-rec{height:38px!important;min-width:245px!important;max-width:310px!important;flex:0 1 310px!important}.n7-rec strong{font-size:21px!important}.n7-rec button{font-size:9px!important;padding:6px 9px!important}
body.nexa-clean-v7.n10-app-ready #n7Process,body.nexa-clean-v7.n10-app-ready #n7TopClear{height:36px!important;max-width:100px!important;padding:0 9px!important;font-size:9px!important}
body.nexa-clean-v7.n10-app-ready #mainApp>main{box-sizing:border-box!important;margin-left:174px!important;width:calc(100vw - 174px)!important;max-width:calc(100vw - 174px)!important;padding:68px 12px 22px!important;overflow-x:hidden!important}
body.nexa-clean-v7.n10-app-ready .nexa-stage-host,body.nexa-clean-v7.n10-app-ready .panel-right,body.nexa-clean-v7.n10-app-ready .nexa-stage-view{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;left:0!important;transform:none!important;box-sizing:border-box!important}
body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"].active{display:grid!important;grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr)!important;grid-template-areas:'radar recording' 'radar alerts'!important;gap:10px!important;align-items:start!important;width:100%!important}
body.nexa-clean-v7.n10-app-ready #realtimeRadarCard{grid-area:radar!important;width:100%!important;min-width:0!important;max-width:none!important;margin:0!important;padding:14px!important;border-radius:10px!important}
body.nexa-clean-v7.n10-app-ready #realtimeRadarCard>*{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important;transform:none!important}
body.nexa-clean-v7.n10-app-ready #nexaDispositionCard{display:block!important;width:100%!important;max-width:none!important;margin:10px 0 0!important;box-sizing:border-box!important}
body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>.card.rec-zone{grid-area:recording!important;position:relative!important;top:auto!important;width:100%!important;min-width:0!important;max-width:none!important;margin:0!important;padding:16px!important;box-sizing:border-box!important;border-radius:10px!important}
body.nexa-clean-v7.n10-app-ready #nexaRadarAlertsDock{grid-area:alerts!important;width:100%!important;max-width:none!important;margin:0!important;padding:14px!important;box-sizing:border-box!important;border-radius:10px!important}
body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="summary"].active,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="hypothesis"].active,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="plan"].active,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="history"].active{display:block!important;width:100%!important;max-width:none!important}
body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="summary"].active>*,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="hypothesis"].active>*,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="plan"].active>*,body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="history"].active>*{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important;box-sizing:border-box!important}
body.nexa-clean-v7.n10-app-ready #n7Sidebar button{white-space:nowrap!important}
}
@media(min-width:1180px){body.nexa-clean-v7.n10-app-ready{--n7-side:188px!important}body.nexa-clean-v7.n10-app-ready #n7Sidebar{width:188px!important}body.nexa-clean-v7.n10-app-ready #n7Top{left:188px!important}body.nexa-clean-v7.n10-app-ready #mainApp>main{margin-left:188px!important;width:calc(100vw - 188px)!important;max-width:calc(100vw - 188px)!important}}
`;document.head.appendChild(s)}
function clean(){if(innerWidth<821)return;qa('#n7Sidebar button').forEach(b=>{const t=(b.textContent||'').trim().toLowerCase();if(t==='escuro'||t==='claro')b.style.setProperty('display','none','important')});try{if(scrollX)scrollTo(0,scrollY)}catch{}}
function run(){css();move();clean()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();new MutationObserver(()=>{if(innerWidth>=821){move();clean()}}).observe(document.documentElement,{subtree:true,childList:true});addEventListener('resize',run);setTimeout(run,600);setTimeout(run,1600);
})();
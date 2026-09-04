/* NEXA desktop layout v12 · clipping fix · 2026-09-04 */
(()=>{
'use strict';
if(window.__NEXA_DESKTOP_LAYOUT_V12__) return;
window.__NEXA_DESKTOP_LAYOUT_V12__=true;
const $=id=>document.getElementById(id),q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
function addCss(){
  if($('nexaDesktopLayoutV12Style')) return;
  const s=document.createElement('style');
  s.id='nexaDesktopLayoutV12Style';
  s.textContent=`
@media(min-width:821px){
  html,body{max-width:100%!important;overflow-x:auto!important}
  body.nexa-clean-v7.n10-app-ready #mainApp,
  body.nexa-clean-v7.n10-app-ready #mainApp>main,
  body.nexa-clean-v7.n10-app-ready .nexa-stage-host,
  body.nexa-clean-v7.n10-app-ready .panel-right,
  body.nexa-clean-v7.n10-app-ready .nexa-stage-view{
    box-sizing:border-box!important;
    min-width:0!important;
    overflow:visible!important;
  }
  body.nexa-clean-v7.n10-app-ready #mainApp>main{
    width:calc(100vw - var(--n7-side))!important;
    max-width:calc(100vw - var(--n7-side))!important;
  }
  body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"].active{
    display:grid!important;
    grid-template-columns:minmax(0,1.18fr) minmax(360px,.82fr)!important;
    grid-template-areas:"radar recording" "radar alerts"!important;
    gap:12px!important;
    align-items:start!important;
    overflow:visible!important;
    width:100%!important;
    max-width:100%!important;
  }
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard{
    grid-area:radar!important;
    min-width:0!important;
    width:100%!important;
    max-width:100%!important;
    overflow:visible!important;
    box-sizing:border-box!important;
  }
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard *,
  body.nexa-clean-v7.n10-app-ready #nexaDispositionCard *,
  body.nexa-clean-v7.n10-app-ready #nexaRadarAlertsDock *{
    box-sizing:border-box!important;
    min-width:0!important;
    max-width:100%;
  }
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard p,
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard li,
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard span,
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard div,
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard button{
    overflow-wrap:anywhere!important;
    word-break:normal!important;
    white-space:normal!important;
  }
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard table{
    width:100%!important;
    max-width:100%!important;
    table-layout:fixed!important;
  }
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard pre,
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard code{
    white-space:pre-wrap!important;
    overflow-wrap:anywhere!important;
  }
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard img,
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard svg,
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard canvas{
    max-width:100%!important;
    height:auto!important;
  }
  body.nexa-clean-v7.n10-app-ready #nexaDispositionCard{
    display:block!important;
    position:relative!important;
    width:100%!important;
    max-width:100%!important;
    margin:12px 0 0!important;
    overflow:visible!important;
  }
  body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>.card.rec-zone{
    grid-area:recording!important;
    min-width:0!important;
    width:100%!important;
    max-width:100%!important;
    overflow:visible!important;
  }
  body.nexa-clean-v7.n10-app-ready #nexaRadarAlertsDock{
    grid-area:alerts!important;
    min-width:0!important;
    width:100%!important;
    max-width:100%!important;
    overflow:visible!important;
  }
}
@media(min-width:821px) and (max-width:1099px){
  body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"].active{
    grid-template-columns:minmax(0,1fr)!important;
    grid-template-areas:"recording" "radar" "alerts"!important;
  }
  body.nexa-clean-v7.n10-app-ready #realtimeRadarCard,
  body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"]>.card.rec-zone,
  body.nexa-clean-v7.n10-app-ready #nexaRadarAlertsDock{
    width:100%!important;
    max-width:100%!important;
  }
}
@media(min-width:1100px) and (max-width:1365px){
  body.nexa-clean-v7.n10-app-ready .nexa-stage-view[data-stage="radar"].active{
    grid-template-columns:minmax(0,1.1fr) minmax(330px,.9fr)!important;
  }
}
`;
  document.head.appendChild(s);
}
function normalize(){
  if(innerWidth<821)return;
  const stage=q('.nexa-stage-view[data-stage="radar"]');
  if(!stage)return;
  const radar=$('realtimeRadarCard'),rec=stage.querySelector('.card.rec-zone')||q('.card.rec-zone'),alerts=$('nexaRadarAlertsDock');
  [radar,rec,alerts].filter(Boolean).forEach(el=>{if(el.parentElement!==stage)stage.appendChild(el)});
  const disp=$('nexaDispositionCard');
  if(disp&&radar&&disp.parentElement!==radar) radar.appendChild(disp);
  [stage,radar,rec,alerts].filter(Boolean).forEach(el=>{
    el.style.setProperty('min-width','0','important');
    el.style.setProperty('overflow','visible','important');
  });
}
function run(){addCss();normalize()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
new MutationObserver(()=>{if(innerWidth>=821)normalize()}).observe(document.documentElement,{subtree:true,childList:true});
addEventListener('resize',run);
setTimeout(run,300);setTimeout(run,1000);setTimeout(run,2200);
})();
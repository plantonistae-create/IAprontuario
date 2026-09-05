/* NEXA v18.6.3 · stable desktop layout · 2026-09-05
   Single static geometry contract for every clinical stage.
   No measured counter-shifts, no style-observer loop, no stage reparenting. */
(()=>{
'use strict';
if(window.__NEXA_LAYOUT_STATIC_V18_6_3__)return;
window.__NEXA_LAYOUT_STATIC_V18_6_3__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);

function installStyle(){
  if($('nf1863StaticLayoutStyle'))return;
  const s=document.createElement('style');
  s.id='nf1863StaticLayoutStyle';
  s.textContent=`
@media(min-width:821px){
  html body.nexa-v340 #mainApp>main{
    display:block!important;
    position:relative!important;
    width:calc(100vw - var(--nf-side,214px))!important;
    min-width:0!important;
    max-width:none!important;
    margin:0 0 0 var(--nf-side,214px)!important;
    padding:calc(var(--nf-top,72px) + 16px) 16px 20px!important;
    box-sizing:border-box!important;
    overflow:visible!important;
    background:var(--nf-bg)!important;
    grid-template-columns:minmax(0,1fr)!important;
    grid-template-rows:auto!important;
    gap:0!important;
  }

  html body.nexa-v340 #mainApp>main>.panel-left,
  html body.nexa-v340 #mainApp>main>.panel-right{
    display:none!important;
    width:0!important;
    min-width:0!important;
    max-width:0!important;
    height:0!important;
    min-height:0!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    overflow:hidden!important;
    visibility:hidden!important;
    pointer-events:none!important;
  }

  html body.nexa-v340 #mainApp>main>#nexaStageHost,
  html body.nexa-v340 #mainApp>main>.nexa-stage-host{
    display:block!important;
    position:relative!important;
    inset:auto!important;
    left:auto!important;
    right:auto!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    margin:0!important;
    padding:0!important;
    transform:none!important;
    translate:none!important;
    box-sizing:border-box!important;
    overflow:visible!important;
    grid-column:1/-1!important;
  }

  html body.nexa-v340 #nexaStageHost>.nexa-stage-view{
    position:relative!important;
    inset:auto!important;
    left:auto!important;
    right:auto!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    margin:0!important;
    padding:0!important;
    transform:none!important;
    translate:none!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }

  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[hidden]{display:none!important}

  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="radar"].active{
    display:grid!important;
    grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr)!important;
    grid-template-areas:
      "record record"
      "radar summary"
      "radar alerts"!important;
    gap:14px!important;
    align-items:start!important;
  }

  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="summary"].active,
  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="hypothesis"].active,
  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="plan"].active,
  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="history"].active{
    display:block!important;
    width:100%!important;
    max-width:none!important;
    margin:0!important;
  }

  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="summary"].active>*,
  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="hypothesis"].active>*,
  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="plan"].active>*,
  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="history"].active>*{
    width:100%!important;
    max-width:none!important;
    margin-left:0!important;
    margin-right:0!important;
    box-sizing:border-box!important;
  }

  html body.nexa-v340 #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone{grid-area:record!important}
  html body.nexa-v340 #nexaStageHost .nexa-stage-view[data-stage="radar"]>#realtimeRadarCard{grid-area:radar!important}
  html body.nexa-v340 #nexaStageHost .nexa-stage-view[data-stage="radar"]>#nfSummary{grid-area:summary!important}
  html body.nexa-v340 #nexaStageHost .nexa-stage-view[data-stage="radar"]>#nexaRadarAlertsDock{grid-area:alerts!important}

  html body.nexa-v340 #nexaDispositionCard{
    display:block!important;
    position:static!important;
    inset:auto!important;
    width:100%!important;
    max-width:100%!important;
    margin:10px 0 0!important;
    transform:none!important;
    translate:none!important;
  }
}

@media(min-width:821px) and (max-width:1110px){
  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="radar"].active{
    grid-template-columns:minmax(0,1fr) minmax(285px,.72fr)!important;
  }
}
`;
  document.head.appendChild(s);
}

function restoreStructure(){
  document.body?.classList.add('nexa-v340');
  const main=q('#mainApp>main');
  const host=$('nexaStageHost')||q('#mainApp .nexa-stage-host');
  if(!main||!host)return;

  if(host.parentElement!==main)main.prepend(host);

  const radar=host.querySelector('.nexa-stage-view[data-stage="radar"]');
  if(radar && (document.body.dataset.nexaStage||'radar')==='radar'){
    radar.hidden=false;
    radar.classList.add('active');
  }

  window.__NEXA_V18_6_3_LAYOUT_DIAGNOSTIC__={
    hostInMain:host.parentElement===main,
    mainLeft:Math.round(main.getBoundingClientRect().left),
    hostLeft:Math.round(host.getBoundingClientRect().left),
    activeStage:document.body.dataset.nexaStage||'radar'
  };
}

function apply(){installStyle();restoreStructure()}

function init(){
  apply();
  let n=0;
  const warm=setInterval(()=>{apply();if(++n>=12)clearInterval(warm)},250);
  addEventListener('resize',apply,{passive:true});
  addEventListener('pageshow',()=>setTimeout(apply,20));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(apply,20)});
  document.addEventListener('click',e=>{
    if(e.target?.closest?.('[data-go],.nexa-session-tab,#nfDoctor,#nfAuditor'))setTimeout(apply,0);
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();

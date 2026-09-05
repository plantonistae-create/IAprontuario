/* NEXA v18.6.4 · stable desktop layout + recorder grid normalization · 2026-09-05
   Root-cause fix for the apparent left white band: the recorder card still had
   legacy direct children participating in CSS Grid auto-placement, pushing
   #nfRecMain into the second column. This module keeps one static geometry
   contract, then normalizes the recorder to exactly two grid children. */
(()=>{
'use strict';
if(window.__NEXA_LAYOUT_STATIC_V18_6_4__)return;
window.__NEXA_LAYOUT_STATIC_V18_6_4__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);

function installStyle(){
  if($('nf1864StaticLayoutStyle'))return;
  const s=document.createElement('style');
  s.id='nf1864StaticLayoutStyle';
  s.textContent=`
@media(min-width:821px){
  html body.nexa-v340 #mainApp{
    position:relative!important;
    width:100%!important;
    max-width:none!important;
    margin:0!important;
    padding:0!important;
    transform:none!important;
  }

  html body.nexa-v340 #mainApp>main{
    display:block!important;
    position:relative!important;
    left:0!important;
    right:auto!important;
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
    transform:none!important;
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
    left:0!important;
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
    left:0!important;
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
    padding:0!important;
  }

  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="summary"].active>*,
  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="hypothesis"].active>*,
  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="plan"].active>*,
  html body.nexa-v340 #nexaStageHost>.nexa-stage-view[data-stage="history"].active>*{
    position:relative!important;
    left:0!important;
    right:auto!important;
    width:100%!important;
    max-width:none!important;
    margin-left:0!important;
    margin-right:0!important;
    transform:none!important;
    translate:none!important;
    box-sizing:border-box!important;
  }

  /* Root-cause fix: the recorder itself must have exactly two grid occupants. */
  html body.nexa-v340 #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone{
    grid-area:record!important;
    display:grid!important;
    grid-template-columns:minmax(0,1fr) 320px!important;
    grid-template-areas:"recmain quick"!important;
    gap:16px!important;
    align-items:stretch!important;
    width:100%!important;
    max-width:none!important;
    margin:0!important;
    left:0!important;
    right:auto!important;
    transform:none!important;
  }

  html body.nexa-v340 #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone>#nfRecMain{
    grid-area:recmain!important;
    grid-column:1!important;
    grid-row:1!important;
    display:flex!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    margin:0!important;
    transform:none!important;
  }

  html body.nexa-v340 #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone>#nfQuick{
    grid-area:quick!important;
    grid-column:2!important;
    grid-row:1!important;
    display:block!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    margin:0!important;
    transform:none!important;
  }

  html body.nexa-v340 #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone.nf-rec-normalized>:not(#nfRecMain):not(#nfQuick){
    display:none!important;
    width:0!important;
    height:0!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    overflow:hidden!important;
  }

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
  html body.nexa-v340 #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone{
    grid-template-columns:minmax(0,1fr) 260px!important;
  }
}
`;
  document.head.appendChild(s);
}

function normalizeRecorderGrid(host){
  const rec=host?.querySelector('.nexa-stage-view[data-stage="radar"]>.card.rec-zone');
  const recMain=$('nfRecMain');
  const quick=$('nfQuick');
  if(!rec||!recMain||!quick)return false;

  if(recMain.parentElement!==rec)rec.appendChild(recMain);
  if(quick.parentElement!==rec)rec.appendChild(quick);

  rec.classList.add('nf-rec-normalized');
  [...rec.children].forEach(el=>{
    if(el===recMain||el===quick)return;
    el.style.setProperty('display','none','important');
    el.setAttribute('aria-hidden','true');
  });
  return true;
}

function restoreStructure(){
  document.body?.classList.add('nexa-v340');
  const main=q('#mainApp>main');
  const host=$('nexaStageHost')||q('#mainApp .nexa-stage-host');
  if(!main||!host)return false;

  if(host.parentElement!==main)main.prepend(host);

  const active=document.body.dataset.nexaStage||'radar';
  const radar=host.querySelector('.nexa-stage-view[data-stage="radar"]');
  if(radar&&active==='radar'){
    radar.hidden=false;
    radar.classList.add('active');
  }

  const normalized=normalizeRecorderGrid(host);
  window.__NEXA_V18_6_4_LAYOUT_DIAGNOSTIC__={
    hostInMain:host.parentElement===main,
    activeStage:active,
    recorderNormalized:normalized,
    recorderChildren:host.querySelector('.nexa-stage-view[data-stage="radar"]>.card.rec-zone')
      ?[...host.querySelector('.nexa-stage-view[data-stage="radar"]>.card.rec-zone').children].map(el=>el.id||el.className||el.tagName)
      :[],
    mainInlineMargin:getComputedStyle(main).marginLeft,
    mainInlineWidth:getComputedStyle(main).width
  };
  return normalized;
}

function apply(){installStyle();return restoreStructure()}

function init(){
  apply();
  [80,220,500,900,1600,2600].forEach(ms=>setTimeout(apply,ms));
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

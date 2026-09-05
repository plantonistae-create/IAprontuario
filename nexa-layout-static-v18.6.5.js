/* NEXA v18.6.5 · fixed clinical canvas + recorder root-cause normalization · 2026-09-05
   Keeps the viewport-fixed clinical canvas introduced in v18.6.4 and fixes the
   remaining apparent white band inside the Radar: legacy direct children of
   .rec-zone were still participating in CSS Grid auto-placement and pushing
   #nfRecMain away from the left edge. */
(()=>{
'use strict';
if(window.__NEXA_FIXED_CANVAS_V18_6_5__)return;
window.__NEXA_FIXED_CANVAS_V18_6_5__=true;

const $=id=>document.getElementById(id);

function installStyle(){
  if($('nf1865FixedCanvasStyle'))return;
  const s=document.createElement('style');
  s.id='nf1865FixedCanvasStyle';
  s.textContent=`
@media(min-width:821px){
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open){
    overflow:hidden!important;
    background:var(--nf-bg)!important;
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #mainApp{
    width:100%!important;
    max-width:none!important;
    margin:0!important;
    padding:0!important;
    transform:none!important;
  }

  /* Keep native controls alive, but remove every legacy document-grid offset. */
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #mainApp>main{
    display:block!important;
    position:static!important;
    width:100vw!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    margin:0!important;
    padding:0!important;
    grid-template-columns:none!important;
    grid-template-rows:none!important;
    gap:0!important;
    overflow:visible!important;
    background:var(--nf-bg)!important;
    transform:none!important;
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #mainApp>main>.panel-left,
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #mainApp>main>.panel-right{
    display:none!important;
    position:static!important;
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

  /* The clinical canvas is anchored directly to the final sidebar/topbar. */
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #mainApp>main>#nexaStageHost,
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #mainApp>main>.nexa-stage-host{
    display:block!important;
    position:fixed!important;
    z-index:2!important;
    left:var(--nf-side,214px)!important;
    right:0!important;
    top:var(--nf-top,72px)!important;
    bottom:0!important;
    inset:var(--nf-top,72px) 0 0 var(--nf-side,214px)!important;
    width:auto!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    max-height:none!important;
    margin:0!important;
    padding:16px 16px 24px!important;
    transform:none!important;
    translate:none!important;
    float:none!important;
    clear:none!important;
    box-sizing:border-box!important;
    overflow-x:hidden!important;
    overflow-y:auto!important;
    overscroll-behavior:contain!important;
    -webkit-overflow-scrolling:touch!important;
    background:var(--nf-bg)!important;
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view{
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
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[hidden]{display:none!important}

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view.active{
    width:100%!important;
    max-width:none!important;
    margin:0!important;
    padding:0!important;
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view.active>*{
    max-width:none!important;
    box-sizing:border-box!important;
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="radar"].active{
    display:grid!important;
    grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr)!important;
    grid-template-areas:
      "record record"
      "radar summary"
      "radar alerts"!important;
    gap:14px!important;
    align-items:start!important;
    align-content:start!important;
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="summary"].active,
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="hypothesis"].active,
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="plan"].active,
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="history"].active{
    display:block!important;
    width:100%!important;
    max-width:none!important;
    margin:0!important;
    padding:0!important;
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="summary"].active>*,
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="hypothesis"].active>*,
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="plan"].active>*,
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="history"].active>*{
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

  /* Root-cause fix for the remaining white band in Radar. */
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone{
    grid-area:record!important;
    display:grid!important;
    grid-template-columns:minmax(0,1fr) 320px!important;
    grid-template-areas:"recmain quick"!important;
    gap:16px!important;
    align-items:stretch!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    margin:0!important;
    padding:16px!important;
    left:0!important;
    right:auto!important;
    transform:none!important;
    box-sizing:border-box!important;
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone>#nfRecMain{
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

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone>#nfQuick{
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

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone.nf-rec-normalized>:not(#nfRecMain):not(#nfQuick){
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
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost .nexa-stage-view[data-stage="radar"]>#realtimeRadarCard{grid-area:radar!important}
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost .nexa-stage-view[data-stage="radar"]>#nfSummary{grid-area:summary!important}
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost .nexa-stage-view[data-stage="radar"]>#nexaRadarAlertsDock{grid-area:alerts!important}

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaDispositionCard{
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
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="radar"].active{
    grid-template-columns:minmax(0,1fr) minmax(285px,.72fr)!important;
  }
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone{
    grid-template-columns:minmax(0,1fr) 260px!important;
  }
}
`;
  document.head.appendChild(s);
}

function normalizeRecorderGrid(){
  const host=$('nexaStageHost');
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

function repair(){
  document.body?.classList.add('nexa-v340');
  installStyle();
  const normalized=normalizeRecorderGrid();
  window.__NEXA_V18_6_5_LAYOUT_DIAGNOSTIC__={
    mode:'fixed-canvas+recorder-normalized',
    keepsHostInMain:true,
    dynamicCounterShift:false,
    appliesTo:['radar','summary','hypothesis','plan','history'],
    recorderNormalized:normalized,
    recorderChildren:$('nexaStageHost')?.querySelector('.nexa-stage-view[data-stage="radar"]>.card.rec-zone')
      ?[...$('nexaStageHost').querySelector('.nexa-stage-view[data-stage="radar"]>.card.rec-zone').children].map(el=>el.id||el.className||el.tagName)
      :[]
  };
}

function install(){
  repair();
  [60,180,400,800,1500,2500].forEach(ms=>setTimeout(repair,ms));
  addEventListener('pageshow',()=>setTimeout(repair,20));
  addEventListener('resize',repair,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(repair,20)});
  document.addEventListener('click',e=>{
    if(e.target?.closest?.('[data-go],.nexa-session-tab,#nfDoctor,#nfAuditor'))setTimeout(repair,0);
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();

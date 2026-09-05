/* NEXA v18.6.4 · fixed clinical canvas · 2026-09-05
   Desktop clinical workspace is anchored directly to the final sidebar/topbar.
   The stage host stays inside <main> for compatibility, but uses viewport-fixed
   geometry so legacy main/grid/max-width rules cannot create a left white rail. */
(()=>{
'use strict';
if(window.__NEXA_FIXED_CANVAS_V18_6_4__)return;
window.__NEXA_FIXED_CANVAS_V18_6_4__=true;

const $=id=>document.getElementById(id);

function installStyle(){
  if($('nf1864FixedCanvasStyle'))return;
  const s=document.createElement('style');
  s.id='nf1864FixedCanvasStyle';
  s.textContent=`
@media(min-width:821px){
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open){
    overflow:hidden!important;
    background:var(--nf-bg)!important;
  }

  /* Neutralize the legacy document grid, but keep it alive for native controls. */
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

  /*
   * Key fix: host remains a child of <main>, but fixed positioning removes it
   * entirely from every legacy grid/margin/max-width calculation.
   * The canvas starts exactly at the final sidebar edge; 16px is internal
   * padding, so there is no exposed white rail between sidebar and workspace.
   */
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
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[hidden]{
    display:none!important;
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view.active{
    width:100%!important;
    max-width:none!important;
    margin:0!important;
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
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="summary"].active>*,
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="hypothesis"].active>*,
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="plan"].active>*,
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost>.nexa-stage-view[data-stage="history"].active>*{
    width:100%!important;
    max-width:none!important;
    margin-left:0!important;
    margin-right:0!important;
    box-sizing:border-box!important;
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone{grid-area:record!important}
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
}
`;
  document.head.appendChild(s);
}

function install(){
  document.body?.classList.add('nexa-v340');
  installStyle();
  window.__NEXA_V18_6_4_LAYOUT_DIAGNOSTIC__={
    mode:'fixed-canvas',
    keepsHostInMain:true,
    dynamicCounterShift:false,
    appliesTo:['radar','summary','hypothesis','plan','history']
  };
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();

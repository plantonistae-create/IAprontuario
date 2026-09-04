/* NEXA v18.1 · desktop layout-flow lock · 2026-09-04
   Corrige coluna fantasma entre sidebar/conteúdo e mantém Disposição do PS no fluxo normal. */
(()=>{
'use strict';
if(window.__NEXA_LAYOUT_FLOW_V18_1__)return;
window.__NEXA_LAYOUT_FLOW_V18_1__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);

function installStyle(){
  let s=$('nf181LayoutFlowStyle');
  if(!s){
    s=document.createElement('style');
    s.id='nf181LayoutFlowStyle';
    s.textContent=`
/* NEXA v18.1: desktop shell must have exactly two visual regions: sidebar + content. */
@media(min-width:821px){
  html body.nexa-v340 #mainApp>main{
    display:block!important;
    grid-template-columns:minmax(0,1fr)!important;
    grid-template-rows:auto!important;
    grid-auto-columns:auto!important;
    grid-auto-flow:row!important;
    column-gap:0!important;
    row-gap:0!important;
    gap:0!important;
    margin-left:var(--nf-side)!important;
    margin-right:0!important;
    width:calc(100vw - var(--nf-side))!important;
    max-width:none!important;
    padding:calc(var(--nf-top) + 16px) 16px 20px!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }

  html body.nexa-v340 #mainApp>main>.panel-left{
    display:none!important;
    width:0!important;
    min-width:0!important;
    max-width:0!important;
    margin:0!important;
    padding:0!important;
    flex:0 0 0!important;
  }

  html body.nexa-v340 #mainApp>main>.panel-right,
  html body.nexa-v340 #mainApp>main .panel-right{
    display:block!important;
    position:relative!important;
    inset:auto!important;
    top:auto!important;
    right:auto!important;
    bottom:auto!important;
    left:auto!important;
    float:none!important;
    clear:both!important;
    grid-column:1/-1!important;
    grid-row:auto!important;
    justify-self:stretch!important;
    align-self:start!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    min-height:0!important;
    margin:0!important;
    padding:0!important;
    transform:none!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }

  html body.nexa-v340 .nexa-stage-host,
  html body.nexa-v340 .nexa-stage-view{
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
    box-sizing:border-box!important;
  }

  html body.nexa-v340 .nexa-stage-view[data-stage="radar"].active{
    display:grid!important;
    grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr)!important;
    grid-template-rows:auto auto auto!important;
    grid-template-areas:
      "record record"
      "radar summary"
      "radar alerts"!important;
    gap:14px!important;
    align-items:start!important;
    align-content:start!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    margin:0!important;
    padding:0!important;
  }

  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>.card.rec-zone{
    grid-area:record!important;
    display:grid!important;
    grid-template-columns:minmax(0,1fr) 320px!important;
    grid-template-rows:auto!important;
    grid-auto-flow:column!important;
    gap:16px!important;
    position:relative!important;
    inset:auto!important;
    top:auto!important;
    left:auto!important;
    right:auto!important;
    bottom:auto!important;
    transform:none!important;
    float:none!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    min-height:286px!important;
    margin:0!important;
    overflow:visible!important;
    box-sizing:border-box!important;
  }

  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>.card.rec-zone>#nfRecMain{
    grid-column:1!important;
    grid-row:1!important;
    min-width:0!important;
    width:100%!important;
    align-self:stretch!important;
  }

  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>.card.rec-zone>#nfQuick{
    grid-column:2!important;
    grid-row:1!important;
    display:block!important;
    position:relative!important;
    inset:auto!important;
    align-self:stretch!important;
    justify-self:stretch!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    margin:0!important;
    transform:none!important;
    z-index:auto!important;
    box-sizing:border-box!important;
  }

  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>#realtimeRadarCard{
    grid-area:radar!important;
    display:block!important;
    position:relative!important;
    inset:auto!important;
    top:auto!important;
    left:auto!important;
    right:auto!important;
    bottom:auto!important;
    transform:none!important;
    float:none!important;
    clear:both!important;
    z-index:auto!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    min-height:0!important;
    margin:0!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }

  html body.nexa-v340 #realtimeRadarCard>#nexaDispositionCard,
  html body.nexa-v340 #nexaDispositionCard{
    display:block!important;
    position:static!important;
    inset:auto!important;
    top:auto!important;
    right:auto!important;
    bottom:auto!important;
    left:auto!important;
    float:none!important;
    clear:both!important;
    grid-column:auto!important;
    grid-row:auto!important;
    grid-area:auto!important;
    align-self:auto!important;
    justify-self:auto!important;
    z-index:auto!important;
    transform:none!important;
    translate:none!important;
    width:100%!important;
    min-width:0!important;
    max-width:100%!important;
    height:auto!important;
    min-height:0!important;
    margin:10px 0 0!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }

  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>#nfSummary{
    grid-area:summary!important;
    position:relative!important;
    inset:auto!important;
    transform:none!important;
    align-self:start!important;
    width:100%!important;
    min-width:0!important;
    height:auto!important;
    margin:0!important;
    z-index:auto!important;
    box-sizing:border-box!important;
  }

  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>#nexaRadarAlertsDock{
    grid-area:alerts!important;
    position:relative!important;
    inset:auto!important;
    transform:none!important;
    align-self:start!important;
    width:100%!important;
    min-width:0!important;
    height:auto!important;
    margin:0!important;
    z-index:auto!important;
    box-sizing:border-box!important;
  }
}

@media(min-width:821px) and (max-width:1110px){
  html body.nexa-v340 .nexa-stage-view[data-stage="radar"].active{
    grid-template-columns:minmax(0,1fr) minmax(285px,.72fr)!important;
  }
  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>.card.rec-zone{
    grid-template-columns:minmax(0,1fr) 260px!important;
  }
}
`;
    document.head.appendChild(s);
  }
  // Legacy modules can inject CSS after DOMContentLoaded. Keep the final layout contract last.
  if(document.head.lastElementChild!==s)document.head.appendChild(s);
  return s;
}

function normalizeFlow(){
  installStyle();
  const stage=q('.nexa-stage-view[data-stage="radar"]');
  if(!stage)return;

  const rec=q('.card.rec-zone');
  const radar=$('realtimeRadarCard');
  const summary=$('nfSummary');
  const alerts=$('nexaRadarAlertsDock');
  const disp=$('nexaDispositionCard');

  if(rec&&rec.parentElement!==stage)stage.prepend(rec);
  if(radar&&radar.parentElement!==stage)stage.appendChild(radar);
  if(summary&&summary.parentElement!==stage)stage.appendChild(summary);
  if(alerts&&alerts.parentElement!==stage)stage.appendChild(alerts);
  if(radar&&disp&&disp.parentElement!==radar)radar.appendChild(disp);

  // Remove stale inline geometry left by previous shells without touching clinical content.
  [q('#mainApp>main .panel-right'),rec,radar,summary,alerts,disp].filter(Boolean).forEach(el=>{
    ['left','right','top','bottom','transform','translate','float','z-index'].forEach(p=>el.style.removeProperty(p));
  });
}

function smoke(){
  const main=q('#mainApp>main');
  const panel=q('#mainApp>main .panel-right');
  const stage=q('.nexa-stage-view[data-stage="radar"]');
  const radar=$('realtimeRadarCard');
  const disp=$('nexaDispositionCard');
  const checks={
    main:!!main,
    panel:!!panel,
    stage:!!stage,
    dispositionInsideRadar:!!(radar&&disp&&disp.parentElement===radar),
    noLegacyRecorderActions:!$('nexaRadarRecActions')&&!q('.nexa-radar-rec-actions'),
    styleLast:document.head.lastElementChild?.id==='nf181LayoutFlowStyle'
  };
  checks.ok=Object.values(checks).every(Boolean);
  window.__NEXA_V18_1_LAYOUT_SMOKE__=checks;
  return checks;
}

function init(){
  normalizeFlow();
  let n=0;
  const warm=setInterval(()=>{normalizeFlow();if(++n>18){clearInterval(warm);smoke()}},300);
  const obs=new MutationObserver(()=>{
    clearTimeout(window.__nf181Mut);
    window.__nf181Mut=setTimeout(normalizeFlow,45);
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('resize',()=>setTimeout(normalizeFlow,60),{passive:true});
  addEventListener('pageshow',()=>setTimeout(normalizeFlow,30));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();

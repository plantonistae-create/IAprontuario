/* NEXA v18.2 · desktop layout-flow lock · 2026-09-04
   Elimina definitivamente a coluna fantasma entre sidebar/conteúdo e mantém Disposição do PS no fluxo normal. */
(()=>{
'use strict';
if(window.__NEXA_LAYOUT_FLOW_V18_2__)return;
window.__NEXA_LAYOUT_FLOW_V18_2__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const imp=(el,prop,val)=>el?.style?.setProperty(prop,val,'important');

function installStyle(){
  let s=$('nf182LayoutFlowStyle');
  if(!s){
    s=document.createElement('style');
    s.id='nf182LayoutFlowStyle';
    s.textContent=`
/* NEXA v18.2: desktop = sidebar fixa + UMA única coluna real de conteúdo. */
@media(min-width:821px){
  html body.nexa-v340 #mainApp>main{
    display:grid!important;
    grid-template-columns:minmax(0,1fr)!important;
    grid-template-rows:auto!important;
    grid-auto-columns:minmax(0,1fr)!important;
    grid-auto-flow:row!important;
    column-gap:0!important;
    row-gap:0!important;
    gap:0!important;
    justify-content:stretch!important;
    align-items:start!important;
    margin-left:var(--nf-side)!important;
    margin-right:0!important;
    width:calc(100vw - var(--nf-side))!important;
    min-width:0!important;
    max-width:none!important;
    padding:calc(var(--nf-top) + 16px) 16px 20px!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }

  /* O painel legado esquerdo não pode continuar reservando a antiga primeira coluna. */
  html body.nexa-v340 #mainApp>main .panel-left,
  html body.nexa-v340 #mainApp>main>.panel-left{
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
    flex:0 0 0!important;
    grid-column:auto!important;
    grid-row:auto!important;
    overflow:hidden!important;
    visibility:hidden!important;
    pointer-events:none!important;
  }

  /* Conteúdo começa imediatamente depois do padding de 16 px do main. */
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
    clear:none!important;
    grid-column:1/-1!important;
    grid-row:1!important;
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
    translate:none!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }

  html body.nexa-v340 #mainApp>main>.nexa-stage-host,
  html body.nexa-v340 #mainApp>main>#nfStageHost,
  html body.nexa-v340 .panel-right>.nexa-stage-host,
  html body.nexa-v340 .nexa-stage-host,
  html body.nexa-v340 .nexa-stage-view{
    position:relative!important;
    inset:auto!important;
    left:auto!important;
    right:auto!important;
    grid-column:1/-1!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    margin:0!important;
    padding:0!important;
    transform:none!important;
    translate:none!important;
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
    transform:none!important;
    float:none!important;
    clear:none!important;
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
  if(document.head.lastElementChild!==s)document.head.appendChild(s);
  return s;
}

function forceSingleContentColumn(){
  const main=q('#mainApp>main');
  if(!main)return;

  /* Inline !important vence inclusive scripts legados que voltam a aplicar display:grid/coluna 2. */
  imp(main,'display','grid');
  imp(main,'grid-template-columns','minmax(0,1fr)');
  imp(main,'grid-template-rows','auto');
  imp(main,'grid-auto-columns','minmax(0,1fr)');
  imp(main,'grid-auto-flow','row');
  imp(main,'gap','0');
  imp(main,'column-gap','0');
  imp(main,'row-gap','0');
  imp(main,'justify-content','stretch');
  imp(main,'align-items','start');
  imp(main,'margin-left','var(--nf-side)');
  imp(main,'margin-right','0');
  imp(main,'width','calc(100vw - var(--nf-side))');
  imp(main,'min-width','0');
  imp(main,'max-width','none');
  imp(main,'padding','calc(var(--nf-top) + 16px) 16px 20px');
  imp(main,'box-sizing','border-box');

  qa('#mainApp>main .panel-left').forEach(left=>{
    imp(left,'display','none');
    imp(left,'width','0');
    imp(left,'min-width','0');
    imp(left,'max-width','0');
    imp(left,'height','0');
    imp(left,'min-height','0');
    imp(left,'margin','0');
    imp(left,'padding','0');
    imp(left,'border','0');
    imp(left,'overflow','hidden');
    imp(left,'visibility','hidden');
    imp(left,'pointer-events','none');
    imp(left,'grid-column','auto');
    imp(left,'grid-row','auto');
  });

  qa('#mainApp>main .panel-right').forEach(panel=>{
    imp(panel,'display','block');
    imp(panel,'position','relative');
    imp(panel,'left','auto');
    imp(panel,'right','auto');
    imp(panel,'top','auto');
    imp(panel,'bottom','auto');
    imp(panel,'grid-column','1 / -1');
    imp(panel,'grid-row','1');
    imp(panel,'justify-self','stretch');
    imp(panel,'width','100%');
    imp(panel,'min-width','0');
    imp(panel,'max-width','none');
    imp(panel,'margin','0');
    imp(panel,'padding','0');
    imp(panel,'transform','none');
    imp(panel,'translate','none');
    imp(panel,'box-sizing','border-box');
  });

  qa('#mainApp>main .nexa-stage-host,#mainApp>main .nexa-stage-view').forEach(el=>{
    imp(el,'grid-column','1 / -1');
    imp(el,'width','100%');
    imp(el,'min-width','0');
    imp(el,'max-width','none');
    imp(el,'margin','0');
    imp(el,'padding','0');
    imp(el,'left','auto');
    imp(el,'right','auto');
    imp(el,'transform','none');
    imp(el,'translate','none');
    imp(el,'box-sizing','border-box');
  });
}

function normalizeFlow(){
  installStyle();
  forceSingleContentColumn();

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

  [q('#mainApp>main .panel-right'),rec,radar,summary,alerts,disp].filter(Boolean).forEach(el=>{
    ['left','right','top','bottom','transform','translate','float','z-index'].forEach(p=>{
      if(el===q('#mainApp>main .panel-right'))return;
      el.style.removeProperty(p);
    });
  });

  forceSingleContentColumn();
}

function smoke(){
  const main=q('#mainApp>main');
  const left=q('#mainApp>main .panel-left');
  const panel=q('#mainApp>main .panel-right');
  const stage=q('.nexa-stage-view[data-stage="radar"]');
  const radar=$('realtimeRadarCard');
  const disp=$('nexaDispositionCard');
  const computedMain=main?getComputedStyle(main):null;
  const computedLeft=left?getComputedStyle(left):null;
  const checks={
    main:!!main,
    panel:!!panel,
    stage:!!stage,
    oneColumnMain:!!(computedMain&&computedMain.gridTemplateColumns&&!computedMain.gridTemplateColumns.includes('  ')),
    legacyLeftHidden:!left||computedLeft?.display==='none',
    panelStartsInFirstColumn:panel?.style?.getPropertyValue('grid-column')==='1 / -1',
    dispositionInsideRadar:!!(radar&&disp&&disp.parentElement===radar),
    noLegacyRecorderActions:!$('nexaRadarRecActions')&&!q('.nexa-radar-rec-actions'),
    styleLast:document.head.lastElementChild?.id==='nf182LayoutFlowStyle'
  };
  checks.ok=Object.values(checks).every(Boolean);
  window.__NEXA_V18_2_LAYOUT_SMOKE__=checks;
  return checks;
}

function init(){
  normalizeFlow();
  let n=0;
  const warm=setInterval(()=>{normalizeFlow();if(++n>24){clearInterval(warm);smoke()}},250);
  const obs=new MutationObserver(()=>{
    clearTimeout(window.__nf182Mut);
    window.__nf182Mut=setTimeout(normalizeFlow,35);
  });
  obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  addEventListener('resize',()=>setTimeout(normalizeFlow,40),{passive:true});
  addEventListener('pageshow',()=>setTimeout(normalizeFlow,20));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(normalizeFlow,20)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();

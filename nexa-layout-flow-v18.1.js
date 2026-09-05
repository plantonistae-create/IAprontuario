/* NEXA v18.4 · unscoped desktop geometry lock · 2026-09-05
   Corrige a causa raiz da faixa branca: o index legado mantém main em duas colunas e o body
   não nasce com a classe nexa-v340. Esta camada ativa a classe final e aplica a geometria
   sem depender dela, preservando o fluxo já corrigido do Radar/Disposição do PS. */
(()=>{
'use strict';
if(window.__NEXA_LAYOUT_FLOW_V18_4__)return;
window.__NEXA_LAYOUT_FLOW_V18_4__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const imp=(el,prop,val)=>el?.style?.setProperty(prop,val,'important');

function ensureBodyContract(){
  if(document.body&&!document.body.classList.contains('nexa-v340'))document.body.classList.add('nexa-v340');
}

function installStyle(){
  let s=$('nf184LayoutFlowStyle');
  if(!s){
    s=document.createElement('style');
    s.id='nf184LayoutFlowStyle';
    s.textContent=`
@media(min-width:821px){
  /* Não depende de body.nexa-v340: vence diretamente o main legado de 300–380px + conteúdo. */
  html body #mainApp>main{
    display:block!important;
    grid-template-columns:none!important;
    grid-template-rows:none!important;
    gap:0!important;
    position:relative!important;
    left:auto!important;
    right:auto!important;
    margin:0 0 0 var(--nf-side,214px)!important;
    width:calc(100vw - var(--nf-side,214px))!important;
    min-width:0!important;
    max-width:none!important;
    padding:calc(var(--nf-top,72px) + 16px) 16px 20px!important;
    background:var(--nf-bg,#f5f8fb)!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }
  html body #mainApp>main .panel-left,
  html body #mainApp>main>.panel-left{
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
  html body #mainApp>main>.panel-right,
  html body #mainApp>main .panel-right{
    display:block!important;
    position:relative!important;
    inset:auto!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    margin:0!important;
    padding:0!important;
    transform:none!important;
    translate:none!important;
    float:none!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }
  html body #mainApp>main .nexa-stage-host,
  html body #mainApp>main .nexa-stage-view{
    position:relative!important;
    inset:auto!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    margin:0!important;
    padding:0!important;
    transform:none!important;
    translate:none!important;
    box-sizing:border-box!important;
  }
  html body .nexa-stage-view[data-stage="radar"].active{
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
  html body .nexa-stage-view[data-stage="radar"]>.card.rec-zone{
    grid-area:record!important;
    display:grid!important;
    grid-template-columns:minmax(0,1fr) 320px!important;
    grid-template-rows:auto!important;
    gap:16px!important;
    position:relative!important;
    inset:auto!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    min-height:286px!important;
    margin:0!important;
    transform:none!important;
    float:none!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }
  html body .nexa-stage-view[data-stage="radar"]>.card.rec-zone>#nfRecMain{
    grid-column:1!important;
    grid-row:1!important;
    width:100%!important;
    min-width:0!important;
  }
  html body .nexa-stage-view[data-stage="radar"]>.card.rec-zone>#nfQuick{
    grid-column:2!important;
    grid-row:1!important;
    display:block!important;
    position:relative!important;
    inset:auto!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    margin:0!important;
    transform:none!important;
    z-index:auto!important;
    box-sizing:border-box!important;
  }
  html body .nexa-stage-view[data-stage="radar"]>#realtimeRadarCard{
    grid-area:radar!important;
    display:block!important;
    position:relative!important;
    inset:auto!important;
    width:100%!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    margin:0!important;
    transform:none!important;
    float:none!important;
    z-index:auto!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }
  html body #realtimeRadarCard>#nexaDispositionCard,
  html body #nexaDispositionCard{
    display:block!important;
    position:static!important;
    inset:auto!important;
    width:100%!important;
    min-width:0!important;
    max-width:100%!important;
    height:auto!important;
    min-height:0!important;
    margin:10px 0 0!important;
    transform:none!important;
    translate:none!important;
    float:none!important;
    clear:both!important;
    z-index:auto!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }
  html body .nexa-stage-view[data-stage="radar"]>#nfSummary{
    grid-area:summary!important;
    position:relative!important;
    inset:auto!important;
    width:100%!important;
    min-width:0!important;
    height:auto!important;
    margin:0!important;
    transform:none!important;
    z-index:auto!important;
    box-sizing:border-box!important;
  }
  html body .nexa-stage-view[data-stage="radar"]>#nexaRadarAlertsDock{
    grid-area:alerts!important;
    position:relative!important;
    inset:auto!important;
    width:100%!important;
    min-width:0!important;
    height:auto!important;
    margin:0!important;
    transform:none!important;
    z-index:auto!important;
    box-sizing:border-box!important;
  }
}
@media(min-width:821px) and (max-width:1110px){
  html body .nexa-stage-view[data-stage="radar"].active{
    grid-template-columns:minmax(0,1fr) minmax(285px,.72fr)!important;
  }
  html body .nexa-stage-view[data-stage="radar"]>.card.rec-zone{
    grid-template-columns:minmax(0,1fr) 260px!important;
  }
}
`;
    document.head.appendChild(s);
  }
  if(document.head.lastElementChild!==s)document.head.appendChild(s);
}

function preserveFinalContent(){
  const main=q('#mainApp>main');
  if(!main)return null;
  const panel=q('#mainApp>main>.panel-right')||q('#mainApp>main .panel-right');
  if(!panel)return null;

  const directHost=[...main.children].find(el=>el!==panel&&(el.id==='nfStageHost'||el.classList?.contains('nexa-stage-host')));
  if(directHost&&!panel.contains(directHost))panel.appendChild(directHost);

  /* Só remove a coluna física depois que a UI final já recolheu os controles nativos. */
  if($('nfShell')&&$('nfRecMain'))qa('#mainApp>main .panel-left').forEach(left=>left.remove());

  [...main.children].forEach(child=>{
    if(child===panel)return;
    if(child.id==='nfStageHost'||child.classList?.contains('nexa-stage-host')){
      panel.appendChild(child);
      return;
    }
    if($('nfShell')&&$('nfRecMain')&&child.classList?.contains('panel-left'))child.remove();
  });

  if(panel.parentElement!==main)main.appendChild(panel);
  if(main.firstElementChild!==panel)main.prepend(panel);
  return panel;
}

function lockGeometry(){
  ensureBodyContract();
  const main=q('#mainApp>main');
  const panel=preserveFinalContent();
  if(!main||!panel)return;

  imp(main,'display','block');
  imp(main,'grid-template-columns','none');
  imp(main,'grid-template-rows','none');
  imp(main,'gap','0');
  imp(main,'position','relative');
  imp(main,'left','auto');
  imp(main,'right','auto');
  imp(main,'margin','0 0 0 var(--nf-side,214px)');
  imp(main,'width','calc(100vw - var(--nf-side,214px))');
  imp(main,'min-width','0');
  imp(main,'max-width','none');
  imp(main,'padding','calc(var(--nf-top,72px) + 16px) 16px 20px');
  imp(main,'box-sizing','border-box');
  imp(main,'overflow','visible');

  imp(panel,'display','block');
  imp(panel,'position','relative');
  imp(panel,'left','auto');
  imp(panel,'right','auto');
  imp(panel,'top','auto');
  imp(panel,'bottom','auto');
  imp(panel,'width','100%');
  imp(panel,'min-width','0');
  imp(panel,'max-width','none');
  imp(panel,'height','auto');
  imp(panel,'margin','0');
  imp(panel,'padding','0');
  imp(panel,'transform','none');
  imp(panel,'translate','none');
  imp(panel,'float','none');
  imp(panel,'box-sizing','border-box');
  imp(panel,'overflow','visible');

  qa('#mainApp>main .nexa-stage-host,#mainApp>main .nexa-stage-view').forEach(el=>{
    imp(el,'position','relative');
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

function normalizeRadar(){
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

  if(innerWidth>=821){
    imp(stage,'display','grid');
    imp(stage,'grid-template-columns',innerWidth<=1110?'minmax(0,1fr) minmax(285px,.72fr)':'minmax(0,1.15fr) minmax(320px,.85fr)');
    imp(stage,'grid-template-areas','"record record" "radar summary" "radar alerts"');
    imp(stage,'gap','14px');
    imp(stage,'width','100%');

    if(rec){
      imp(rec,'grid-area','record');
      imp(rec,'display','grid');
      imp(rec,'grid-template-columns',innerWidth<=1110?'minmax(0,1fr) 260px':'minmax(0,1fr) 320px');
      imp(rec,'gap','16px');
      imp(rec,'width','100%');
      imp(rec,'margin','0');
    }
    if(radar)imp(radar,'grid-area','radar');
    if(summary)imp(summary,'grid-area','summary');
    if(alerts)imp(alerts,'grid-area','alerts');
  }
}

function diagnostic(){
  const side=$('nfSide');
  const main=q('#mainApp>main');
  const panel=q('#mainApp>main>.panel-right')||q('#mainApp>main .panel-right');
  const stage=q('.nexa-stage-view[data-stage="radar"]');
  const rec=q('.nexa-stage-view[data-stage="radar"]>.card.rec-zone');
  const sr=side?.getBoundingClientRect();
  const mr=main?.getBoundingClientRect();
  const pr=panel?.getBoundingClientRect();
  const tr=stage?.getBoundingClientRect();
  const rr=rec?.getBoundingClientRect();
  const expected=(sr?.right||0)+16;
  const d={
    bodyHasContract:!!document.body?.classList.contains('nexa-v340'),
    viewportWidth:innerWidth,
    sideRight:Math.round(sr?.right||0),
    mainLeft:Math.round(mr?.left||0),
    panelLeft:Math.round(pr?.left||0),
    stageLeft:Math.round(tr?.left||0),
    recorderLeft:Math.round(rr?.left||0),
    expectedContentLeft:Math.round(expected),
    panelGap:Math.round((pr?.left||0)-expected),
    recorderGap:Math.round((rr?.left||0)-expected),
    mainDisplay:main?getComputedStyle(main).display:null,
    mainGridTemplate:main?getComputedStyle(main).gridTemplateColumns:null,
    legacyPanelLeftCount:qa('#mainApp>main .panel-left').length,
    directChildren:main?[...main.children].map(el=>el.id||el.className||el.tagName):[]
  };
  d.ok=d.bodyHasContract&&Math.abs(d.panelGap)<=4&&Math.abs(d.recorderGap)<=4;
  window.__NEXA_V18_4_LAYOUT_DIAGNOSTIC__=d;
  return d;
}

function normalize(){
  ensureBodyContract();
  installStyle();
  normalizeRadar();
  lockGeometry();
  normalizeRadar();
  lockGeometry();
  diagnostic();
}

function init(){
  ensureBodyContract();
  normalize();
  let n=0;
  const warm=setInterval(()=>{normalize();if(++n>40)clearInterval(warm)},250);
  const obs=new MutationObserver(()=>{
    clearTimeout(window.__nf184Mut);
    window.__nf184Mut=setTimeout(normalize,35);
  });
  obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  addEventListener('resize',()=>setTimeout(normalize,40),{passive:true});
  addEventListener('pageshow',()=>setTimeout(normalize,20));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(normalize,20)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();

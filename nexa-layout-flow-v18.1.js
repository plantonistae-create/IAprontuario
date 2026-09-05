/* NEXA v18.3 · definitive desktop rail removal · 2026-09-04
   Remove fisicamente a antiga coluna esquerda do DOM após a UI final assumir os controles,
   mantém o conteúdo colado à sidebar NEXA e preserva o fluxo do Radar/Disposição do PS. */
(()=>{
'use strict';
if(window.__NEXA_LAYOUT_FLOW_V18_3__)return;
window.__NEXA_LAYOUT_FLOW_V18_3__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const imp=(el,prop,val)=>el?.style?.setProperty(prop,val,'important');

function installStyle(){
  let s=$('nf183LayoutFlowStyle');
  if(!s){
    s=document.createElement('style');
    s.id='nf183LayoutFlowStyle';
    s.textContent=`
@media(min-width:821px){
  html body.nexa-v340 #mainApp>main{
    display:block!important;
    position:relative!important;
    left:auto!important;
    right:auto!important;
    margin:0 0 0 var(--nf-side)!important;
    width:calc(100vw - var(--nf-side))!important;
    min-width:0!important;
    max-width:none!important;
    padding:calc(var(--nf-top) + 16px) 16px 20px!important;
    background:var(--nf-bg)!important;
    box-sizing:border-box!important;
    overflow:visible!important;
  }
  html body.nexa-v340 #mainApp>main .panel-left,
  html body.nexa-v340 #mainApp>main>.panel-left{
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
  html body.nexa-v340 #mainApp>main>.panel-right,
  html body.nexa-v340 #mainApp>main .panel-right{
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
  html body.nexa-v340 .nexa-stage-host,
  html body.nexa-v340 .nexa-stage-view{
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
  }
  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>.card.rec-zone{
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
  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>.card.rec-zone>#nfRecMain{
    grid-column:1!important;
    grid-row:1!important;
    width:100%!important;
    min-width:0!important;
  }
  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>.card.rec-zone>#nfQuick{
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
  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>#realtimeRadarCard{
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
  html body.nexa-v340 #realtimeRadarCard>#nexaDispositionCard,
  html body.nexa-v340 #nexaDispositionCard{
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
  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>#nfSummary{
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
  html body.nexa-v340 .nexa-stage-view[data-stage="radar"]>#nexaRadarAlertsDock{
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
}

function preserveFinalContent(){
  const main=q('#mainApp>main');
  if(!main)return null;

  let panel=q('#mainApp>main>.panel-right')||q('#mainApp>main .panel-right');
  if(!panel)return null;

  // Se o host final de estágios foi criado fora do panel-right por alguma camada antiga, traz para dentro.
  const directHost=[...main.children].find(el=>el!==panel&&(el.id==='nfStageHost'||el.classList?.contains('nexa-stage-host')));
  if(directHost&&!panel.contains(directHost))panel.appendChild(directHost);

  // A UI final já moveu gravação/consentimento para os estágios. A coluna antiga agora é apenas espaço morto.
  qa('#mainApp>main .panel-left').forEach(left=>left.remove());

  // Garante que nenhum outro filho estrutural legado continue antes do conteúdo real.
  [...main.children].forEach(child=>{
    if(child===panel)return;
    if(child.id==='nfStageHost'||child.classList?.contains('nexa-stage-host')){
      panel.appendChild(child);
      return;
    }
    if(child.classList?.contains('panel-left'))child.remove();
  });

  if(panel.parentElement!==main)main.appendChild(panel);
  if(main.firstElementChild!==panel)main.prepend(panel);
  return panel;
}

function lockGeometry(){
  const main=q('#mainApp>main');
  const panel=preserveFinalContent();
  if(!main||!panel)return;

  imp(main,'display','block');
  imp(main,'position','relative');
  imp(main,'left','auto');
  imp(main,'right','auto');
  imp(main,'margin','0 0 0 var(--nf-side)');
  imp(main,'width','calc(100vw - var(--nf-side))');
  imp(main,'min-width','0');
  imp(main,'max-width','none');
  imp(main,'padding','calc(var(--nf-top) + 16px) 16px 20px');
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
}

function diagnostic(){
  const side=$('nfSide');
  const main=q('#mainApp>main');
  const panel=q('#mainApp>main>.panel-right')||q('#mainApp>main .panel-right');
  const sr=side?.getBoundingClientRect();
  const mr=main?.getBoundingClientRect();
  const pr=panel?.getBoundingClientRect();
  const expected=(sr?.right||0)+16;
  const actual=pr?.left||0;
  const d={
    sideRight:Math.round(sr?.right||0),
    mainLeft:Math.round(mr?.left||0),
    panelLeft:Math.round(actual),
    expectedPanelLeft:Math.round(expected),
    gap:Math.round(actual-expected),
    legacyPanelLeftCount:qa('#mainApp>main .panel-left').length,
    directChildren:main?[...main.children].map(el=>el.id||el.className||el.tagName):[]
  };
  d.ok=d.legacyPanelLeftCount===0&&Math.abs(d.gap)<=4;
  window.__NEXA_V18_3_LAYOUT_DIAGNOSTIC__=d;
  return d;
}

function normalize(){
  installStyle();
  normalizeRadar();
  lockGeometry();
  normalizeRadar();
  lockGeometry();
  diagnostic();
}

function init(){
  normalize();
  let n=0;
  const warm=setInterval(()=>{normalize();if(++n>32)clearInterval(warm)},250);
  const obs=new MutationObserver(()=>{
    clearTimeout(window.__nf183Mut);
    window.__nf183Mut=setTimeout(normalize,35);
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('resize',()=>setTimeout(normalize,40),{passive:true});
  addEventListener('pageshow',()=>setTimeout(normalize,20));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(normalize,20)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();

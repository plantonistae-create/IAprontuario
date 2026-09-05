/* NEXA v18.5 · definitive desktop content-root hardening · 2026-09-05
   Keeps the final stage host directly under <main>, retires both legacy panels from layout,
   and positions content from the viewport edge instead of stacking historical left offsets. */
(()=>{
'use strict';
if(window.__NEXA_LAYOUT_FLOW_V18_5__)return;
window.__NEXA_LAYOUT_FLOW_V18_5__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const imp=(el,prop,val)=>el?.style?.setProperty(prop,val,'important');
const isDesktop=()=>matchMedia('(min-width:821px)').matches;

function ensureBodyContract(){
  document.body?.classList.add('nexa-v340');
}

function installStyle(){
  let s=$('nf185LayoutStyle');
  if(!s){
    s=document.createElement('style');
    s.id='nf185LayoutStyle';
    s.textContent=`
@media(min-width:821px){
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #mainApp>main,
  html body.nexa-v340:not(.doctor-home-open) #mainApp>main{
    display:block!important;
    position:relative!important;
    margin:0!important;
    width:100vw!important;
    min-width:0!important;
    max-width:none!important;
    padding:calc(var(--nf-top) + 16px) 16px 20px calc(var(--nf-side) + 16px)!important;
    background:var(--nf-bg)!important;
    box-sizing:border-box!important;
    overflow:visible!important;
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

  html body.nexa-v340 #mainApp>main>.nexa-stage-host>.nexa-stage-view{
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

function recoverFinalStageHost(){
  const main=q('#mainApp>main');
  if(!main)return null;

  const host=$('nexaStageHost')||q('#mainApp .nexa-stage-host');
  if(!host)return null;

  // The v3.4 stage builder intentionally made the stage host a direct child of main.
  // Older layout patches moved it back inside panel-right, recreating the ghost column.
  if(host.parentElement!==main)main.prepend(host);

  const left=[...main.children].find(el=>el.classList?.contains('panel-left'));
  const right=[...main.children].find(el=>el.classList?.contains('panel-right'));

  // Only remove the old left rail after the live recorder and radar already live in the stage host.
  const finalOwnsClinicalUi=!!(host.querySelector('#recBtn')&&host.querySelector('#realtimeRadarCard'));
  if(finalOwnsClinicalUi&&left)left.remove();

  // panel-right still contains legacy/native nodes that may be referenced by handlers,
  // so keep it in the DOM but never let it participate in layout.
  if(right){
    imp(right,'display','none');
    imp(right,'width','0');
    imp(right,'min-width','0');
    imp(right,'max-width','0');
    imp(right,'height','0');
    imp(right,'margin','0');
    imp(right,'padding','0');
    imp(right,'overflow','hidden');
    imp(right,'visibility','hidden');
    imp(right,'pointer-events','none');
  }

  if(main.firstElementChild!==host)main.prepend(host);
  return host;
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

function lockGeometry(){
  if(!isDesktop())return;
  const main=q('#mainApp>main');
  const host=recoverFinalStageHost();
  if(!main||!host)return;
  if(document.body.classList.contains('doctor-home-open'))return;

  imp(main,'display','block');
  imp(main,'position','relative');
  imp(main,'left','auto');
  imp(main,'right','auto');
  imp(main,'margin','0');
  imp(main,'width','100vw');
  imp(main,'min-width','0');
  imp(main,'max-width','none');
  imp(main,'padding','calc(var(--nf-top) + 16px) 16px 20px calc(var(--nf-side) + 16px)');
  imp(main,'box-sizing','border-box');
  imp(main,'overflow','visible');

  imp(host,'display','block');
  imp(host,'position','relative');
  imp(host,'left','auto');
  imp(host,'right','auto');
  imp(host,'top','auto');
  imp(host,'bottom','auto');
  imp(host,'width','100%');
  imp(host,'min-width','0');
  imp(host,'max-width','none');
  imp(host,'height','auto');
  imp(host,'margin','0');
  imp(host,'padding','0');
  imp(host,'transform','none');
  imp(host,'translate','none');
  imp(host,'float','none');
  imp(host,'box-sizing','border-box');
  imp(host,'overflow','visible');

  qa('#mainApp>main>.nexa-stage-host>.nexa-stage-view').forEach(el=>{
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

function diagnostic(){
  const side=$('nfSide');
  const main=q('#mainApp>main');
  const host=$('nexaStageHost')||q('#mainApp .nexa-stage-host');
  const rec=q('.nexa-stage-view[data-stage="radar"]>.card.rec-zone');
  const sr=side?.getBoundingClientRect();
  const mr=main?.getBoundingClientRect();
  const hr=host?.getBoundingClientRect();
  const rr=rec?.getBoundingClientRect();
  const expected=(sr?.right||0)+16;
  const actual=rr?.left||hr?.left||0;
  const d={
    sideRight:Math.round(sr?.right||0),
    mainLeft:Math.round(mr?.left||0),
    hostLeft:Math.round(hr?.left||0),
    recorderLeft:Math.round(rr?.left||0),
    expectedContentLeft:Math.round(expected),
    contentGap:Math.round(actual-expected),
    stageHostDirect:!!(main&&host&&host.parentElement===main),
    legacyPanelLeftCount:qa('#mainApp>main>.panel-left').length,
    legacyPanelRightVisible:qa('#mainApp>main>.panel-right').some(el=>getComputedStyle(el).display!=='none')
  };
  d.ok=d.stageHostDirect&&d.legacyPanelLeftCount===0&&!d.legacyPanelRightVisible&&Math.abs(d.contentGap)<=4;
  window.__NEXA_V18_5_LAYOUT_DIAGNOSTIC__=d;
  return d;
}

function normalize(){
  ensureBodyContract();
  installStyle();
  normalizeRadar();
  recoverFinalStageHost();
  lockGeometry();
  normalizeRadar();
  lockGeometry();
  diagnostic();
}

function init(){
  normalize();
  let n=0;
  const warm=setInterval(()=>{normalize();if(++n>40)clearInterval(warm)},250);
  const obs=new MutationObserver(()=>{
    clearTimeout(window.__nf185Mut);
    window.__nf185Mut=setTimeout(normalize,30);
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('resize',()=>setTimeout(normalize,30),{passive:true});
  addEventListener('pageshow',()=>setTimeout(normalize,20));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(normalize,20)});
  document.addEventListener('click',()=>setTimeout(normalize,0),true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();

/* NEXA v18.6 · detached clinical stage host · 2026-09-05
   The active clinical UI no longer participates in the legacy <main> grid at all.
   #nexaStageHost is mounted directly under <body> and positioned from the final sidebar/topbar. */
(()=>{
'use strict';
if(window.__NEXA_LAYOUT_FLOW_V18_6__)return;
window.__NEXA_LAYOUT_FLOW_V18_6__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const imp=(el,prop,val)=>el?.style?.setProperty(prop,val,'important');
const isDesktop=()=>matchMedia('(min-width:821px)').matches;
const activeDoctorSession=()=>document.body.classList.contains('nexa-doctor-view')&&!document.body.classList.contains('doctor-home-open');

function ensureBodyContract(){document.body?.classList.add('nexa-v340')}

function installStyle(){
  let s=$('nf186LayoutStyle');
  if(!s){
    s=document.createElement('style');
    s.id='nf186LayoutStyle';
    s.textContent=`
@media(min-width:821px){
  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open) #mainApp>main{
    display:none!important;
  }

  html body.nexa-v340.nexa-doctor-view:not(.doctor-home-open)>#nexaStageHost{
    display:block!important;
    position:relative!important;
    inset:auto!important;
    width:calc(100vw - var(--nf-side,214px) - 32px)!important;
    min-width:0!important;
    max-width:none!important;
    height:auto!important;
    margin:0 16px 20px calc(var(--nf-side,214px) + 16px)!important;
    padding:calc(var(--nf-top,72px) + 16px) 0 0!important;
    transform:none!important;
    translate:none!important;
    float:none!important;
    clear:both!important;
    box-sizing:border-box!important;
    overflow:visible!important;
    background:transparent!important;
    z-index:1!important;
  }

  html body.nexa-v340.doctor-home-open>#nexaStageHost,
  html body.nexa-v340.nexa-auditor-view>#nexaStageHost{
    display:none!important;
  }

  html body.nexa-v340>#nexaStageHost>.nexa-stage-view{
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

  html body.nexa-v340>#nexaStageHost>.nexa-stage-view[data-stage="radar"].active{
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

  html body.nexa-v340>#nexaStageHost>.nexa-stage-view[data-stage="radar"]>.card.rec-zone{
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

  html body.nexa-v340>#nexaStageHost .card.rec-zone>#nfRecMain{
    grid-column:1!important;
    grid-row:1!important;
    width:100%!important;
    min-width:0!important;
  }

  html body.nexa-v340>#nexaStageHost .card.rec-zone>#nfQuick{
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

  html body.nexa-v340>#nexaStageHost .nexa-stage-view[data-stage="radar"]>#realtimeRadarCard{
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

  html body.nexa-v340>#nexaStageHost #realtimeRadarCard>#nexaDispositionCard,
  html body.nexa-v340>#nexaStageHost #nexaDispositionCard{
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

  html body.nexa-v340>#nexaStageHost .nexa-stage-view[data-stage="radar"]>#nfSummary{
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

  html body.nexa-v340>#nexaStageHost .nexa-stage-view[data-stage="radar"]>#nexaRadarAlertsDock{
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
  html body.nexa-v340>#nexaStageHost>.nexa-stage-view[data-stage="radar"].active{
    grid-template-columns:minmax(0,1fr) minmax(285px,.72fr)!important;
  }
  html body.nexa-v340>#nexaStageHost .nexa-stage-view[data-stage="radar"]>.card.rec-zone{
    grid-template-columns:minmax(0,1fr) 260px!important;
  }
}
`;
    document.head.appendChild(s);
  }
  if(document.head.lastElementChild!==s)document.head.appendChild(s);
}

function detachStageHost(){
  const host=$('nexaStageHost')||q('#mainApp .nexa-stage-host');
  if(!host)return null;

  // Only detach once the stage builder already moved the live clinical controls into the host.
  const ownsClinicalUi=!!(host.querySelector('#recBtn')&&host.querySelector('#realtimeRadarCard'));
  if(ownsClinicalUi&&host.parentElement!==document.body)document.body.appendChild(host);
  return host;
}

function normalizeRadar(host){
  const stage=host?.querySelector('.nexa-stage-view[data-stage="radar"]');
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

function lockDetachedGeometry(host){
  if(!isDesktop()||!host)return;
  const main=q('#mainApp>main');

  if(activeDoctorSession()){
    if(main)imp(main,'display','none');
    imp(host,'display','block');
    imp(host,'position','relative');
    imp(host,'left','auto');
    imp(host,'right','auto');
    imp(host,'top','auto');
    imp(host,'bottom','auto');
    imp(host,'width','calc(100vw - var(--nf-side,214px) - 32px)');
    imp(host,'min-width','0');
    imp(host,'max-width','none');
    imp(host,'height','auto');
    imp(host,'margin','0 16px 20px calc(var(--nf-side,214px) + 16px)');
    imp(host,'padding','calc(var(--nf-top,72px) + 16px) 0 0');
    imp(host,'transform','none');
    imp(host,'translate','none');
    imp(host,'float','none');
    imp(host,'box-sizing','border-box');
    imp(host,'overflow','visible');
    imp(host,'background','transparent');
  }else{
    imp(host,'display','none');
  }
}

function diagnostic(host){
  const side=$('nfSide');
  const rec=host?.querySelector('.nexa-stage-view[data-stage="radar"]>.card.rec-zone');
  const sr=side?.getBoundingClientRect();
  const hr=host?.getBoundingClientRect();
  const rr=rec?.getBoundingClientRect();
  const expected=(sr?.right||0)+16;
  const actual=rr?.left||hr?.left||0;
  const d={
    sideRight:Math.round(sr?.right||0),
    hostLeft:Math.round(hr?.left||0),
    recorderLeft:Math.round(rr?.left||0),
    expectedContentLeft:Math.round(expected),
    contentGap:Math.round(actual-expected),
    hostAtBody:!!(host&&host.parentElement===document.body),
    mainHidden:activeDoctorSession()?getComputedStyle(q('#mainApp>main')).display==='none':true,
    legacyPanelLeftVisible:qa('#mainApp>main>.panel-left').some(el=>getComputedStyle(el).display!=='none'),
    legacyPanelRightVisible:qa('#mainApp>main>.panel-right').some(el=>getComputedStyle(el).display!=='none')
  };
  d.ok=d.hostAtBody&&d.mainHidden&&Math.abs(d.contentGap)<=4;
  window.__NEXA_V18_6_LAYOUT_DIAGNOSTIC__=d;
  return d;
}

function normalize(){
  ensureBodyContract();
  installStyle();
  const host=detachStageHost();
  if(!host)return;
  normalizeRadar(host);
  lockDetachedGeometry(host);
  normalizeRadar(host);
  diagnostic(host);
}

function init(){
  normalize();
  let n=0;
  const warm=setInterval(()=>{normalize();if(++n>60)clearInterval(warm)},200);
  const obs=new MutationObserver(()=>{
    clearTimeout(window.__nf186Mut);
    window.__nf186Mut=setTimeout(normalize,20);
  });
  obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  addEventListener('resize',()=>setTimeout(normalize,20),{passive:true});
  addEventListener('pageshow',()=>setTimeout(normalize,20));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(normalize,20)});
  document.addEventListener('click',()=>setTimeout(normalize,0),true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();

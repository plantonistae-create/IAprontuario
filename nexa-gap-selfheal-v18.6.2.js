/* NEXA v18.6.2 · desktop gap self-heal · 2026-09-05
   Keeps the Radar in the stable native <main> and corrects only the measured
   horizontal gap between the final sidebar and the clinical content. */
(()=>{
'use strict';
if(window.__NEXA_GAP_SELFHEAL_V18_6_2__)return;
window.__NEXA_GAP_SELFHEAL_V18_6_2__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
const imp=(el,p,v)=>el?.style?.setProperty(p,v,'important');
const desktop=()=>matchMedia('(min-width:821px)').matches;
let raf=0;

function align(){
  if(!desktop())return;
  const side=$('nfSide');
  const main=q('#mainApp>main');
  const host=$('nexaStageHost')||q('#mainApp .nexa-stage-host');
  const stage=host?.querySelector('.nexa-stage-view[data-stage="radar"]');
  const rec=stage?.querySelector(':scope>.card.rec-zone');
  const radar=stage?.querySelector(':scope>#realtimeRadarCard');
  if(!side||!main||!host||!stage||!rec||!radar)return;

  // Never detach/hide the clinical root: v18.6.1 proved that path unsafe.
  if(host.parentElement!==main)main.prepend(host);
  stage.hidden=false;
  if((document.body.dataset.nexaStage||'radar')==='radar')stage.classList.add('active');

  // First-line defense against the original two-column legacy main grid.
  imp(main,'display','block');
  imp(main,'grid-template-columns','minmax(0,1fr)');
  imp(main,'grid-template-rows','auto');
  imp(main,'column-gap','0');
  imp(main,'row-gap','0');
  imp(main,'gap','0');
  imp(main,'align-items','start');
  imp(host,'grid-column','1 / -1');
  imp(host,'grid-row','1');
  imp(host,'min-width','0');
  imp(host,'max-width','none');
  imp(host,'box-sizing','border-box');

  // Measure the real rendered gap. If any legacy rule still adds an offset,
  // counter-shift the host by exactly that amount instead of guessing pixels.
  const sr=side.getBoundingClientRect();
  const rr=rec.getBoundingClientRect();
  if(!rr.width||!sr.width)return;
  const expected=sr.right+16;
  const actual=rr.left;
  const residual=actual-expected;
  const previous=Number(host.dataset.nexaGapCorrection||0);
  let correction=previous+residual;
  if(Math.abs(correction)<1)correction=0;
  correction=Math.max(-600,Math.min(600,correction));

  host.dataset.nexaGapCorrection=String(correction);
  imp(host,'position','relative');
  imp(host,'left',`${-correction}px`);
  imp(host,'margin-left','0');
  imp(host,'margin-right','0');
  imp(host,'transform','none');
  imp(host,'translate','none');
  if(correction>=0)imp(host,'width',`calc(100% + ${correction}px)`);
  else imp(host,'width',`calc(100% - ${Math.abs(correction)}px)`);

  const after=rec.getBoundingClientRect();
  window.__NEXA_V18_6_2_GAP_DIAGNOSTIC__={
    sideRight:Math.round(sr.right),
    expectedLeft:Math.round(expected),
    beforeLeft:Math.round(actual),
    afterLeft:Math.round(after.left),
    residualBefore:Math.round(residual),
    appliedCorrection:Math.round(correction),
    residualAfter:Math.round(after.left-expected),
    radarVisible:getComputedStyle(radar).display!=='none'&&radar.getBoundingClientRect().height>0,
    hostInMain:host.parentElement===main,
    mainDisplay:getComputedStyle(main).display,
    mainGridColumns:getComputedStyle(main).gridTemplateColumns
  };
}

function schedule(){
  cancelAnimationFrame(raf);
  raf=requestAnimationFrame(()=>requestAnimationFrame(align));
}

function init(){
  schedule();
  let n=0;
  const warm=setInterval(()=>{schedule();if(++n>60)clearInterval(warm)},200);
  const obs=new MutationObserver(schedule);
  obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','style']});
  addEventListener('resize',schedule,{passive:true});
  addEventListener('pageshow',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  document.addEventListener('click',()=>setTimeout(schedule,0),true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();

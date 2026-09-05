/* NEXA v18.6.1 · emergency radar restore · 2026-09-05
   Rolls back the detached-stage experiment that could hide the clinical Radar.
   Restores the stage host under the native <main> and delegates geometry to the
   previously stable v18.5 layout flow while keeping audit autosave enabled. */
(()=>{
'use strict';
if(window.__NEXA_LAYOUT_FLOW_V18_6_1__)return;
window.__NEXA_LAYOUT_FLOW_V18_6_1__=true;

const restoreNativeClinicalRoot=()=>{
  const main=document.querySelector('#mainApp>main');
  const host=document.getElementById('nexaStageHost')||document.querySelector('.nexa-stage-host');
  if(main){
    main.style.removeProperty('display');
    main.style.removeProperty('visibility');
    main.style.removeProperty('pointer-events');
  }
  if(main&&host&&host.parentElement!==main)main.prepend(host);
  if(host){
    ['display','position','inset','left','right','top','bottom','width','min-width','max-width','height','margin','padding','transform','translate','float','clear','z-index','background'].forEach(p=>host.style.removeProperty(p));
  }
  return {main,host};
};

const loadStableFlow=()=>{
  if(window.__NEXA_LAYOUT_FLOW_V18_5__)return;
  const existing=document.querySelector('script[data-nexa-v185-restore]');
  if(existing)return;
  const s=document.createElement('script');
  s.src='./nexa-layout-flow-v18.5.js?v=20260905-v1861';
  s.async=false;
  s.dataset.nexaV185Restore='1';
  s.onerror=()=>console.error('NEXA: falha ao restaurar layout clínico v18.5');
  document.head.appendChild(s);
};

function recover(){
  const {host}=restoreNativeClinicalRoot();
  loadStableFlow();
  const radar=host?.querySelector('.nexa-stage-view[data-stage="radar"]');
  if(radar){
    radar.hidden=false;
    if((document.body.dataset.nexaStage||'radar')==='radar')radar.classList.add('active');
  }
}

recover();
let n=0;
const warm=setInterval(()=>{recover();if(++n>40)clearInterval(warm)},250);
addEventListener('pageshow',()=>setTimeout(recover,20));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(recover,20)});
})();

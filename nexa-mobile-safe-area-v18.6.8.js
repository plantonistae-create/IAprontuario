/* NEXA v18.6.8 · mobile safe-area + scroll origin guard · 2026-09-05 */
(()=>{
'use strict';
if(window.__NEXA_MOBILE_SAFE_AREA_V18_6_8__)return;
window.__NEXA_MOBILE_SAFE_AREA_V18_6_8__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
const mobile=()=>matchMedia('(max-width:900px)').matches;

function installStyles(){
  if($('nexaMobileSafeAreaV1868Style'))return;
  const s=document.createElement('style');
  s.id='nexaMobileSafeAreaV1868Style';
  s.textContent=`
@media(max-width:900px){
 :root{--nm-header-live:calc(116px + env(safe-area-inset-top,0px));--nm-bottom-live:calc(70px + env(safe-area-inset-bottom,0px))}
 html.nexa-mobile-v1867,html.nexa-mobile-v1867 body{scroll-padding-top:calc(var(--nm-header-live) + 12px)!important}
 #nexaMobileHeader{height:auto!important;min-height:calc(116px + env(safe-area-inset-top,0px))!important;padding-top:env(safe-area-inset-top,0px)!important;box-sizing:border-box!important}
 #nexaMobileBottomNav{height:auto!important;min-height:calc(70px + env(safe-area-inset-bottom,0px))!important;box-sizing:border-box!important}
 body.nexa-v340 #mainApp>main,#mainApp>main{padding-top:calc(var(--nm-header-live) + 12px)!important;padding-bottom:calc(var(--nm-bottom-live) + 18px)!important;scroll-margin-top:var(--nm-header-live)!important}
 html.nexa-mobile-v1867 #nexaStageHost{scroll-margin-top:calc(var(--nm-header-live) + 12px)!important}
 html.nexa-mobile-v1867 #nexaStageHost>.nexa-stage-view.active{scroll-margin-top:calc(var(--nm-header-live) + 12px)!important}
 html.nexa-mobile-v1867 #nexaStageHost>.nexa-stage-view.active>:first-child{margin-top:0!important}
}
`;
  document.head.appendChild(s);
}

function measureOffsets(){
  if(!mobile())return;
  const header=$('nexaMobileHeader');
  const bottom=$('nexaMobileBottomNav');
  const root=document.documentElement;
  const headerH=Math.max(116,Math.ceil(header?.offsetHeight||0));
  const bottomH=Math.max(70,Math.ceil(bottom?.offsetHeight||0));
  root.style.setProperty('--nm-header-live',`${headerH}px`);
  root.style.setProperty('--nm-bottom-live',`${bottomH}px`);
  window.__NEXA_V18_6_8_SAFE_AREA_DIAGNOSTIC__={headerH,bottomH,topReset:true};
}

function resetScrollOrigin(){
  if(!mobile())return;
  const nodes=[
    document.scrollingElement,
    document.documentElement,
    document.body,
    q('#mainApp>main'),
    $('nexaStageHost'),
    q('#nexaStageHost>.nexa-stage-view.active')
  ].filter(Boolean);
  nodes.forEach(el=>{
    try{el.scrollTop=0}catch{}
    try{el.scrollLeft=0}catch{}
  });
  try{window.scrollTo({top:0,left:0,behavior:'auto'})}catch{try{window.scrollTo(0,0)}catch{}}
}

function settle(reset=false){
  if(!mobile())return;
  installStyles();
  measureOffsets();
  if(reset)resetScrollOrigin();
  setTimeout(()=>{measureOffsets();if(reset)resetScrollOrigin()},40);
  setTimeout(()=>{measureOffsets();if(reset)resetScrollOrigin()},180);
}

try{history.scrollRestoration='manual'}catch{}
installStyles();
settle(true);
[80,250,600,1200].forEach(ms=>setTimeout(()=>settle(ms<300),ms));

addEventListener('pageshow',()=>settle(true));
addEventListener('resize',()=>settle(false),{passive:true});
addEventListener('orientationchange',()=>setTimeout(()=>settle(true),100),{passive:true});
visualViewport?.addEventListener?.('resize',()=>settle(false),{passive:true});
document.addEventListener('click',e=>{
  if(!mobile())return;
  if(e.target.closest?.('#nexaMobileBottomNav [data-mobile-stage],[data-go],.nexa-session-tab[data-stage]')){
    setTimeout(()=>settle(true),30);
  }
},true);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)settle(false)});
})();

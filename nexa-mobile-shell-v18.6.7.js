/* NEXA v18.6.7 · dedicated mobile shell · 2026-09-05
   Restores the clinical bottom navigation and isolates mobile geometry from the
   fixed desktop canvas. Mobile follows the approved reference: dark compact
   header, Radar/Pending/Alerts strip, stacked clinical content and five fixed tabs. */
(()=>{
'use strict';
if(window.__NEXA_MOBILE_SHELL_V18_6_7__)return;
window.__NEXA_MOBILE_SHELL_V18_6_7__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const MOBILE='(max-width:900px)';
const stages=['radar','summary','hypothesis','plan','history'];
const labels={radar:'Radar',summary:'Resumo',hypothesis:'Hipótese',plan:'Plano',history:'Histórico'};
const mql=matchMedia(MOBILE);

function icon(name){
  const paths={
    radar:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/>',
    summary:'<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h6"/>',
    hypothesis:'<path d="M12 3l7 7-7 11L5 10l7-7z"/>',
    plan:'<path d="M4 7h16M4 12h16M4 17h11"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 7v6l4 2"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]||''}</svg>`;
}

function currentStage(){
  const bodyStage=document.body?.dataset?.nexaStage;
  if(stages.includes(bodyStage))return bodyStage;
  const active=q('.nexa-stage-view.active:not([hidden])')?.dataset?.stage;
  return stages.includes(active)?active:'radar';
}

function activateStage(stage){
  if(!stages.includes(stage))stage='radar';
  const native=$('nfSide')?.querySelector(`[data-go="${stage}"]`)||q(`.nexa-session-tab[data-stage="${stage}"]`);
  if(native){
    try{native.click()}catch{}
  }else{
    qa('.nexa-stage-view').forEach(view=>{
      const on=view.dataset.stage===stage;
      view.hidden=!on;
      view.classList.toggle('active',on);
    });
    document.body.dataset.nexaStage=stage;
    document.body.setAttribute('data-nexa-stage',stage);
  }
  syncActive(stage);
  try{scrollTo({top:0,left:0,behavior:'auto'})}catch{}
  if(stage==='history')setTimeout(()=>window.nexaRefreshDraftHistory?.(),60);
}

function syncActive(stage=currentStage()){
  qa('#nexaMobileBottomNav [data-mobile-stage]').forEach(btn=>{
    const on=btn.dataset.mobileStage===stage;
    btn.classList.toggle('active',on);
    btn.setAttribute('aria-current',on?'page':'false');
  });
}

function metric(){
  let score=0,pending=0,alerts=0;
  try{
    const text=$('realtimeRadarCard')?.innerText||'';
    const match=text.match(/(\d{1,3})\s*%/);
    if(match)score=Math.max(0,Math.min(100,Number(match[1])||0));
    if(Array.isArray(window.radarState?.questions))pending=window.radarState.questions.length;
    if(Array.isArray(window.radarState?.alerts))alerts=window.radarState.alerts.length;
  }catch{}
  if(!score){
    const m=($('nfScoreText')?.textContent||$('nfScore')?.textContent||'').match(/(\d{1,3})/);
    if(m)score=Number(m[1])||0;
  }
  return{score,pending,alerts};
}

function syncMetrics(){
  const m=metric();
  if($('nmRadarValue'))$('nmRadarValue').textContent=`Radar ${m.score}%`;
  if($('nmPendingValue'))$('nmPendingValue').textContent=`${m.pending} pendência${m.pending===1?'':'s'}`;
  if($('nmAlertValue'))$('nmAlertValue').textContent=`${m.alerts} alerta${m.alerts===1?'':'s'}`;
}

function toggleTheme(){
  if($('nfThemeToggle')){try{$('nfThemeToggle').click();return}catch{}}
  const html=document.documentElement;
  const dark=html.dataset.theme==='dark'||html.dataset.nexaTheme==='dark';
  const next=dark?'light':'dark';
  html.dataset.theme=next;html.dataset.nexaTheme=next;
  try{localStorage.setItem('nexa-theme',next)}catch{}
}

function openDrawer(on=true){
  const d=$('nexaMobileDrawer'),o=$('nexaMobileDrawerOverlay');
  if(!d||!o)return;
  d.classList.toggle('open',on);o.classList.toggle('open',on);
  document.documentElement.classList.toggle('nm-drawer-lock',on);
}
function clickExisting(...ids){for(const id of ids){const el=$(id);if(el){try{el.click();return true}catch{}}}return false}

function ensureHeader(){
  if($('nexaMobileHeader'))return;
  const header=document.createElement('header');
  header.id='nexaMobileHeader';
  header.innerHTML=`
    <div class="nm-head-main">
      <button type="button" id="nmMenu" class="nm-icon-btn" aria-label="Abrir menu">☰</button>
      <div class="nm-brand"><b>NEXA</b><span>CLINICAL</span></div>
      <div class="nm-head-spacer"></div>
      <button type="button" id="nmTheme" class="nm-icon-btn" aria-label="Alternar tema">◐</button>
      <button type="button" id="nmMore" class="nm-icon-btn" aria-label="Abrir menu">⋮</button>
    </div>
    <div class="nm-metrics">
      <div><span id="nmRadarValue">Radar 0%</span><i class="nm-ring"></i></div>
      <div><i class="nm-dot orange"></i><span id="nmPendingValue">0 pendências</span></div>
      <div><i class="nm-dot red"></i><span id="nmAlertValue">0 alertas</span></div>
    </div>`;
  document.body.appendChild(header);
  $('nmMenu').onclick=()=>openDrawer(true);
  $('nmMore').onclick=()=>openDrawer(true);
  $('nmTheme').onclick=toggleTheme;
}

function ensureDrawer(){
  if($('nexaMobileDrawer'))return;
  const overlay=document.createElement('div');overlay.id='nexaMobileDrawerOverlay';
  const drawer=document.createElement('aside');drawer.id='nexaMobileDrawer';
  drawer.innerHTML=`
    <div class="nm-drawer-head"><div class="nm-brand"><b>NEXA</b><span>CLINICAL</span></div><button id="nmDrawerClose" type="button">×</button></div>
    <button data-mobile-open="protocols">Protocolos</button>
    <button data-mobile-open="calculators">Calculadoras</button>
    <button data-mobile-open="radiology">Radiologia</button>
    <button data-mobile-open="ecg">ECG</button>
    <button data-mobile-open="audit">Auditoria</button>`;
  document.body.append(overlay,drawer);
  overlay.onclick=()=>openDrawer(false);$('nmDrawerClose').onclick=()=>openDrawer(false);
  drawer.addEventListener('click',e=>{
    const b=e.target.closest('[data-mobile-open]');if(!b)return;
    const type=b.dataset.mobileOpen;openDrawer(false);
    if(type==='protocols')clickExisting('navProtocolsBtn','clinicalIntelligenceBtn');
    if(type==='calculators')clickExisting('clinicalIntelligenceBtn');
    if(type==='radiology')clickExisting('navRadiologyBtn');
    if(type==='ecg')clickExisting('navEcgBtn','navECGBtn');
    if(type==='audit')clickExisting('navAuditBtn','coreAdminBtn');
  });
}

function ensureBottomNav(){
  if($('nexaMobileBottomNav'))return;
  const nav=document.createElement('nav');
  nav.id='nexaMobileBottomNav';nav.setAttribute('aria-label','Navegação clínica');
  nav.innerHTML=stages.map(stage=>`<button type="button" data-mobile-stage="${stage}">${icon(stage)}<span>${labels[stage]}</span></button>`).join('');
  nav.addEventListener('click',e=>{const b=e.target.closest('[data-mobile-stage]');if(b)activateStage(b.dataset.mobileStage)});
  document.body.appendChild(nav);
  syncActive();
}

function installStyles(){
  if($('nexaMobileShellV1867Style'))return;
  const s=document.createElement('style');s.id='nexaMobileShellV1867Style';s.textContent=`
html.nexa-mobile-v1867,html.nexa-mobile-v1867 body{overflow-x:hidden!important;background:var(--nf-bg,#f5f8fb)!important}
html.nexa-mobile-v1867.nm-drawer-lock,html.nexa-mobile-v1867.nm-drawer-lock body{overflow:hidden!important}
#nexaMobileHeader,#nexaMobileBottomNav,#nexaMobileDrawer,#nexaMobileDrawerOverlay{display:none}
@media(max-width:900px){
 :root{--nm-header:116px;--nm-bottom:70px}
 body.nexa-v340 #nfSide,body.nexa-v340 #nfTop,#nfSide,#nfTop{display:none!important}
 body.nexa-v340 #mainApp>main,#mainApp>main{display:block!important;position:relative!important;margin:0!important;width:100%!important;max-width:none!important;min-width:0!important;padding:calc(var(--nm-header) + env(safe-area-inset-top,0px) + 12px) 12px calc(var(--nm-bottom) + env(safe-area-inset-bottom,0px) + 18px)!important;background:var(--nf-bg,#f5f8fb)!important;overflow:visible!important}
 html.nexa-mobile-v1867 #nexaStageHost,html.nexa-mobile-v1867 body.nexa-v340 #mainApp>main #nexaStageHost{display:block!important;position:relative!important;inset:auto!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;width:100%!important;max-width:none!important;min-width:0!important;height:auto!important;min-height:calc(100dvh - var(--nm-header) - var(--nm-bottom))!important;margin:0!important;padding:0!important;overflow:visible!important;transform:none!important;background:transparent!important}
 html.nexa-mobile-v1867 #nexaStageHost>.nexa-stage-view,html.nexa-mobile-v1867 #nexaStageHost>.nexa-stage-view.active{position:relative!important;inset:auto!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;width:100%!important;max-width:none!important;min-width:0!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;transform:none!important}
 html.nexa-mobile-v1867 #nexaStageHost>.nexa-stage-view[data-stage="radar"].active{display:block!important}
 html.nexa-mobile-v1867 #nexaStageHost>.nexa-stage-view[data-stage="radar"].active>*{width:100%!important;max-width:none!important;margin:0 0 12px!important;box-sizing:border-box!important}
 html.nexa-mobile-v1867 .nexa-stage-view[data-stage="summary"].active,html.nexa-mobile-v1867 .nexa-stage-view[data-stage="hypothesis"].active,html.nexa-mobile-v1867 .nexa-stage-view[data-stage="plan"].active,html.nexa-mobile-v1867 .nexa-stage-view[data-stage="history"].active{display:block!important;width:100%!important;max-width:none!important;margin:0!important}
 html.nexa-mobile-v1867 .nexa-stage-view[data-stage="radar"]>.card.rec-zone{display:block!important;grid-template-columns:1fr!important;grid-template-areas:none!important;min-height:0!important;padding:14px!important;margin:0 0 12px!important;border-radius:12px!important}
 html.nexa-mobile-v1867 #nfQuick{display:none!important}
 html.nexa-mobile-v1867 #nfRecMain{width:100%!important;min-width:0!important}
 html.nexa-mobile-v1867 #nfRecHead{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:10px!important;padding-bottom:12px!important}
 html.nexa-mobile-v1867 #nfConsent{justify-self:auto!important;max-width:none!important;width:100%!important}
 html.nexa-mobile-v1867 #nfRecBody{display:grid!important;grid-template-columns:118px minmax(0,1fr)!important;grid-template-areas:'mic state' 'mic timer' 'wave wave' 'meta meta'!important;gap:8px 12px!important;min-height:0!important;padding:14px 0 10px!important}
 html.nexa-mobile-v1867 .nexa-stage-view[data-stage="radar"] #recBtn{width:92px!important;height:92px!important;margin:0 auto!important}
 html.nexa-mobile-v1867 .nexa-stage-view[data-stage="radar"] #timer{font-size:44px!important}
 html.nexa-mobile-v1867 .nexa-stage-view[data-stage="radar"] #wave{height:50px!important}
 html.nexa-mobile-v1867 #nfRecActions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:9px!important}
 html.nexa-mobile-v1867 #nfRecActions button{min-width:0!important;height:48px!important}
 html.nexa-mobile-v1867 #nfStart,html.nexa-mobile-v1867 #nfProcess,html.nexa-mobile-v1867 #nfClear{grid-column:1/-1!important}
 html.nexa-mobile-v1867 #realtimeRadarCard,html.nexa-mobile-v1867 #nfSummary,html.nexa-mobile-v1867 #nfAlerts{width:100%!important;max-width:none!important}
 #nexaMobileHeader{display:block;position:fixed;z-index:18000;left:0;right:0;top:0;height:calc(var(--nm-header) + env(safe-area-inset-top,0px));padding-top:env(safe-area-inset-top,0px);background:#071b2c;color:#fff;border-bottom:1px solid rgba(255,255,255,.09);box-shadow:0 4px 18px rgba(0,0,0,.13);box-sizing:border-box}
 .nm-head-main{height:58px;display:flex;align-items:center;gap:10px;padding:0 14px}.nm-head-spacer{flex:1}.nm-brand{display:flex;align-items:baseline;gap:5px}.nm-brand b{font-size:22px;letter-spacing:.02em;color:#18d6b8}.nm-brand span{font-size:10px;font-weight:850;letter-spacing:.08em;color:#f2f8fb}.nm-icon-btn{width:38px;height:38px;border:0;background:transparent;color:#fff;font-size:22px;display:grid;place-items:center;border-radius:9px}.nm-icon-btn:active{background:rgba(255,255,255,.08)}
 .nm-metrics{height:58px;display:grid;grid-template-columns:1.05fr 1fr 1fr;gap:8px;padding:0 12px 9px;box-sizing:border-box}.nm-metrics>div{min-width:0;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:rgba(255,255,255,.025);display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;font-weight:800;white-space:nowrap}.nm-ring{width:23px;height:23px;border:3px solid #16d7bd;border-left-color:rgba(22,215,189,.2);border-radius:50%;box-sizing:border-box}.nm-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}.nm-dot.orange{background:#ff9a24}.nm-dot.red{background:#ff3655}
 #nexaMobileBottomNav{display:grid!important;position:fixed!important;z-index:18000!important;left:0!important;right:0!important;bottom:0!important;height:calc(var(--nm-bottom) + env(safe-area-inset-bottom,0px));padding:5px 8px env(safe-area-inset-bottom,0px)!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:2px!important;background:#071b2c!important;border-top:1px solid rgba(255,255,255,.1)!important;box-shadow:0 -5px 18px rgba(0,0,0,.15)!important;box-sizing:border-box!important}
 #nexaMobileBottomNav button{appearance:none;border:0;background:transparent;color:#aebdca;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:9px;padding:4px 2px;font-size:10px;font-weight:760;line-height:1.05}
 #nexaMobileBottomNav button svg{width:21px;height:21px;display:block;flex:0 0 auto}
 #nexaMobileBottomNav button.active{color:#16d7bd;background:rgba(22,215,189,.08)}
 #nexaMobileDrawerOverlay{display:block;position:fixed;z-index:18500;inset:0;background:rgba(0,0,0,.42);opacity:0;pointer-events:none;transition:opacity .16s}
 #nexaMobileDrawerOverlay.open{opacity:1;pointer-events:auto}
 #nexaMobileDrawer{display:flex;position:fixed;z-index:18600;left:0;top:0;bottom:0;width:min(310px,84vw);padding:calc(14px + env(safe-area-inset-top,0px)) 12px calc(18px + env(safe-area-inset-bottom,0px));background:#071b2c;color:white;flex-direction:column;gap:6px;transform:translateX(-102%);transition:transform .18s;box-shadow:12px 0 30px rgba(0,0,0,.24)}
 #nexaMobileDrawer.open{transform:translateX(0)}.nm-drawer-head{height:48px;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.nm-drawer-head>button{width:38px;height:38px;border:0;border-radius:9px;background:rgba(255,255,255,.07);color:#fff;font-size:26px}.nm-drawer-head~button{height:47px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(255,255,255,.025);color:#eaf3f7;text-align:left;padding:0 13px;font-weight:780}
}
@media(max-width:430px){
 .nm-metrics{gap:5px;padding-left:8px;padding-right:8px}.nm-metrics>div{font-size:10px;gap:5px}.nm-ring{width:20px;height:20px}
 html.nexa-mobile-v1867 #nfRecBody{grid-template-columns:104px minmax(0,1fr)!important}.nexa-stage-view[data-stage="radar"] #timer{font-size:39px!important}
}
`;
  document.head.appendChild(s);
}

function syncMode(){
  const mobile=mql.matches;
  document.documentElement.classList.toggle('nexa-mobile-v1867',mobile);
  if(mobile){ensureHeader();ensureDrawer();ensureBottomNav();syncActive();syncMetrics()}
  else openDrawer(false);
}

function boot(){installStyles();syncMode()}
boot();
if(mql.addEventListener)mql.addEventListener('change',syncMode);else mql.addListener?.(syncMode);
addEventListener('resize',syncMode,{passive:true});
addEventListener('orientationchange',()=>setTimeout(syncMode,80),{passive:true});
document.addEventListener('click',e=>{
  if(!mql.matches)return;
  if(e.target.closest?.('[data-go],.nexa-session-tab[data-stage]'))setTimeout(()=>{syncActive();syncMetrics()},20);
},true);
[100,350,800,1600,3000].forEach(ms=>setTimeout(()=>{syncMode();syncMetrics()},ms));
setInterval(()=>{if(mql.matches){syncActive();syncMetrics()}},1500);

window.__NEXA_V18_6_7_MOBILE_DIAGNOSTIC__={bottomNav:true,dedicatedHeader:true,desktopCanvasIsolated:true,breakpoint:900};
})();

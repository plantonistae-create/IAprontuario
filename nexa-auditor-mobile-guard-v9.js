/* NEXA mobile stability + auditor workspace v9 */
(()=>{
'use strict';
if(window.__NEXA_AUDITOR_MOBILE_GUARD_V9__) return;
window.__NEXA_AUDITOR_MOBILE_GUARD_V9__=true;
const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const mobile=()=>window.matchMedia('(max-width:820px)').matches;
const privileged=()=>document.body.classList.contains('nexa-privileged')||$('nexaRoleSwitchBtn')?.classList.contains('admin-visible')||$('nexaRoleSwitchBtn')?.offsetParent!==null;

function closeClinical(){
  const m=$('clinicalModal');
  if(!m)return;
  m.classList.remove('open');
  document.body.classList.remove('modal-open');
  document.documentElement.classList.remove('n9-modal-lock');
}
function stabilizeClinical(){
  const m=$('clinicalModal');
  if(!m)return;
  if(!$('n9ClinicalClose')){
    const b=document.createElement('button');
    b.id='n9ClinicalClose';b.type='button';b.setAttribute('aria-label','Fechar assistente clínico');b.textContent='×';
    b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();$('closeClinicalBtn')?.click();closeClinical()},true);
    m.appendChild(b);
  }
  const observer=new MutationObserver(()=>{
    if(m.classList.contains('open')){
      document.documentElement.classList.add('n9-modal-lock');
      const d=m.querySelector('.dialog');if(d){d.scrollTop=0;try{d.scrollTo(0,0)}catch{}}
    }else document.documentElement.classList.remove('n9-modal-lock');
  });
  observer.observe(m,{attributes:true,attributeFilter:['class']});
}

function recordingActive(){
  const rec=$('recBtn')||q('.rec-btn');
  const pause=$('nexaDesktopPause')||$('nexaRadarPauseProxy');
  return !!(rec?.classList.contains('recording')||pause?.disabled===false&&/pausar|retomar/i.test(pause?.textContent||''));
}
function ensureRecordingControls(){
  const zone=q('.nexa-stage-view[data-stage="radar"] .rec-zone');
  const nativeConsent=$('consent');
  const nativeRec=$('recBtn')||zone?.querySelector('.rec-btn');
  if(!zone||!nativeRec)return;
  let box=$('n9RecordingStartBox');
  if(!box){
    box=document.createElement('div');box.id='n9RecordingStartBox';box.className='n9-record-start-box';
    box.innerHTML=`<label class="n9-consent"><input id="n9Consent" type="checkbox"><span>Confirmo que o paciente foi informado e autorizou a gravação para documentação desta consulta.</span></label><button type="button" id="n9StartRecording">● Iniciar gravação</button>`;
    zone.insertBefore(box,zone.firstChild);
    const mirror=$('n9Consent');
    mirror.checked=!!nativeConsent?.checked;
    mirror.addEventListener('change',()=>{
      if(nativeConsent){nativeConsent.checked=mirror.checked;nativeConsent.dispatchEvent(new Event('change',{bubbles:true}))}
      syncRecordingControls();
    });
    $('n9StartRecording').addEventListener('click',e=>{
      e.preventDefault();e.stopImmediatePropagation();
      if(nativeConsent&&!nativeConsent.checked){mirror.focus();return}
      nativeRec.click();
      setTimeout(syncRecordingControls,80);
    },true);
  }
  syncRecordingControls();
}
function syncRecordingControls(){
  const nativeConsent=$('consent');
  const mirror=$('n9Consent');
  const start=$('n9StartRecording');
  const active=recordingActive();
  if(mirror&&nativeConsent&&mirror.checked!==nativeConsent.checked)mirror.checked=nativeConsent.checked;
  if(start){
    start.disabled=!!nativeConsent&&!nativeConsent.checked;
    start.style.display=active?'none':'flex';
  }
  if(mirror)mirror.disabled=active;
  const box=$('n9RecordingStartBox');if(box)box.classList.toggle('is-recording',active);
}

function ensureAuditorDrawerButton(){
  const drawer=$('n7Drawer');if(!drawer)return;
  let b=$('n9AuditorDrawer');
  if(!privileged()){
    if(b)b.remove();return;
  }
  if(!b){
    b=document.createElement('button');b.id='n9AuditorDrawer';b.type='button';b.className='n9-auditor-drawer';
    const clear=$('n7DrawerClear');drawer.insertBefore(b,clear||null);
    b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();enterAuditor()},true);
  }
  b.textContent=document.body.classList.contains('nexa-auditor-view')?'← Modo médico':'♜ Auditoria';
}
function enterAuditor(){
  const drawer=$('n7Drawer'),overlay=$('n7Overlay');drawer?.classList.remove('on');overlay?.classList.remove('on');document.documentElement.classList.remove('n7-lock');
  const already=document.body.classList.contains('nexa-auditor-view');
  const role=$('nexaRoleSwitchBtn');
  if(role)role.click();
  else{
    document.body.classList.toggle('nexa-auditor-view',!already);
    document.body.classList.toggle('nexa-doctor-view',already);
  }
  setTimeout(syncAuditor,60);
}
function ensureAuditorHeader(){
  let h=$('n9AuditorHeader');
  if(!h){
    h=document.createElement('header');h.id='n9AuditorHeader';
    h.innerHTML='<div><b>NEXA</b><span> AUDITORIA</span></div><button type="button" id="n9AuditorBack">← Modo médico</button>';
    document.body.appendChild(h);
    $('n9AuditorBack').addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();enterAuditor()},true);
  }
}
function syncAuditor(){
  const on=document.body.classList.contains('nexa-auditor-view');
  document.body.classList.toggle('n9-auditor-mobile',on&&mobile());
  if(on&&mobile()){
    ensureAuditorHeader();
    const launch=q('.nexa-auditor-launch');
    if(launch){
      launch.style.setProperty('margin','0','important');
      launch.style.setProperty('margin-left','0','important');
      launch.style.setProperty('left','0','important');
      launch.style.setProperty('right','0','important');
      launch.style.setProperty('width','100%','important');
      launch.style.setProperty('max-width','none','important');
      launch.scrollTop=0;
    }
    const side=$('n7Sidebar');if(side)side.style.setProperty('display','none','important');
    try{window.scrollTo(0,0)}catch{}
  }else if(!on){
    const side=$('n7Sidebar');if(side)side.style.removeProperty('display');
  }
  ensureAuditorDrawerButton();
}

function addCss(){
  if($('nexaAuditorMobileGuardV9Style'))$('nexaAuditorMobileGuardV9Style').remove();
  const s=document.createElement('style');s.id='nexaAuditorMobileGuardV9Style';s.textContent=`
html.n9-modal-lock,html.n9-modal-lock body{overflow:hidden!important}
#n9ClinicalClose{display:none;position:fixed;z-index:2147483647;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));width:44px;height:44px;border-radius:12px;border:1px solid var(--hair,#dce6ec);background:var(--surface,#fff);color:var(--ink,#0b1727);font-size:30px;line-height:1;box-shadow:0 6px 24px rgba(0,0,0,.16)}
#clinicalModal.open #n9ClinicalClose{display:grid;place-items:center}
#clinicalModal{z-index:20000!important}
#clinicalModal.open{display:flex!important}
#clinicalModal .dialog{position:relative!important;z-index:20001!important}
#n9AuditorHeader{display:none}
.n9-record-start-box{display:grid;gap:10px;margin:0 0 16px;text-align:left}.n9-consent{display:flex!important;align-items:flex-start;gap:10px!important;margin:0!important;padding:11px 12px;border:1px solid var(--hair,#dce6ec);border-radius:10px;background:var(--surface2,#f7faf9);font-size:12px!important;font-weight:650!important;color:var(--ink,#0b1727)!important}.n9-consent input{width:20px!important;height:20px!important;min-width:20px!important;margin:0!important;accent-color:#0b9f8a}.n9-consent span{line-height:1.35}.n9-record-start-box.is-recording .n9-consent{opacity:.72}.n9-record-start-box #n9StartRecording{min-height:48px;border:0;border-radius:10px;background:#0e93ad;color:#fff;font-weight:900;font-size:15px;display:flex;align-items:center;justify-content:center;gap:8px}.n9-record-start-box #n9StartRecording:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:820px){
 #clinicalModal{inset:0!important;padding:0!important;align-items:stretch!important;background:var(--surface,#fff)!important}
 #clinicalModal .dialog{width:100%!important;height:100dvh!important;max-height:100dvh!important;margin:0!important;border:0!important;border-radius:0!important;overflow-y:auto!important;overscroll-behavior:contain!important;padding:0 14px max(28px,env(safe-area-inset-bottom))!important}
 #clinicalModal .modal-head{position:sticky!important;top:0!important;z-index:20005!important;margin:0 -14px 10px!important;padding:max(14px,env(safe-area-inset-top)) 64px 12px 14px!important;background:var(--surface,#fff)!important;border-bottom:1px solid var(--hair,#dce6ec)!important}
 #clinicalModal #closeClinicalBtn{display:none!important}
 #n9ClinicalClose{display:none;top:max(10px,env(safe-area-inset-top));right:10px}
 #clinicalModal.open #n9ClinicalClose{display:grid!important}
 #n9AuditorDrawer{display:block!important;width:100%;height:48px;border:0;background:rgba(0,183,164,.14);color:#7ef0dc;text-align:left;font-weight:850;border-bottom:1px solid rgba(255,255,255,.08);padding:0 12px}
 body.n9-auditor-mobile #n7MobileHeader,
 body.n9-auditor-mobile #n7Bottom,
 body.n9-auditor-mobile #n7Drawer,
 body.n9-auditor-mobile #n7Overlay,
 body.n9-auditor-mobile #mainApp>main,
 body.n8-auditor-shell.n9-auditor-mobile #n7Sidebar,
 body.n9-auditor-mobile #n7Sidebar{display:none!important}
 body.n9-auditor-mobile{overflow-x:hidden!important;width:100%!important;max-width:100%!important}
 body.n9-auditor-mobile #n9AuditorHeader{display:flex!important;position:fixed!important;z-index:15000!important;top:0!important;left:0!important;right:0!important;width:100%!important;height:calc(64px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 14px 0!important;background:#061f31;color:#fff;align-items:center;justify-content:space-between;border-bottom:3px solid #1ec8bd}
 #n9AuditorHeader b{font-size:21px;color:#00c5ad}#n9AuditorHeader span{font-size:12px;font-weight:850;letter-spacing:.08em}
 #n9AuditorBack{height:40px;border:1px solid rgba(255,255,255,.2);border-radius:9px;background:rgba(255,255,255,.07);color:#fff;font-weight:850;padding:0 12px}
 body.n8-auditor-shell.n9-auditor-mobile .nexa-auditor-launch,
 body.n9-auditor-mobile .nexa-auditor-launch{display:block!important;position:relative!important;left:0!important;right:0!important;margin:0!important;margin-left:0!important;width:100%!important;max-width:none!important;padding:calc(82px + env(safe-area-inset-top)) 14px 28px!important;min-height:100dvh!important;transform:none!important;background:var(--n7-bg,#f7f9fb)!important;overflow-x:hidden!important}
 body.n9-auditor-mobile .nexa-auditor-launch:before{display:none!important}
 body.n9-auditor-mobile .nexa-auditor-dashboard{width:100%!important;max-width:none!important;margin:0!important;grid-template-columns:1fr!important}
 body.n9-auditor-mobile .nexa-audit-actions{grid-template-columns:1fr!important}
 body.n9-auditor-mobile .nexa-auditor-dashboard>*{max-width:100%!important;min-width:0!important}
}
@media(min-width:821px){#n9AuditorDrawer{display:none!important}}
`;
  document.head.appendChild(s);
}

function bindGlobal(){
  document.addEventListener('click',e=>{
    if(e.target.closest?.('#n7Back')&&$('clinicalModal')?.classList.contains('open')){
      e.preventDefault();e.stopImmediatePropagation();$('closeClinicalBtn')?.click();closeClinical();return;
    }
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('clinicalModal')?.classList.contains('open'))closeClinical()},true);
  new MutationObserver(()=>syncAuditor()).observe(document.body,{attributes:true,attributeFilter:['class']});
  const privilegedWatcher=new MutationObserver(()=>ensureAuditorDrawerButton());privilegedWatcher.observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',syncAuditor);window.addEventListener('orientationchange',()=>setTimeout(syncAuditor,100));
}
function init(){addCss();stabilizeClinical();ensureRecordingControls();ensureAuditorDrawerButton();syncAuditor();bindGlobal();setInterval(syncRecordingControls,350);setTimeout(()=>{stabilizeClinical();ensureRecordingControls();ensureAuditorDrawerButton();syncAuditor()},500);setTimeout(()=>{ensureRecordingControls();ensureAuditorDrawerButton();syncAuditor()},1400)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

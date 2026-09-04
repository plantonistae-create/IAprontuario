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
    if(launch){launch.style.removeProperty('margin-top');launch.scrollTop=0}
    try{window.scrollTo(0,0)}catch{}
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
@media(max-width:820px){
 #clinicalModal{inset:0!important;padding:0!important;align-items:stretch!important;background:var(--surface,#fff)!important}
 #clinicalModal .dialog{width:100%!important;height:100dvh!important;max-height:100dvh!important;margin:0!important;border:0!important;border-radius:0!important;overflow-y:auto!important;overscroll-behavior:contain!important;padding:0 14px max(28px,env(safe-area-inset-bottom))!important}
 #clinicalModal .modal-head{position:sticky!important;top:0!important;z-index:20005!important;margin:0 -14px 10px!important;padding:max(14px,env(safe-area-inset-top)) 64px 12px 14px!important;background:var(--surface,#fff)!important;border-bottom:1px solid var(--hair,#dce6ec)!important}
 #clinicalModal #closeClinicalBtn{display:none!important}
 #n9ClinicalClose{display:none;top:max(10px,env(safe-area-inset-top));right:10px}
 #clinicalModal.open #n9ClinicalClose{display:grid!important}
 #n9AuditorDrawer{display:block!important;width:100%;height:48px;border:0;background:rgba(0,183,164,.14);color:#7ef0dc;text-align:left;font-weight:850;border-bottom:1px solid rgba(255,255,255,.08);padding:0 12px}
 body.n9-auditor-mobile #n7MobileHeader,body.n9-auditor-mobile #n7Bottom,body.n9-auditor-mobile #n7Drawer,body.n9-auditor-mobile #n7Overlay,body.n9-auditor-mobile #mainApp>main{display:none!important}
 body.n9-auditor-mobile #n9AuditorHeader{display:flex!important;position:fixed!important;z-index:15000!important;top:0;left:0;right:0;height:calc(64px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 14px 0;background:#061f31;color:#fff;align-items:center;justify-content:space-between;border-bottom:3px solid #1ec8bd}
 #n9AuditorHeader b{font-size:21px;color:#00c5ad}#n9AuditorHeader span{font-size:12px;font-weight:850;letter-spacing:.08em}
 #n9AuditorBack{height:40px;border:1px solid rgba(255,255,255,.2);border-radius:9px;background:rgba(255,255,255,.07);color:#fff;font-weight:850;padding:0 12px}
 body.n9-auditor-mobile .nexa-auditor-launch{display:block!important;position:relative!important;margin:0!important;width:100%!important;max-width:none!important;padding:calc(82px + env(safe-area-inset-top)) 14px 28px!important;min-height:100dvh!important;transform:none!important;background:var(--n7-bg,#f7f9fb)!important}
 body.n9-auditor-mobile .nexa-auditor-launch:before{display:none!important}
 body.n9-auditor-mobile .nexa-auditor-dashboard{width:100%!important;max-width:none!important;margin:0!important;grid-template-columns:1fr!important}
 body.n9-auditor-mobile .nexa-audit-actions{grid-template-columns:1fr!important}
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
function init(){addCss();stabilizeClinical();ensureAuditorDrawerButton();syncAuditor();bindGlobal();setTimeout(()=>{stabilizeClinical();ensureAuditorDrawerButton();syncAuditor()},500);setTimeout(()=>{ensureAuditorDrawerButton();syncAuditor()},1400)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

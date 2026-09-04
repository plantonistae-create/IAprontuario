/* NEXA role/mobile guard v4 */
(()=>{
'use strict';
if(window.__NEXA_ROLE_MOBILE_V4__)return;window.__NEXA_ROLE_MOBILE_V4__=true;
const qa=s=>[...document.querySelectorAll(s)],q=s=>document.querySelector(s),$=id=>document.getElementById(id);
function isAuditor(){try{return !!(window.currentProf&&window.currentProf.is_reviewer===true)}catch{return false}}
function applyRoleVisibility(){const auditor=isAuditor();qa('a,button,[role="button"],.nexa-desktop-nav-item,.nexa-mobile-nav-item,.nav-item,.menu-item').forEach(el=>{const t=(el.textContent||'').trim().toLowerCase();if(t==='auditoria'||t.startsWith('auditoria ')){el.style.display=auditor?'':'none';el.setAttribute('aria-hidden',auditor?'false':'true')}});const auditViews=qa('[data-stage="audit"],[data-stage="auditoria"],#auditPanel,#auditView,.audit-panel');auditViews.forEach(el=>{if(!auditor){el.classList.remove('active');el.style.display='none'}});}
function addCss(){if($('nexaRoleMobileV4Style'))return;const s=document.createElement('style');s.id='nexaRoleMobileV4Style';s.textContent=`
@media(max-width:820px){
 body.nexa-v340.nexa-doctor-view .nexa-desktop-sidebar{display:none!important}
 body.nexa-v340.nexa-doctor-view #mainApp>main{margin-left:0!important;width:100%!important;padding:10px 10px calc(86px + env(safe-area-inset-bottom))!important}
 .nexa-stage-view[data-stage="radar"].active{display:flex!important;flex-direction:column!important;gap:10px!important}
 .nexa-stage-view[data-stage="radar"]>#realtimeRadarCard{order:1!important;width:100%!important}
 #nexaDispositionCard{order:2!important;width:100%!important;margin:0!important}
 .nexa-stage-view[data-stage="radar"]>.card.rec-zone{order:3!important;width:100%!important;position:relative!important;top:auto!important;margin:0!important;padding:14px!important}
 #nexaRadarAlertsDock{order:4!important;width:100%!important;margin:0!important}
 .nexa-disp-grid{grid-template-columns:1fr!important;gap:7px!important}
 .nexa-stage-view[data-stage="radar"] .rec-zone .timer{font-size:46px!important}
 .nexa-radar-rec-actions{grid-template-columns:1fr 1fr!important}
 .nexa-radar-rec-actions .primary{grid-column:1/-1!important}
 #nexaRadarPersistent{position:sticky!important;top:0!important;z-index:1700!important;border-radius:0 0 12px 12px!important;margin:0 -10px 10px!important;padding:8px 10px!important;overflow-x:auto!important;box-shadow:0 4px 14px rgba(0,0,0,.08)!important}
 .nexa-persist-metric{font-size:9px!important}.nexa-persist-open{flex:0 0 auto!important}
 .nexa-mobile-tabbar,.nexa-bottom-nav,.mobile-bottom-nav{display:flex!important;position:fixed!important;left:0!important;right:0!important;bottom:0!important;z-index:1800!important;padding-bottom:env(safe-area-inset-bottom)!important}
}
`;document.head.appendChild(s)}
function init(){addCss();applyRoleVisibility();setTimeout(applyRoleVisibility,400);setTimeout(applyRoleVisibility,1200);new MutationObserver(applyRoleVisibility).observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

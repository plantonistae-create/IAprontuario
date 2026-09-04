/* NEXA mobile viewport/navigation fix v8 */
(()=>{
'use strict';
if(window.__NEXA_MOBILE_VIEWPORT_FIX_V8__) return;
window.__NEXA_MOBILE_VIEWPORT_FIX_V8__=true;
const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)], $=id=>document.getElementById(id);
const mobile=()=>window.matchMedia('(max-width:820px)').matches;
const stage=()=>document.body.dataset.nexaStage||'radar';
function headerH(){const h=$('n7MobileHeader');return h?Math.ceil(h.getBoundingClientRect().height):190}
function resetScrollNodes(active=q('.nexa-stage-view.active')){
 const nodes=[document.scrollingElement,document.documentElement,document.body,$('mainApp')?.querySelector('main'),q('.nexa-stage-host'),q('.panel-right'),active,$('nexaDoctorHome')];
 nodes.filter(Boolean).forEach(el=>{try{el.scrollTop=0;el.scrollLeft=0}catch{}});
 try{window.scrollTo(0,0)}catch{}
}
function resetAllScroll(){
 const active=q('.nexa-stage-view.active');
 resetScrollNodes(active);
 if(active){
   try{active.style.setProperty('margin-top','0','important');active.style.setProperty('padding-top','0','important');active.style.setProperty('transform','none','important');active.style.setProperty('top','auto','important')}catch{}
   requestAnimationFrame(()=>{
     const h=headerH()+14;
     try{active.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'})}catch{try{active.scrollIntoView(true)}catch{}}
     requestAnimationFrame(()=>{try{window.scrollBy(0,-h)}catch{};resetScrollNodes(active)})
   })
 }
}
function forceHomeOffset(){
 if(!mobile())return;
 const h=headerH();
 const home=$('nexaDoctorHome')||q('.nexa-doctor-home');
 if(home){
   home.style.setProperty('padding-top',`${h+22}px`,'important');
   home.style.setProperty('margin-top','0','important');
   home.style.setProperty('transform','none','important');
   home.style.setProperty('scroll-margin-top',`${h+22}px`,'important');
 }
 if(document.body.classList.contains('doctor-home-open')) resetScrollNodes(null);
}
function forceOffset(){
 if(!mobile())return;
 const h=headerH();
 document.documentElement.style.setProperty('--n7-mobile-header',`${h}px`);
 const main=$('mainApp')?.querySelector('main');
 if(main){main.style.setProperty('padding-top',`${h+18}px`,'important');main.style.setProperty('scroll-padding-top',`${h+18}px`,'important')}
 qa('.nexa-stage-view').forEach(v=>v.style.setProperty('scroll-margin-top',`${h+18}px`,'important'));
 forceHomeOffset();
}
function open(){const d=$('n7Drawer'),o=$('n7Overlay');if(d)d.classList.add('on');if(o)o.classList.add('on');document.documentElement.classList.add('n7-lock')}
function close(){const d=$('n7Drawer'),o=$('n7Overlay');if(d)d.classList.remove('on');if(o)o.classList.remove('on');document.documentElement.classList.remove('n7-lock')}
function markNav(name){qa('#n7Bottom [data-go],#n7Drawer [data-go],#n7Sidebar [data-go]').forEach(b=>b.classList.toggle('active',b.dataset.go===name))}
function openHistory(){
 document.body.classList.remove('doctor-home-open');
 document.body.classList.add('nexa-workspace-only');
 const summary=q('.nexa-stage-view[data-stage="summary"]');
 qa('.nexa-stage-view').forEach(v=>{const on=v===summary;v.classList.toggle('active',on);v.hidden=!on});
 document.body.dataset.nexaStage='summary';
 const ws=$('nexaCommandWorkspace');
 if(ws){ws.classList.add('workspace-open');ws.classList.remove('is-collapsed','nexa-workspace-hidden');ws.style.setProperty('display','block','important')}
 const histTab=$('workspaceHistoryTab');if(histTab)histTab.click();
 const histPane=$('workspaceHistoryPane');if(histPane){qa('#nexaCommandWorkspace .pane').forEach(p=>{p.classList.toggle('active',p===histPane);if(p===histPane)p.style.setProperty('display','block','important')})}
 markNav('history');close();forceOffset();
 setTimeout(()=>{resetAllScroll();try{ws?.scrollIntoView({block:'start',behavior:'instant'})}catch{};try{window.scrollBy(0,-headerH()-14)}catch{}},0);
}
function goRadar(){
 document.body.classList.remove('nexa-workspace-only','doctor-home-open');
 const radar=q('.nexa-stage-view[data-stage="radar"]');
 qa('.nexa-stage-view').forEach(v=>{const on=v===radar;v.classList.toggle('active',on);v.hidden=!on});
 document.body.dataset.nexaStage='radar';markNav('radar');close();forceOffset();setTimeout(resetAllScroll,0)
}
function goHome(){
 document.body.classList.remove('nexa-workspace-only');
 const native=$('nexaHomeNav');
 if(native)native.click();
 document.body.classList.add('doctor-home-open');
 document.body.dataset.nexaStage='radar';
 qa('#n7Bottom [data-go],#n7Drawer [data-go],#n7Sidebar [data-go]').forEach(b=>b.classList.remove('active'));
 close();forceOffset();
 requestAnimationFrame(()=>{forceHomeOffset();resetScrollNodes(null);setTimeout(()=>{forceHomeOffset();resetScrollNodes(null)},140)})
}
function bindBack(){
 const b=$('n7Back');if(!b)return;
 const clone=b.cloneNode(true);b.replaceWith(clone);
 clone.addEventListener('click',e=>{
   e.preventDefault();e.stopImmediatePropagation();
   if($('n7Drawer')?.classList.contains('on')){close();return}
   if(document.body.classList.contains('nexa-workspace-only')){goRadar();return}
   const current=qa('#n7Bottom [data-go].active')[0]?.dataset.go||stage();
   if(current&&current!=='radar'){goRadar();return}
   goHome();
 },true)
}
function bind(){
 const menu=$('n7Menu');if(menu){const c=menu.cloneNode(true);menu.replaceWith(c);c.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();open()},true)}
 const more=$('n7More');if(more){const c=more.cloneNode(true);more.replaceWith(c);c.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const d=$('n7Drawer');d?.classList.contains('on')?close():open()},true)}
 const x=$('n7Close');if(x){const c=x.cloneNode(true);x.replaceWith(c);c.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();close()},true)}
 $('n7Overlay')?.addEventListener('click',e=>{e.preventDefault();close()},true);
 bindBack();
 document.addEventListener('click',e=>{
   const h=e.target.closest?.('#n7Bottom [data-go="history"],#n7Drawer [data-go="history"],#n7Sidebar [data-go="history"]');
   if(!h)return;e.preventDefault();e.stopImmediatePropagation();openHistory();
 },true);
 qa('#n7Bottom [data-go]:not([data-go="history"]),#n7Drawer [data-go]:not([data-go="history"]),#n7Sidebar [data-go]:not([data-go="history"])').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{forceOffset();resetAllScroll()},0),true));
 $('nexaNewCaseBtn')?.addEventListener('click',()=>setTimeout(()=>{forceOffset();resetAllScroll()},0),true)
}
function addCss(){
 if($('nexaV8ViewportStyle'))$('nexaV8ViewportStyle').remove();
 const s=document.createElement('style');s.id='nexaV8ViewportStyle';s.textContent=`@media(max-width:820px){
 #n7MobileHeader{pointer-events:auto!important}
 #n7MobileHeader .n7-iconbtn{pointer-events:auto!important;z-index:2147483646!important}
 body.nexa-clean-v7 #mainApp>main{position:relative!important}
 body.nexa-clean-v7 .nexa-stage-view.active{position:relative!important;top:auto!important;margin-top:0!important;transform:none!important}
 body.nexa-clean-v7 .nexa-doctor-header,body.nexa-clean-v7 .nexa-session-tabs{display:none!important}
 body.nexa-clean-v7.doctor-home-open #nexaDoctorHome,body.nexa-clean-v7.doctor-home-open .nexa-doctor-home{padding-top:calc(var(--n7-mobile-header) + 22px)!important;margin-top:0!important;transform:none!important}
 body.nexa-clean-v7.nexa-workspace-only .nexa-stage-view[data-stage="summary"]{display:block!important}
 body.nexa-clean-v7.nexa-workspace-only #nexaCommandWorkspace{display:block!important}
}`;document.head.appendChild(s)
}
function watchHome(){
 let prev=document.body.classList.contains('doctor-home-open');
 new MutationObserver(()=>{if(!mobile())return;const now=document.body.classList.contains('doctor-home-open');forceOffset();if(now){requestAnimationFrame(()=>{forceHomeOffset();resetScrollNodes(null)})}prev=now}).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){forceOffset();document.body.classList.contains('doctor-home-open')?forceHomeOffset():resetAllScroll()}})
}
function init(){
 addCss();forceOffset();bind();watchHome();
 document.body.classList.contains('doctor-home-open')?forceHomeOffset():resetAllScroll();
 setTimeout(()=>{forceOffset();document.body.classList.contains('doctor-home-open')?forceHomeOffset():resetAllScroll()},250);
 setTimeout(()=>{forceOffset();document.body.classList.contains('doctor-home-open')?forceHomeOffset():resetAllScroll()},900);
 window.addEventListener('resize',()=>{forceOffset();document.body.classList.contains('doctor-home-open')?forceHomeOffset():resetAllScroll()});
 window.addEventListener('orientationchange',()=>setTimeout(()=>{forceOffset();document.body.classList.contains('doctor-home-open')?forceHomeOffset():resetAllScroll()},200));
 window.addEventListener('pageshow',()=>setTimeout(()=>{forceOffset();document.body.classList.contains('doctor-home-open')?forceHomeOffset():resetAllScroll()},0));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

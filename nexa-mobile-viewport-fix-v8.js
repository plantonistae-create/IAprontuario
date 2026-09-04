/* NEXA mobile viewport/navigation fix v8 */
(()=>{
'use strict';
if(window.__NEXA_MOBILE_VIEWPORT_FIX_V8__) return;
window.__NEXA_MOBILE_VIEWPORT_FIX_V8__=true;
const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)], $=id=>document.getElementById(id);
const mobile=()=>window.matchMedia('(max-width:820px)').matches;
const stage=()=>document.body.dataset.nexaStage||'radar';
function headerH(){const h=$('n7MobileHeader');return h?Math.ceil(h.getBoundingClientRect().height):190}
function resetAllScroll(){
 const active=q('.nexa-stage-view.active');
 const nodes=[document.scrollingElement,document.documentElement,document.body,$('mainApp')?.querySelector('main'),q('.nexa-stage-host'),q('.panel-right'),active,$('nexaDoctorHome')];
 nodes.filter(Boolean).forEach(el=>{try{el.scrollTop=0;el.scrollLeft=0}catch{}});
 try{window.scrollTo(0,0)}catch{}
 if(active){
   try{active.style.setProperty('margin-top','0','important');active.style.setProperty('padding-top','0','important');active.style.setProperty('transform','none','important');active.style.setProperty('top','auto','important')}catch{}
   requestAnimationFrame(()=>{
     const h=headerH()+14;
     try{active.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'})}catch{try{active.scrollIntoView(true)}catch{}}
     requestAnimationFrame(()=>{try{window.scrollBy(0,-h)}catch{};nodes.filter(Boolean).forEach(el=>{try{if(el!==document.scrollingElement&&el!==document.documentElement&&el!==document.body)el.scrollTop=0}catch{}})})
   })
 }
}
function forceOffset(){
 if(!mobile())return;
 const h=headerH();
 document.documentElement.style.setProperty('--n7-mobile-header',`${h}px`);
 const main=$('mainApp')?.querySelector('main');
 if(main){main.style.setProperty('padding-top',`${h+18}px`,'important');main.style.setProperty('scroll-padding-top',`${h+18}px`,'important')}
 const home=$('nexaDoctorHome');
 if(home)home.style.setProperty('padding-top',`${h+18}px`,'important');
 qa('.nexa-stage-view').forEach(v=>v.style.setProperty('scroll-margin-top',`${h+18}px`,'important'));
}
function open(){const d=$('n7Drawer'),o=$('n7Overlay');if(d)d.classList.add('on');if(o)o.classList.add('on');document.documentElement.classList.add('n7-lock')}
function close(){const d=$('n7Drawer'),o=$('n7Overlay');if(d)d.classList.remove('on');if(o)o.classList.remove('on');document.documentElement.classList.remove('n7-lock')}
function markNav(name){qa('#n7Bottom [data-go],#n7Drawer [data-go],#n7Sidebar [data-go]').forEach(b=>b.classList.toggle('active',b.dataset.go===name))}
function openHistory(){
 document.body.classList.remove('doctor-home-open');
 document.body.classList.add('nexa-workspace-only');
 document.body.dataset.nexaStage='history';
 const summary=q('.nexa-stage-view[data-stage="summary"]');
 qa('.nexa-stage-view').forEach(v=>{const on=v===summary;v.classList.toggle('active',on);v.hidden=!on});
 const ws=$('nexaCommandWorkspace');if(ws){ws.classList.add('workspace-open');ws.classList.remove('nexa-workspace-hidden')}
 $('workspaceHistoryTab')?.click();
 markNav('history');close();
 setTimeout(()=>{forceOffset();resetAllScroll()},0);
 setTimeout(resetAllScroll,120);
}
function goHome(){
 const homeBtn=$('nexaHomeNav');
 if(homeBtn){homeBtn.click()}else{document.body.classList.add('doctor-home-open');document.body.classList.remove('nexa-workspace-only')}
 document.body.dataset.nexaStage='radar';markNav('radar');close();
 setTimeout(()=>{forceOffset();resetAllScroll()},0);setTimeout(resetAllScroll,180);
}
function bindBack(){
 const b=$('n7Back');if(!b)return;
 const clone=b.cloneNode(true);b.replaceWith(clone);
 clone.addEventListener('click',e=>{
   e.preventDefault();e.stopImmediatePropagation();
   if($('n7Drawer')?.classList.contains('on')){close();return}
   const current=qa('#n7Bottom [data-go].active')[0]?.dataset.go||stage();
   if(current==='history'||current==='summary'||current==='hypothesis'||current==='plan') q('#n7Bottom [data-go="radar"]')?.click();
   else goHome();
   setTimeout(()=>{forceOffset();resetAllScroll()},0);
 },true);
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
 $('nexaNewCaseBtn')?.addEventListener('click',()=>setTimeout(()=>{forceOffset();resetAllScroll()},0),true);
}
function addCss(){if($('nexaV8ViewportStyle'))return;const s=document.createElement('style');s.id='nexaV8ViewportStyle';s.textContent=`@media(max-width:820px){#n7MobileHeader{pointer-events:auto!important}#n7MobileHeader .n7-iconbtn{pointer-events:auto!important;z-index:2147483646!important}body.nexa-clean-v7 #mainApp>main{position:relative!important}body.nexa-clean-v7 .nexa-stage-view.active{position:relative!important;top:auto!important;margin-top:0!important;transform:none!important}body.nexa-clean-v7.doctor-home-open #nexaDoctorHome{padding-top:calc(var(--n7-mobile-header) + 18px)!important}}`;document.head.appendChild(s)}
function init(){
 addCss();forceOffset();bind();resetAllScroll();
 setTimeout(()=>{forceOffset();resetAllScroll()},250);setTimeout(()=>{forceOffset();resetAllScroll()},900);
 window.addEventListener('resize',()=>{forceOffset();resetAllScroll()});
 window.addEventListener('orientationchange',()=>setTimeout(()=>{forceOffset();resetAllScroll()},200));
 window.addEventListener('pageshow',()=>setTimeout(()=>{forceOffset();resetAllScroll()},0));
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&document.body.classList.contains('doctor-home-open'))setTimeout(()=>{forceOffset();resetAllScroll()},0)});
 let homeOpen=document.body.classList.contains('doctor-home-open');
 new MutationObserver(()=>{const now=document.body.classList.contains('doctor-home-open');if(now&&!homeOpen)setTimeout(()=>{forceOffset();resetAllScroll()},0);homeOpen=now}).observe(document.body,{attributes:true,attributeFilter:['class']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

/* NEXA v18.9.5 · native seven-day history bridge · 2026-09-06 */
(()=>{
'use strict';
if(window.__NEXA_HISTORY_NATIVE_V18_9_5__)return;
window.__NEXA_HISTORY_NATIVE_V18_9_5__=true;
const $=s=>document.querySelector(s);
function mount(){
  const stage=$('.nexa-stage-view[data-stage="history"]');
  const pane=$('#workspaceHistoryPane');
  if(!stage||!pane)return false;
  const legacy=$('#nexaSevenDayHistory');if(legacy)legacy.remove();
  pane.classList.remove('nh7-native-hidden');
  pane.style.removeProperty('display');
  pane.style.width='100%';pane.style.maxWidth='none';pane.style.margin='0';
  if(pane.parentElement!==stage)stage.appendChild(pane);
  const head=$('#historyHead'),body=$('#historyBody');
  if(head){const h=head.querySelector('h3');if(h)h.textContent='Consultas dos últimos 7 dias';}
  body?.classList.add('open');
  const btn=$('#refreshHistoryBtn');if(btn&&!btn.disabled)btn.click();
  return true;
}
function active(){return document.body?.dataset?.nexaStage==='history'||!!$('.nexa-stage-view[data-stage="history"].active:not([hidden])')}
document.addEventListener('click',e=>{
  if(e.target?.closest?.('[data-go="history"],.nexa-session-tab[data-stage="history"],#nexaMobileBottomNav [data-mobile-stage="history"]'))setTimeout(mount,60);
},true);
addEventListener('online',()=>{if(active())setTimeout(mount,120)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active())setTimeout(mount,120)});
[100,300,700,1400].forEach(ms=>setTimeout(()=>{if(active())mount()},ms));
window.nexaRefreshSevenDayHistory=mount;
})();
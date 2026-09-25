/* NEXA v18.9.8 · recording timer follows recorder DOM state · 2026-09-11 */
(()=>{
'use strict';
if(window.__NEXA_RECORDING_TIMER_STATE_V18_9_8__)return;
window.__NEXA_RECORDING_TIMER_STATE_V18_9_8__=true;
const $=id=>document.getElementById(id);
let frozenSeconds=0;
const parseTimer=value=>{const m=String(value||'').trim().match(/^(\d{1,3}):(\d{2})$/);return m?Math.max(0,(+m[1]*60)+(+m[2])):0};
function recorderState(){
  const rec=$('recBtn'),timer=$('timer'),status=$('status'),process=$('processBtn');
  const active=!!rec?.classList.contains('recording')||$('stopShape')?.style.display==='block';
  const controlText=[$('nexaPauseBtn')?.textContent,$('nexaDesktopPause')?.textContent,$('nexaLocalPauseBtn')?.textContent].filter(Boolean).join(' ').toLowerCase();
  const paused=active&&controlText.includes('retomar');
  const secs=parseTimer(timer?.textContent);
  const blob=!active&&!!process&&!process.disabled&&/gravação concluída|pronta para transcrever/i.test(status?.textContent||'');
  return{active,paused,blob,secs};
}
const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function stopGhostTimer(){
  const s=recorderState();
  if(s.active){if(s.secs>0)frozenSeconds=s.secs;return false}
  if(s.secs>0)frozenSeconds=s.secs;
  const timer=$('timer');if(timer&&frozenSeconds>0)timer.textContent=fmt(frozenSeconds);
  const top=$('nexaDesktopPause');
  if(top&&s.blob){top.classList.remove('nexa-top-recording');top.innerHTML='<span class="nexa-hotfix-record-label">✓ Gravação concluída</span>'}
  return true;
}
function afterFinish(){setTimeout(stopGhostTimer,0);setTimeout(stopGhostTimer,80);setTimeout(stopGhostTimer,300)}
document.addEventListener('click',e=>{
  if(e.target?.closest?.('#nexaDesktopFinish,#nfFinish,#nexaLocalFinishBtn,#nexaFinishBtn,#stopBtn,[data-record-action="finish"],#processBtn'))afterFinish();
},true);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(stopGhostTimer,0)});
addEventListener('pageshow',()=>setTimeout(stopGhostTimer,0));
window.nexaStopGhostRecordingTimer=stopGhostTimer;
window.nexaRecordingTimerState198=recorderState;
setTimeout(stopGhostTimer,500);
})();

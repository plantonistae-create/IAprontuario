/* NEXA v18.9.8 · recording timer follows recorder state · 2026-09-06 */
(()=>{
'use strict';
if(window.__NEXA_RECORDING_TIMER_STATE_V18_9_8__)return;
window.__NEXA_RECORDING_TIMER_STATE_V18_9_8__=true;
const $=id=>document.getElementById(id);
let frozenSeconds=0;
function recorderState(){
  let active=false,paused=false,blob=false,secs=0;
  try{active=!!recording}catch{}
  try{paused=!!mediaRecorder&&mediaRecorder.state==='paused'}catch{}
  try{blob=!!audioBlob}catch{}
  try{secs=Math.max(0,Number(seconds||0)||0)}catch{}
  return{active,paused,blob,secs};
}
const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function stopGhostTimer(){
  const s=recorderState();
  if(s.active){frozenSeconds=s.secs;return false}
  if(s.secs>0)frozenSeconds=s.secs;
  try{if(typeof stopRecordingTimer==='function')stopRecordingTimer({reset:false})}catch{}
  const timer=$('timer');if(timer)timer.textContent=fmt(frozenSeconds);
  const top=$('nexaDesktopPause');
  if(top&&s.blob){top.classList.remove('nexa-top-recording');top.innerHTML='<span class="nexa-hotfix-record-label">✓ Gravação concluída</span>'}
  return true;
}
function afterFinish(){setTimeout(stopGhostTimer,0);setTimeout(stopGhostTimer,80);setTimeout(stopGhostTimer,300)}
document.addEventListener('click',e=>{
  if(e.target?.closest?.('#nexaDesktopFinish,#nfFinish,#stopBtn,[data-record-action="finish"],#processBtn'))afterFinish();
},true);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)afterFinish()});
addEventListener('pageshow',afterFinish);
// MediaRecorder's stop event is authoritative when available.
function bindRecorder(){
  try{if(mediaRecorder&&mediaRecorder.__nexaTimerBound!==true){mediaRecorder.__nexaTimerBound=true;mediaRecorder.addEventListener('stop',afterFinish)}}catch{}
}
document.addEventListener('click',e=>{if(e.target?.closest?.('#recBtn,#nfStart,#nexaDesktopPause'))setTimeout(bindRecorder,60)},true);
window.nexaStopGhostRecordingTimer=stopGhostTimer;
setTimeout(()=>{bindRecorder();stopGhostTimer()},500);
})();

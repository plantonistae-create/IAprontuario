/* NEXA v18.9.9 · Radar DOM/state bridge · 2026-09-11 */
(()=>{
'use strict';
if(window.__NEXA_RADAR_STATE_BRIDGE_V18_9_9__)return;
window.__NEXA_RADAR_STATE_BRIDGE_V18_9_9__=true;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const text=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
const uniq=a=>[...new Set(a.map(v=>String(v||'').trim()).filter(Boolean))];
const rows=(sel,empty)=>uniq($$(sel).map(text).filter(v=>v&&!empty.test(v)));
let scheduled=false,observer=null;
function snapshot(){
  const covered=rows('#radarCovered .radar-row',/radar|nenhum|aguard/i);
  const missing=rows('#radarMissing .radar-row',/nenhum|aguard/i);
  const questions=rows('#radarQuestions .radar-question:not(.nexa-question-done)',/nenhum|aguard/i).map(v=>v.replace(/✓\s*esclarecida.*$/i,'').trim());
  const alerts=rows('#radarAlerts .nexa-radar-alert-row,#nexaRadarAlertsDock .nexa-alert-row',/nenhum alerta/i).map(v=>v.replace(/^⚠\s*/,'').trim());
  const chief=text($('#realtimeRadarCard [data-radar-chief],#nexaRadarChiefComplaint'));
  return{covered,missing,questions,alerts,chief_complaint:chief};
}
const same=(a,b)=>{try{return JSON.stringify(a)===JSON.stringify(b)}catch{return false}};
function publish(reason='dom'){
  scheduled=false;if(!$('#realtimeRadarCard'))return;
  const next=snapshot(),prev=window.radarState&&typeof window.radarState==='object'?window.radarState:null;
  if(!same(prev,next)){
    window.radarState=next;
    window.dispatchEvent(new CustomEvent('nexa:radar-state',{detail:{state:next,reason}}));
  }
  try{window.nexaRadarStableRefresh194?.()}catch{}
}
function schedule(reason='mutation'){if(scheduled)return;scheduled=true;queueMicrotask(()=>publish(reason))}
function reset(reason='reset'){
  window.radarState={covered:[],missing:[],questions:[],alerts:[],chief_complaint:''};
  window.dispatchEvent(new CustomEvent('nexa:radar-state',{detail:{state:window.radarState,reason}}));
  setTimeout(()=>publish(reason),0);setTimeout(()=>publish(reason),120);
}
function bind(){
  const card=$('#realtimeRadarCard');if(!card)return false;
  observer?.disconnect();observer=new MutationObserver(()=>schedule('mutation'));
  observer.observe(card,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',e=>{if(e.target?.closest?.('#resetBtn,#nexaRadarResetBtn,#nexaRadarClearProxy,#nfClear,[data-record-action="clear"]'))reset('reset')},true);
  publish('boot');return true;
}
function boot(){if(bind())return;let tries=0;const timer=setInterval(()=>{if(bind()||++tries>20)clearInterval(timer)},150)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.nexaRadarStateBridge199={snapshot,publish,reset};
})();

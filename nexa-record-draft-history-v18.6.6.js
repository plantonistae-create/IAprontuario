/* NEXA v18.6.6 · start-only recorder + live draft history · 2026-09-05
   Keeps the green recording control as START only. Pause/resume and finish remain
   exclusive to their dedicated controls. The History stage mounts the existing
   draft-history pane, refreshes from consultation_history, and silently persists
   draft edits so recent work actually appears there. */
(()=>{
'use strict';
if(window.__NEXA_RECORD_DRAFT_HISTORY_V18_6_6__)return;
window.__NEXA_RECORD_DRAFT_HISTORY_V18_6_6__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
let draftTimer=0;
let persistBusy=false;
let persistAgain=false;
let processWrapped=false;

function recordingActive(){
  try{
    if(typeof recording!=='undefined'&&recording)return true;
    if(typeof mediaRecorder!=='undefined'&&mediaRecorder&&['recording','paused'].includes(mediaRecorder.state))return true;
  }catch{}
  return false;
}

function installStartOnlyRecorder(){
  const rec=$('recBtn');
  if(rec&&!rec.dataset.nexaStartOnly){
    rec.dataset.nexaStartOnly='1';
    rec.setAttribute('aria-label','Iniciar gravação');
    rec.title='Iniciar gravação';
    rec.addEventListener('click',e=>{
      if(!recordingActive())return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      try{if(typeof show==='function')show('A gravação já está em andamento. Use o botão Pausar para pausar ou retomar.')}catch{}
    },true);
  }

  const start=$('nfStart');
  if(start&&!start.dataset.nexaStartOnly){
    start.dataset.nexaStartOnly='1';
    start.addEventListener('click',e=>{
      if(!recordingActive())return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    },true);
  }
}

function installStyles(){
  if($('nexaRecordDraftHistoryStyle'))return;
  const style=document.createElement('style');
  style.id='nexaRecordDraftHistoryStyle';
  style.textContent=`
    #recBtn[data-nexa-start-only="1"].recording{cursor:default!important}
    .nexa-stage-view[data-stage="history"]>#workspaceHistoryPane{
      display:block!important;width:100%!important;max-width:none!important;margin:0!important;
      padding:16px!important;border:1px solid var(--nf-line,var(--hair))!important;
      border-radius:12px!important;background:var(--nf-card,var(--surface))!important;
      color:var(--nf-text,var(--ink))!important;box-sizing:border-box!important
    }
    .nexa-stage-view[data-stage="history"] #historyBody{display:block!important}
    .nexa-stage-view[data-stage="history"] #historyList{max-height:none!important;overflow:visible!important}
    .nexa-stage-view[data-stage="history"] #historyHead{cursor:default!important}
  `;
  document.head.appendChild(style);
}

function mountHistoryStage(){
  const stage=q('.nexa-stage-view[data-stage="history"]');
  const pane=$('workspaceHistoryPane');
  if(!stage||!pane)return false;
  if(pane.parentElement!==stage)stage.appendChild(pane);
  pane.classList.remove('nexa-workspace-pane');
  pane.style.removeProperty('display');
  const body=$('historyBody');
  if(body)body.classList.add('open');
  const count=$('historyCount');
  if(count&&count.textContent.includes('▸'))count.textContent=count.textContent.replace('▸','▾');
  return true;
}

function currentProfileId(){
  try{return typeof currentProf!=='undefined'&&currentProf?.id?String(currentProf.id):''}catch{return''}
}
function clinicalFields(){
  try{return typeof collect==='function'?collect():{}}catch{return{}}
}
function hasMeaningfulFields(fields=clinicalFields()){
  return Object.values(fields||{}).some(v=>typeof v==='string'&&v.trim());
}
function currentMeta(){
  try{return typeof lastProcessedMeta!=='undefined'&&lastProcessedMeta?lastProcessedMeta:{}}catch{return{}}
}
function currentHistoryId(){
  try{return typeof activeHistoryId!=='undefined'&&activeHistoryId?String(activeHistoryId):''}catch{return''}
}
function setCurrentHistoryId(id){
  try{if(typeof activeHistoryId!=='undefined')activeHistoryId=id}catch{}
}
function updateLocalHistory(row){
  if(!row)return;
  try{
    if(typeof history==='undefined'||!Array.isArray(history))return;
    const i=history.findIndex(x=>x.id===row.id);
    if(i>=0)history[i]=row;
    else history.unshift(row);
    history.sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0));
  }catch{}
}

async function persistDraft(){
  clearTimeout(draftTimer);draftTimer=0;
  if(persistBusy){persistAgain=true;return false}
  const uid=currentProfileId();
  if(!uid||typeof sb==='undefined')return false;
  const fields=clinicalFields();
  if(!hasMeaningfulFields(fields))return false;

  persistBusy=true;
  const now=new Date().toISOString();
  const meta=currentMeta();
  try{
    let row=null;
    const id=currentHistoryId();
    if(id){
      const {data,error}=await sb.from('consultation_history')
        .update({fields,updated_at:now,status:'draft',processing_meta:meta})
        .eq('id',id).eq('user_id',uid)
        .select('id,fields,created_at,updated_at,status,consent_recorded_at,processing_meta')
        .single();
      if(!error)row=data;
      else console.warn('NEXA draft autosave update failed; creating a new draft.',error);
    }
    if(!row){
      const newId=crypto.randomUUID();
      const consentAt=meta?.consentRecordedAt||now;
      const {data,error}=await sb.from('consultation_history')
        .insert({id:newId,user_id:uid,fields,status:'draft',consent_recorded_at:consentAt,processing_meta:meta,created_at:now,updated_at:now})
        .select('id,fields,created_at,updated_at,status,consent_recorded_at,processing_meta')
        .single();
      if(error)throw error;
      row=data;
      setCurrentHistoryId(row.id);
    }
    updateLocalHistory(row);
    try{if(typeof renderHistory==='function')renderHistory()}catch{}
    return true;
  }catch(e){
    console.warn('NEXA draft autosave failed:',e);
    return false;
  }finally{
    persistBusy=false;
    if(persistAgain){persistAgain=false;schedulePersist(300)}
  }
}

function schedulePersist(delay=1600){
  clearTimeout(draftTimer);
  draftTimer=setTimeout(()=>{persistDraft()},Math.max(0,delay));
}

async function loadDraftHistory(){
  const uid=currentProfileId();
  if(!uid||typeof sb==='undefined')return false;
  mountHistoryStage();
  const cutoff=new Date(Date.now()-7*24*60*60*1000).toISOString();
  try{
    const {data,error}=await sb.from('consultation_history')
      .select('id,fields,created_at,updated_at,status,consent_recorded_at,processing_meta')
      .eq('user_id',uid)
      .eq('status','draft')
      .gte('updated_at',cutoff)
      .order('updated_at',{ascending:false});
    if(error)throw error;
    try{if(typeof history!=='undefined')history=data||[]}catch{}
    try{if(typeof renderHistory==='function')renderHistory()}catch{}
    const count=$('historyCount');
    if(count)count.textContent=`${(data||[]).length} rascunhos nos últimos 7 dias ▾`;
    const empty=$('historyList')?.querySelector('.empty');
    if(empty&&!data?.length)empty.textContent='Nenhum rascunho atualizado nos últimos 7 dias.';
    return true;
  }catch(e){
    console.warn('NEXA draft history refresh failed:',e);
    return false;
  }
}

function installHistoryRefresh(){
  mountHistoryStage();
  const refresh=$('refreshHistoryBtn');
  if(refresh&&!refresh.dataset.nexaDraftRefresh){
    refresh.dataset.nexaDraftRefresh='1';
    refresh.onclick=e=>{e?.stopPropagation?.();loadDraftHistory()};
  }

  document.addEventListener('click',e=>{
    const target=e.target?.closest?.('[data-go="history"],#nfQuickHistory,.nexa-session-tab[data-stage="history"]');
    if(!target)return;
    setTimeout(()=>{mountHistoryStage();loadDraftHistory()},20);
  },true);
}

function wrapProcessButton(){
  const btn=$('processBtn');
  if(!btn||btn.dataset.nexaDraftWrapped||typeof btn.onclick!=='function')return false;
  const native=btn.onclick;
  btn.dataset.nexaDraftWrapped='1';
  btn.onclick=function(...args){
    let result;
    try{result=native.apply(this,args)}catch(e){throw e}
    Promise.resolve(result).finally(()=>schedulePersist(0));
    return result;
  };
  processWrapped=true;
  return true;
}

function installDraftInputs(){
  if(document.documentElement.dataset.nexaDraftInputs==='1')return;
  document.documentElement.dataset.nexaDraftInputs='1';
  document.addEventListener('input',e=>{
    if(!e.target?.matches?.('.field textarea,.field input,.field select,#examPhysicalBlock textarea'))return;
    schedulePersist(1800);
  },true);
  document.addEventListener('change',e=>{
    if(!e.target?.matches?.('.field textarea,.field input,.field select,#examPhysicalBlock textarea'))return;
    schedulePersist(900);
  },true);
}

function install(){
  installStyles();
  installStartOnlyRecorder();
  installHistoryRefresh();
  installDraftInputs();
  wrapProcessButton();
}

install();
[80,220,500,900,1600,2600,4200].forEach(ms=>setTimeout(install,ms));
addEventListener('pageshow',()=>setTimeout(()=>{install();if(document.body.dataset.nexaStage==='history')loadDraftHistory()},30));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.dataset.nexaStage==='history')setTimeout(loadDraftHistory,80)});

window.nexaPersistDraftNow=persistDraft;
window.nexaRefreshDraftHistory=loadDraftHistory;
window.__NEXA_V18_6_6_DRAFT_DIAGNOSTIC__={startOnly:true,historyStage:true,draftAutosave:true,get processWrapped(){return processWrapped}};
})();

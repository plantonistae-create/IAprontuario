/* NEXA v18.6.6 · start-only recorder + draft history stage · 2026-09-05
   The green recording control is START only. Pause/resume and finish stay on
   their dedicated controls. History reuses the native authenticated draft store
   already bound inside index.html, so there is no second clinical data path. */
(()=>{
'use strict';
if(window.__NEXA_RECORD_DRAFT_HISTORY_V18_6_6__)return;
window.__NEXA_RECORD_DRAFT_HISTORY_V18_6_6__=true;

const $=id=>document.getElementById(id);
const q=s=>document.querySelector(s);
let historyListenerInstalled=false;

function recordingActive(){
  const rec=$('recBtn');
  if(rec?.classList.contains('recording'))return true;
  const stop=$('stopShape');
  if(stop){
    try{if(getComputedStyle(stop).display!=='none')return true}catch{}
  }
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
      const status=$('status');
      if(status)status.textContent='Gravação em andamento · use Pausar ou Finalizar';
    },true);
  }

  const start=$('nfStart');
  if(start&&!start.dataset.nexaStartOnly){
    start.dataset.nexaStartOnly='1';
    start.title='Iniciar gravação';
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
    #nexaCurrentDraftCard{display:grid;gap:7px;width:100%;margin:0 0 12px;padding:14px 15px;
      border:1px dashed var(--nf-line,var(--hair));border-radius:11px;background:var(--nf-card2,var(--surface2));
      color:var(--nf-text,var(--ink));box-sizing:border-box}
    #nexaCurrentDraftCard strong{font-size:12px}#nexaCurrentDraftCard small{font-size:10px;color:var(--nf-muted,var(--muted))}
    #nexaCurrentDraftCard p{margin:0;font-size:11px;line-height:1.4;color:var(--nf-text,var(--ink))}
  `;
  document.head.appendChild(style);
}

function currentDraftPreview(){
  const fields=[...document.querySelectorAll('.field[data-key]')]
    .map(field=>({key:field.dataset.key||'',value:field.querySelector('textarea')?.value?.trim()||''}))
    .filter(x=>x.value);
  if(!fields.length)return null;
  const chief=fields.find(x=>x.key==='queixa_principal')?.value||'Consulta em andamento';
  const hda=fields.find(x=>x.key==='hda')?.value||fields[0]?.value||'';
  return{chief:chief.slice(0,90),preview:hda.slice(0,180)};
}

function renderCurrentDraft(stage){
  const draft=currentDraftPreview();
  let card=$('nexaCurrentDraftCard');
  if(!draft){card?.remove();return}
  if(!card){
    card=document.createElement('div');
    card.id='nexaCurrentDraftCard';
    stage.prepend(card);
  }
  card.innerHTML=`<strong>Rascunho atual</strong><small>Consulta ainda aberta · o histórico salvo aparece abaixo</small><p></p>`;
  card.querySelector('p').textContent=`${draft.chief}${draft.preview?` — ${draft.preview}`:''}`;
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
  renderCurrentDraft(stage);
  return true;
}

function refreshNativeHistory(){
  if(!mountHistoryStage())return false;
  const refresh=$('refreshHistoryBtn');
  if(!refresh)return false;
  try{refresh.click();return true}catch{return false}
}

function installHistoryStage(){
  mountHistoryStage();
  if(historyListenerInstalled)return;
  historyListenerInstalled=true;

  document.addEventListener('click',e=>{
    const historyTarget=e.target?.closest?.('[data-go="history"],#nfQuickHistory,.nexa-session-tab[data-stage="history"]');
    if(historyTarget){
      setTimeout(()=>{mountHistoryStage();refreshNativeHistory()},30);
      return;
    }
    if(e.target?.closest?.('#updateHistoryBtn,#submitAuditBtn')){
      setTimeout(()=>{if(document.body.dataset.nexaStage==='history')refreshNativeHistory()},450);
    }
  },true);

  document.addEventListener('input',e=>{
    if(!e.target?.matches?.('.field textarea,.field input,.field select'))return;
    if(document.body.dataset.nexaStage==='history')setTimeout(()=>{
      const stage=q('.nexa-stage-view[data-stage="history"]');if(stage)renderCurrentDraft(stage);
    },0);
  },true);
}

function install(){
  installStyles();
  installStartOnlyRecorder();
  installHistoryStage();
}

install();
[80,220,500,900,1600,2600,4200].forEach(ms=>setTimeout(install,ms));
addEventListener('pageshow',()=>setTimeout(()=>{
  install();
  if(document.body.dataset.nexaStage==='history')refreshNativeHistory();
},30));
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&document.body.dataset.nexaStage==='history')setTimeout(refreshNativeHistory,80);
});

window.nexaRefreshDraftHistory=refreshNativeHistory;
window.__NEXA_V18_6_6_DRAFT_DIAGNOSTIC__={startOnly:true,historyStage:true,nativeDraftStore:true};
})();

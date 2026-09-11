/* NEXA v18.9.10 — Summary state guard · 2026-09-11 */
(()=>{
  'use strict';
  if(window.__NEXA_SUMMARY_STATE_GUARD_V18_9_10__)return;
  window.__NEXA_SUMMARY_STATE_GUARD_V18_9_10__=true;

  const SUMMARY_KEYS=['queixa_principal','hda','comorbidades','antecedentes','medicacoes','alergias','exame_fisico'];
  const q=(sel,root=document)=>root.querySelector(sel);
  const field=key=>q(`.field[data-key="${key}"] textarea`);
  const processBtn=document.getElementById('processBtn');
  const resetBtn=document.getElementById('resetBtn');
  const banner=document.getElementById('bannerArea');
  const saveState=document.getElementById('saveState');
  if(!processBtn||!banner)return;

  let snapshot=null;
  let processing=false;

  function takeSnapshot(){
    const fields={};
    for(const key of SUMMARY_KEYS)fields[key]=field(key)?.value||'';
    const hasContent=Object.values(fields).some(v=>String(v).trim());
    snapshot=hasContent?{
      fields,
      saveClass:saveState?.className||'',
      saveText:saveState?.textContent||''
    }:null;
    return snapshot;
  }

  function restoreSnapshot(){
    if(!snapshot)return false;
    for(const [key,value] of Object.entries(snapshot.fields)){
      const el=field(key);if(!el)continue;
      el.value=value;
      el.dispatchEvent(new Event('input',{bubbles:true}));
    }
    if(saveState){
      saveState.className=snapshot.saveClass||'save-state unsaved';
      saveState.textContent=snapshot.saveText||'não salvo';
    }
    window.dispatchEvent(new CustomEvent('nexa:summary-restored-after-error',{detail:{keys:[...SUMMARY_KEYS]}}));
    return true;
  }

  function finishProcessingIfReady(){
    if(!processing||processBtn.disabled)return;
    const error=!!banner.querySelector('.banner.error');
    if(error)restoreSnapshot();
    snapshot=null;
    processing=false;
  }

  processBtn.addEventListener('click',()=>{
    takeSnapshot();
    processing=true;
    queueMicrotask(finishProcessingIfReady);
  },true);

  const observer=new MutationObserver(()=>queueMicrotask(finishProcessingIfReady));
  observer.observe(banner,{childList:true,subtree:true,characterData:true});
  observer.observe(processBtn,{attributes:true,attributeFilter:['disabled'],childList:true,characterData:true,subtree:true});

  resetBtn?.addEventListener('click',()=>{snapshot=null;processing=false},true);

  window.nexaSummaryStateGuard1910={
    keys:[...SUMMARY_KEYS],
    takeSnapshot,
    restoreSnapshot,
    get active(){return processing},
    get hasSnapshot(){return !!snapshot}
  };
})();

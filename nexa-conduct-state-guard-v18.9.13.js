/* NEXA v18.9.13 — Conduct state guard · 2026-09-11 */
(()=>{
  'use strict';
  if(window.__NEXA_CONDUCT_STATE_GUARD_V18_9_13__)return;
  window.__NEXA_CONDUCT_STATE_GUARD_V18_9_13__=true;

  const processBtn=document.getElementById('processBtn');
  const resetBtn=document.getElementById('resetBtn');
  const copyBtn=document.getElementById('copyConductBtn');
  const banner=document.getElementById('bannerArea');
  const saveState=document.getElementById('saveState');
  const conduct=()=>document.querySelector('.field[data-key="conduta"] textarea');
  if(!processBtn||!banner||!conduct())return;

  let snapshot=null;
  let processing=false;

  function takeSnapshot(){
    const value=conduct()?.value||'';
    snapshot=String(value).trim()?{value}:null;
    return snapshot;
  }

  function restoreSnapshot(){
    if(!snapshot)return false;
    const el=conduct();
    if(!el)return false;
    el.value=snapshot.value;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    if(saveState){
      saveState.className='save-state unsaved';
      saveState.textContent='conduta restaurada · revisar salvamento';
    }
    window.dispatchEvent(new CustomEvent('nexa:conduct-restored-after-error',{detail:{restored:true}}));
    return true;
  }

  async function copyReviewedConduct(){
    const value=String(conduct()?.value||'').trim();
    if(!value)return false;
    try{
      await navigator.clipboard.writeText(value);
      if(copyBtn){
        copyBtn.textContent='Copiado ✓';
        setTimeout(()=>{copyBtn.textContent='⧉ Copiar'},1200);
      }
      window.dispatchEvent(new CustomEvent('nexa:conduct-copied',{detail:{source:'reviewed-textarea'}}));
      return true;
    }catch{
      return false;
    }
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

  copyBtn?.addEventListener('click',event=>{
    if(!String(conduct()?.value||'').trim())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    copyReviewedConduct();
  },true);

  const observer=new MutationObserver(()=>queueMicrotask(finishProcessingIfReady));
  observer.observe(banner,{childList:true,subtree:true,characterData:true});
  observer.observe(processBtn,{attributes:true,attributeFilter:['disabled'],childList:true,characterData:true,subtree:true});

  resetBtn?.addEventListener('click',()=>{
    snapshot=null;
    processing=false;
  },true);

  window.nexaConductStateGuard18913={
    takeSnapshot,
    restoreSnapshot,
    copyReviewedConduct,
    get active(){return processing},
    get hasSnapshot(){return !!snapshot}
  };
})();

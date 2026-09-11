/* NEXA v18.9.13 — Conduct state guard · 2026-09-11 */
(()=>{
  'use strict';
  if(window.__NEXA_CONDUCT_STATE_GUARD_V18_9_13__)return;
  window.__NEXA_CONDUCT_STATE_GUARD_V18_9_13__=true;

  const processBtn=document.getElementById('processBtn');
  const resetBtn=document.getElementById('resetBtn');
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

  resetBtn?.addEventListener('click',()=>{
    snapshot=null;
    processing=false;
  },true);

  window.nexaConductStateGuard18913={
    takeSnapshot,
    restoreSnapshot,
    get active(){return processing},
    get hasSnapshot(){return !!snapshot}
  };
})();

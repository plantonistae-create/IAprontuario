/* NEXA v18.9.12 — Clinical plan request guard · 2026-09-11 */
(()=>{
  'use strict';
  if(window.__NEXA_CLINICAL_PLAN_GUARD_V18_9_12__)return;
  window.__NEXA_CLINICAL_PLAN_GUARD_V18_9_12__=true;

  const PLAN_PATH='/functions/v1/clinical-plan';
  const generateIds=['generateExamsBtn','generatePrescriptionBtn','generateBothPlanBtn'];
  const hypothesisIds=['confirmHypothesisBtn','editHypothesisBtn','undefinedHypothesisBtn','applyEditedHypothesisBtn'];
  const originalFetch=window.fetch.bind(window);
  let active=null;
  let epoch=0;
  let uiBusy=false;

  const byId=id=>document.getElementById(id);
  const hypothesisTextarea=()=>document.querySelector('.field[data-key="hipotese_diagnostica"] textarea');
  const requestUrl=input=>typeof input==='string'?input:(input?.url||'');
  const isPlanRequest=input=>requestUrl(input).includes(PLAN_PATH);

  function lockUi(){
    uiBusy=true;
    for(const id of generateIds){const el=byId(id);if(el)el.disabled=true}
    const apply=byId('applyRxMissingDataBtn');if(apply)apply.disabled=true;
    for(const id of hypothesisIds){const el=byId(id);if(el)el.disabled=true}
    const ta=hypothesisTextarea();if(ta)ta.readOnly=true;
    document.body?.setAttribute('data-nexa-plan-busy','1');
  }

  function unlockUi(){
    uiBusy=false;
    for(const id of hypothesisIds){const el=byId(id);if(el)el.disabled=false}
    const ta=hypothesisTextarea();if(ta)ta.readOnly=false;
    const apply=byId('applyRxMissingDataBtn');if(apply)apply.disabled=false;
    document.body?.removeAttribute('data-nexa-plan-busy');
  }

  function cancelActive(reason='context-changed'){
    epoch++;
    if(active?.controller){
      active.reason=reason;
      try{active.controller.abort()}catch{}
    }
    active=null;
    setTimeout(()=>{if(!active)unlockUi()},0);
  }

  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('button');
    if(!target)return;
    if(generateIds.includes(target.id)||target.id==='applyRxMissingDataBtn'){
      if(uiBusy){
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      uiBusy=true;
      queueMicrotask(lockUi);
      return;
    }
    if(target.id==='resetBtn'||hypothesisIds.includes(target.id)){
      if(active)cancelActive(target.id==='resetBtn'?'reset':'hypothesis-changed');
    }
  },true);

  hypothesisTextarea()?.addEventListener('input',()=>{if(active)cancelActive('hypothesis-changed')},true);

  window.fetch=async function guardedFetch(input,init={}){
    if(!isPlanRequest(input))return originalFetch(input,init);

    const id=++epoch;
    if(active?.controller){
      active.reason='superseded';
      try{active.controller.abort()}catch{}
    }
    const controller=new AbortController();
    const callerSignal=init?.signal;
    if(callerSignal){
      if(callerSignal.aborted)controller.abort(callerSignal.reason);
      else callerSignal.addEventListener('abort',()=>controller.abort(callerSignal.reason),{once:true});
    }
    const request={id,controller,reason:''};
    active=request;
    lockUi();

    try{
      const response=await originalFetch(input,{...init,signal:controller.signal});
      return new Proxy(response,{
        get(target,prop){
          if(prop==='json')return async()=>{
            try{return await target.json()}
            finally{setTimeout(()=>{if(active?.id===id){active=null;unlockUi()}},0)}
          };
          const value=Reflect.get(target,prop,target);
          return typeof value==='function'?value.bind(target):value;
        }
      });
    }catch(error){
      const reason=request.reason;
      if(active?.id===id)active=null;
      setTimeout(()=>{if(!active)unlockUi()},0);
      if(error?.name==='AbortError'){
        if(reason==='superseded')throw new Error('Geração anterior substituída por uma solicitação mais recente.');
        if(reason==='reset')throw new Error('Geração cancelada porque a consulta foi reiniciada.');
        if(reason==='hypothesis-changed')throw new Error('Geração cancelada porque a hipótese clínica foi alterada.');
      }
      throw error;
    }
  };

  window.nexaClinicalPlanGuard18912={
    path:PLAN_PATH,
    get busy(){return uiBusy},
    get activeRequest(){return active?.id||null},
    cancel:cancelActive
  };
})();

/* NEXA v18.9.17 — Protocolos functional guard · 2026-09-11 */
(()=>{
'use strict';
if(window.__NEXA_PROTOCOL_FUNCTIONAL_GUARD_V18_9_17__)return;
window.__NEXA_PROTOCOL_FUNCTIONAL_GUARD_V18_9_17__=true;

const ADMIN_PROTOCOLS_PATH='/functions/v1/admin-protocols';
const originalFetch=window.fetch.bind(window);
let readTail=Promise.resolve();
const mutationInflight=new Map();

const mutationButtons={
  save_draft:'saveProtocolDraftBtn',
  submit_review:'submitProtocolReviewBtn',
  publish:'publishProtocolBtn'
};

function parsePayload(init){
  try{return typeof init?.body==='string'?JSON.parse(init.body):null}catch{return null}
}
function actionKey(payload){
  const action=String(payload?.action||'');
  if(action==='save_draft')return `${action}:${payload?.protocol_id||'new'}:${JSON.stringify(payload)}`;
  return `${action}:${payload?.protocol_id||''}:${payload?.version_id||''}`;
}
function setBusy(action,busy){
  const id=mutationButtons[action];if(!id)return;
  const btn=document.getElementById(id);if(!btn)return;
  if(busy){if(!('protocolPrevDisabled' in btn.dataset))btn.dataset.protocolPrevDisabled=btn.disabled?'1':'0';btn.disabled=true;btn.dataset.protocolBusy='1';}
  else{const prev=btn.dataset.protocolPrevDisabled;delete btn.dataset.protocolPrevDisabled;delete btn.dataset.protocolBusy;if(prev==='0')btn.disabled=false;}
}
function responseClone(resp){return typeof resp?.clone==='function'?resp.clone():resp}

function protocolFetch(input,init={}){
  const url=typeof input==='string'?input:(input?.url||'');
  if(!url.includes(ADMIN_PROTOCOLS_PATH))return originalFetch(input,init);
  const payload=parsePayload(init);
  const action=String(payload?.action||'');
  if(!action)return originalFetch(input,init);

  // Reads are intentionally serialized. This preserves click order and prevents
  // a slower previous list/get response from becoming the final UI state.
  if(action==='list'||action==='get'){
    const run=()=>originalFetch(input,init);
    const request=readTail.then(run,run);
    readTail=request.then(()=>undefined,()=>undefined);
    return request;
  }

  // Mutations are deduplicated while in flight. Double-clicks must not create
  // duplicate drafts, review transitions or publications.
  if(action==='save_draft'||action==='submit_review'||action==='publish'){
    const key=actionKey(payload);
    if(mutationInflight.has(key))return mutationInflight.get(key).then(responseClone);
    setBusy(action,true);
    const request=Promise.resolve().then(()=>originalFetch(input,init));
    mutationInflight.set(key,request);
    return request.then(responseClone).finally(()=>{
      if(mutationInflight.get(key)===request)mutationInflight.delete(key);
      setBusy(action,false);
    });
  }

  return originalFetch(input,init);
}

window.fetch=protocolFetch;
window.nexaProtocolFunctionalGuard18917={
  get mutationInflight(){return mutationInflight},
  get pendingMutations(){return mutationInflight.size},
  parsePayload,actionKey
};
})();

/* NEXA v18.9.11 — Hypothesis / CID validation guard · 2026-09-11 */
(()=>{
  'use strict';
  if(window.__NEXA_HYPOTHESIS_CID_GUARD_V18_9_11__)return;
  window.__NEXA_HYPOTHESIS_CID_GUARD_V18_9_11__=true;

  const cidInput=document.getElementById('physicianCid');
  const cidList=document.getElementById('physicianCidOptions');
  const cidHint=document.getElementById('physicianCidHint');
  const applyBtn=document.getElementById('applyEditedHypothesisBtn');
  if(!cidInput||!cidList||!applyBtn)return;

  const emit=detail=>window.dispatchEvent(new CustomEvent('nexa:cid-validation',{detail}));
  const options=()=>Array.from(cidList.querySelectorAll?.('option')||cidList.children||[]);
  const valueOf=o=>String(o?.value||'').trim().toUpperCase();
  const labelOf=o=>String(o?.label||o?.textContent||'').trim();

  function findExact(raw=cidInput.value){
    const code=String(raw||'').trim().toUpperCase();
    if(!code)return null;
    return options().find(o=>valueOf(o)===code)||null;
  }

  function setHint(text,invalid=false){
    if(!cidHint)return;
    cidHint.textContent=text;
    cidHint.dataset.cidValidation=invalid?'invalid':'valid';
  }

  function validate({silent=false}={}){
    const raw=String(cidInput.value||'').trim();
    if(!raw){
      if(!silent)setHint('CID opcional. Se informado, selecione um código válido do catálogo NEXA.');
      const result={valid:true,empty:true,code:'',description:''};emit(result);return result;
    }

    const match=findExact(raw);
    if(!match){
      if(!silent)setHint('CID-10 não validado. Selecione uma opção válida do catálogo NEXA.',true);
      const result={valid:false,empty:false,code:raw.toUpperCase(),description:''};emit(result);return result;
    }

    const code=valueOf(match),description=labelOf(match).replace(/^\s*[A-Z][0-9A-Z.\-]+\s*[—-]\s*/i,'').trim();
    cidInput.value=code;
    if(!silent)setHint(description?`${code} — ${description}`:`CID-10 ${code} validado no catálogo NEXA.`);
    const result={valid:true,empty:false,code,description};emit(result);return result;
  }

  applyBtn.addEventListener('click',event=>{
    const result=validate();
    if(result.valid)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cidInput.focus?.();
  },true);

  cidInput.addEventListener('blur',()=>validate({silent:false}));

  window.nexaHypothesisCidGuard1911={validate,findExact};
})();

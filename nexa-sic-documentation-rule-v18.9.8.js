/* NEXA v18.9.8 · SIC documentation rule · 2026-09-07 */
(()=>{
'use strict';
if(window.__NEXA_SIC_DOCUMENTATION_RULE_V18_9_8__)return;
window.__NEXA_SIC_DOCUMENTATION_RULE_V18_9_8__=true;
const RULE='Quando o paciente fornecer informação clinicamente relevante cuja expressão original não possa ser convertida com segurança para terminologia médica sem perder, alterar ou inferir sentido, preserve exatamente a expressão relevante do paciente e acrescente imediatamente (SIC), em letras maiúsculas. Não invente equivalente médico. Use (SIC) apenas quando a formulação literal for necessária para fidelidade documental; não aplicar a termos que possam ser traduzidos com segurança para linguagem médica.';
const originalFetch=window.fetch.bind(window);
function normalizeSicText(text){
  return String(text||'')
    .replace(/\[\s*sic\s*\]/gi,'(SIC)')
    .replace(/\(\s*sic\s*\)/gi,'(SIC)');
}
function normalizeStructuredFields(){
  document.querySelectorAll('.field[data-key] textarea').forEach(el=>{
    const next=normalizeSicText(el.value);
    if(next!==el.value)el.value=next;
  });
}
window.fetch=async function(input,init){
  try{
    const url=typeof input==='string'?input:(input?.url||'');
    if(url.includes('/functions/v1/process-consultation')&&init?.body instanceof FormData){
      const body=init.body;
      body.set('documentation_instructions',RULE);
      body.set('sic_policy','preserve_literal_then_(SIC)');
      try{
        const raw=body.get('style_examples');
        const examples=raw?JSON.parse(String(raw)):[];
        if(Array.isArray(examples)&&!examples.some(x=>x?.source_type==='system_rule_sic')){
          examples.push({
            title:'Regra de fidelidade documental — SIC',
            source_type:'system_rule_sic',
            style_quality:'system',
            queixa_principal:'INSTRUÇÃO DO SISTEMA, NÃO É EXEMPLO CLÍNICO.',
            hda:RULE
          });
          body.set('style_examples',JSON.stringify(examples));
        }
      }catch{}
    }
  }catch(e){console.warn('[NEXA] SIC rule injection skipped',e)}
  const response=await originalFetch(input,init);
  return response;
};

document.addEventListener('click',e=>{
  if(e.target?.closest?.('#processBtn,#nexaRadarProcessBtn')){
    [250,800,1800,3500].forEach(ms=>setTimeout(normalizeStructuredFields,ms));
  }
},true);
window.nexaDocumentationSicRule198=RULE;
window.nexaNormalizeSic198=normalizeStructuredFields;
})();

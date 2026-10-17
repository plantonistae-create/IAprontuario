/* NEXA Core Audit & Learning 2.0 — front-end metadata helpers.
 * Never converts a physician click or reviewer suggestion into a clinical finding.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.NexaAuditLearningV2=api;
})(globalThis,()=>{
  "use strict";
  const taxonomy=Object.freeze([
    ["omission","Informação omitida"],
    ["fabrication","Informação inventada"],
    ["temporality","Cronologia / temporalidade"],
    ["speaker","Origem da fala / acompanhante"],
    ["redundancy","Pergunta ou texto redundante"],
    ["clinical_error","Incorreção clínica"],
    ["radar_missed_answer","Radar ignorou resposta"],
    ["radar_missing_red_flag","Radar perdeu sinal de alarme"],
    ["other","Outro motivo"]
  ]);
  const allowed=new Set(taxonomy.map(([id])=>id));
  const integer=n=>Math.max(0,Number.isFinite(Number(n))?Math.floor(Number(n)):0);
  function normalizeMetrics(value={}){
    const source=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
    return {
      consultations:integer(source.consultations),
      ready_for_audit:integer(source.ready_for_audit),
      queued:integer(source.queued),
      approved:integer(source.approved),
      corrected:integer(source.corrected),
      discarded:integer(source.discarded),
      audited_total:integer(source.audited_total),
      core_cases:integer(source.core_cases),
      radar_items_available:integer(source.radar_items_available),
      original_final_available:integer(source.original_final_available),
      reviewed_radar_items:integer(source.reviewed_radar_items),
      evaluation_candidates:integer(source.evaluation_candidates),
      training_rights_approved:integer(source.training_rights_approved)
    };
  }
  function milestone(metrics={}){
    const n=normalizeMetrics(metrics).audited_total;
    const target=n<30?30:n<50?50:n<100?100:n<300?300:500;
    return {audited:n,target,remaining:Math.max(0,target-n),percent:Math.min(100,Math.round(n/target*100)),
      note:target===30?"Primeiro lote para auditoria-piloto":target===50?"Base inicial para avaliar o Radar":target===100?"Dataset clínico inicial":"Etapa experimental de modelos"};
  }
  function normalizeErrors(codes){
    return [...new Set((Array.isArray(codes)?codes:[]).filter(x=>typeof x==="string"&&allowed.has(x)))].slice(0,8);
  }
  function selectCases(rows,{status="pending",search="",limit=12}={}){
    const q=String(search||"").trim().toLowerCase().slice(0,100);
    const list=(Array.isArray(rows)?rows:[]).filter(c=>{
      if(!c||typeof c!=="object")return false;
      if(status!=="all"&&status!=="reviewed"&&c.status!==status)return false;
      if(status==="reviewed"&&!["approved","corrected","discarded"].includes(c.status))return false;
      return !q||String(c.id||"").toLowerCase().includes(q);
    });
    list.sort((a,b)=>{
      const ap=a.status==="pending"?0:1,bp=b.status==="pending"?0:1;
      if(ap!==bp)return ap-bp;
      return ap===0?String(a.submitted_at||"").localeCompare(String(b.submitted_at||""))
        :String(b.reviewed_at||"").localeCompare(String(a.reviewed_at||""));
    });
    return {total:list.length,items:list.slice(0,Math.max(1,Math.min(200,integer(limit))))};
  }
  // Only changes that reference existing string fields can be persisted.
  // Does not infer missing negatives, diagnoses or additional patient data.
  function correctedFields(original,patch={}){
    if(!original||typeof original!=="object"||Array.isArray(original))throw Error("AUDIT_FIELDS_REQUIRED");
    const copy=JSON.parse(JSON.stringify(original));
    for(const [name,value] of Object.entries(patch||{})){
      if(!Object.prototype.hasOwnProperty.call(original,name)||typeof original[name]!=="string"||typeof value!=="string")
        throw Error("AUDIT_FIELD_CHANGE_NOT_ALLOWED");
      if(value.length>20000)throw Error("AUDIT_FIELD_TOO_LONG");
      copy[name]=value;
    }
    return copy;
  }
  return Object.freeze({taxonomy,normalizeMetrics,milestone,normalizeErrors,selectCases,correctedFields});
});

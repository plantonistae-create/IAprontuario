/* NEXA Radar case-by-case auditing: no auto-labels and no silent model training. */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.NexaCoreRadarReviewV3=api;
})(globalThis,()=>{
"use strict";
const SCHEMA="nexa-core-radar-review-v4";
const ISSUE_OPTIONS=Object.freeze([
 ["missed_question","Pergunta necessária não sugerida"],["missed_answer","Radar ignorou resposta"],
 ["false_positive","Pergunta desnecessária"],["redundant_question","Pergunta repetida"],
 ["wrong_priority","Prioridade inadequada"],["missing_red_flag","Sinal de alarme não identificado"],
 ["unsafe_inference","Inferência sem confirmação"],["other","Outro motivo"]
]);
const OUTCOMES=Object.freeze([["confirmed","Confirmado na revisão"],["corrected","Corrigido"],["not_applicable","Não se aplica"]]);
const VERDICTS=Object.freeze([["","Não avaliada"],["relevant","Pertinente"],["irrelevant","Desnecessária"],["uncertain","Depende do contexto"]]);
const REASONS=Object.freeze([["appropriate","Condiz com o caso"],["unrelated","Sem relação com a apresentação"],["duplicate","Redundante"],["unsafe","Risco de inferência indevida"],["context_dependent","Depende dos achados"],["wrong_priority","Prioridade inadequada"],["other","Outro"]]);
const PRIORITIES=Object.freeze([["critical","Crítica"],["high","Importante"],["moderate","Complementar"],["low","Baixa"]]);
const CORE_IDS=Object.freeze(["comorbidities","allergies","medicines"]);
const META_KEYS=Object.freeze(["engine_version","provider","model_version","prompt_version","evidence_version","frontend_version"]);
const safeVersion=/^[A-Za-z0-9._:-]{1,80}$/;
const idRx=/^[a-z][a-z0-9_]{0,63}$/;
const qidRx=/^(?:conflict:)?[a-z][a-z0-9_]{0,63}$/;
const isObj=v=>!!v&&typeof v==="object"&&!Array.isArray(v);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const opt=(arr,selected="")=>arr.map(([v,label])=>'<option value="'+esc(v)+'"'+(v===selected?" selected":"")+">"+esc(label)+"</option>").join("");
const scrubText=v=>String(v??"").trim().replace(/\s+/g," ").slice(0,240);
const detectablePii=v=>/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\d{7,}/i.test(v);
function questionCatalogue(row){
 const context=row?.deidentified_core_context||{};
 const raw=Array.isArray(context?.radar_capture?.items)?context.radar_capture.items:[];
 const deid=Array.isArray(context?.radar_learning?.items)?context.radar_learning.items:[];
 const index=new Map(),ambiguous=new Set();
 for(const item of deid.filter(isObj)){
   const id=String(item.id||item.concept||"");
   if(!qidRx.test(id))continue;
   if(index.has(id)){index.delete(id);ambiguous.add(id);}
   else if(!ambiguous.has(id))index.set(id,item);
 }
 const base=raw.length?raw:deid;
 const found=new Set(),items=[];
 for(const item of base){
  if(!isObj(item))continue;
  const id=String(item.id||item.concept||"");
  const concept=String(item.concept||"");
  if(!qidRx.test(id)||!idRx.test(concept)||found.has(id))continue;
  const desc=index.get(id)||item;
  // Text shown only from the model-deidentified audit snapshot, not raw pre-deidentification capture.
  const q=typeof desc.question==="string"&&!detectablePii(desc.question)?desc.question.trim().slice(0,360):"";
  const why=typeof desc.reason==="string"&&!detectablePii(desc.reason)?desc.reason.trim().slice(0,360):"";
  found.add(id);items.push({id,concept,question:q,reason:why,
   priority:String(item.priority||desc.priority||"moderate"),
   status:String(item.status||desc.status||"to_ask"),
   red_flag:item.red_flag===true||item.redFlag===true,
   text_available:!!q});
  if(items.length>=150)break;
 }
 return items;
}
function conceptOptions(row){
 const s=new Set(CORE_IDS);
 for(const q of questionCatalogue(row))s.add(q.concept);
 return [...s].sort();
}
function snapshotMeta(row){
 const context=isObj(row?.deidentified_core_context)?row.deidentified_core_context:{};
 const snap=isObj(context.audit_submission_snapshot)?context.audit_submission_snapshot:{};
 const prov=isObj(context.provenance)?context.provenance:{};
 const radar=isObj(context.radar_learning)?context.radar_learning:{};
 const capture=isObj(context.radar_capture)?context.radar_capture:{};
 const map={
  engine_version:capture.engine_version||radar.engine_version||"unknown",
  provider:capture.provider||radar.provider||"unknown",
  model_version:capture.model_version||radar.model_version||"unknown",
  prompt_version:capture.prompt_version||radar.prompt_version||"unknown",
  evidence_version:capture.evidence_version||radar.evidence_version||"unknown",
  frontend_version:capture.frontend_version||snap.frontend_version||prov.app_version||"unknown"
 };
 const obj={};for(const key of META_KEYS)obj[key]=typeof map[key]==="string"&&safeVersion.test(map[key])?map[key]:"unknown";
 return obj;
}
function sanitizeLabels(raw,concepts){
 if(!Array.isArray(raw)||raw.length>24)throw Error("RADAR_REVIEW_LABELS_INVALID");
 const allowed=new Set(concepts),issues=new Set(ISSUE_OPTIONS.map(x=>x[0])),outcomes=new Set(OUTCOMES.map(x=>x[0]));
 const out=[],seen=new Set();
 for(const x of raw){
  if(!isObj(x)||Object.keys(x).some(k=>!["concept","issue","outcome"].includes(k))||
   !allowed.has(x.concept)||!issues.has(x.issue)||!outcomes.has(x.outcome))
    throw Error("RADAR_REVIEW_LABEL_INVALID");
  const key=x.concept+":"+x.issue;if(seen.has(key))continue;seen.add(key);
  out.push({concept:x.concept,issue:x.issue,outcome:x.outcome});
 }
 return out;
}
function sanitizeQuestionReviews(raw,questions){
 if(!Array.isArray(raw)||raw.length>150)throw Error("RADAR_QUESTION_REVIEWS_INVALID");
 const allowed=new Set(questions.map(x=>x.id)),out=[],seen=new Set();
 for(const x of raw){
  if(!isObj(x)||!allowed.has(x.question_id)||seen.has(x.question_id)||
    !["relevant","irrelevant","uncertain"].includes(x.verdict)||
    !REASONS.some(y=>y[0]===x.reason_code)||
    Object.keys(x).some(k=>!["question_id","verdict","reason_code"].includes(k)))
    throw Error("RADAR_QUESTION_REVIEW_INVALID");
  out.push({question_id:x.question_id,verdict:x.verdict,reason_code:x.reason_code});seen.add(x.question_id);
 }
 return out;
}
function sanitizeMissingQuestions(raw){
 if(!Array.isArray(raw)||raw.length>30)throw Error("RADAR_MISSING_QUESTIONS_INVALID");
 const out=[],seen=new Set();
 for(const x of raw){
  if(!isObj(x)||Object.keys(x).some(k=>!["question","concept","priority","rationale"].includes(k)))
   throw Error("RADAR_MISSING_QUESTION_INVALID");
  const question=scrubText(x.question),rationale=scrubText(x.rationale);
  if(question.length<8||question.length>240||!idRx.test(x.concept)||
     !PRIORITIES.some(y=>y[0]===x.priority)||detectablePii(question)||detectablePii(rationale))
    throw Error("RADAR_MISSING_QUESTION_PII_OR_INVALID");
  const key=x.concept+":"+question.toLowerCase();if(seen.has(key))continue;seen.add(key);
  out.push({question,concept:x.concept,priority:x.priority,rationale});
 }
 return out;
}
function buildPayload(row,reviewState,labels,expectedRevision=0,questionReviews=[],missingQuestions=[]){
 if(!["not_reviewed","reviewed"].includes(reviewState))throw Error("RADAR_REVIEW_STATE_INVALID");
 if(!Number.isInteger(expectedRevision)||expectedRevision<0)throw Error("RADAR_REVIEW_REVISION_INVALID");
 const q=questionCatalogue(row);
 const l=sanitizeLabels(labels,conceptOptions(row)),qr=sanitizeQuestionReviews(questionReviews,q),missing=sanitizeMissingQuestions(missingQuestions);
 if(reviewState==="not_reviewed"&&l.length)throw Error("RADAR_REVIEW_NEEDS_CONFIRMATION");
 if(reviewState==="reviewed"){
  if(!Array.isArray(row?.deidentified_core_context?.radar_capture?.items)||!q.length||q.some(x=>!x.text_available)||row?.deidentified_core_context?.radar_capture?.trace_truncated===true)
    throw Error("RADAR_SNAPSHOT_INSUFFICIENT_FOR_REVIEW");
  if(qr.length!==q.length)throw Error("RADAR_QUESTIONS_REQUIRE_FULL_REVIEW");
 }
 return Object.freeze({schema_version:SCHEMA,review_state:reviewState,labels:l,capture_meta:snapshotMeta(row),
  question_reviews:qr,missing_questions:missing,expected_revision:expectedRevision});
}
function panelHtml(row,draft={}){
 if(row?.status==='discarded')return '<section class="ax-radar-v3"><h3>Radar</h3><p>Este caso foi descartado e não integra o aprendizado do NEXA Core.</p></section>';
 const questions=questionCatalogue(row),saved=Array.isArray(draft.question_reviews)?draft.question_reviews:[];
 const ratings=new Map(saved.map(q=>[q.question_id,q])),missing=Array.isArray(draft.missing_questions)?draft.missing_questions:[];
 const reviewed=draft.review_state==="reviewed",audited=row?.status!=="pending",rev=Number(draft.revision||0);
 const concepts=conceptOptions(row).map(x=>[x,({comorbidities:"Comorbidades",allergies:"Alergias",medicines:"Medicações contínuas"}[x]||x)]);
 const canComplete=questions.length>0&&questions.every(x=>x.text_available)&&Array.isArray(row?.deidentified_core_context?.radar_capture?.items)&&!row?.deidentified_core_context?.radar_capture?.trace_truncated;
 const cards=questions.map((q,i)=>{
  const state=ratings.get(q.id)||{};
  const kind=q.priority==="critical"||q.red_flag?"Crítica":q.priority==="high"?"Importante":"Complementar";
  return '<div class="ax-radar-question-v4" data-question-id="'+esc(q.id)+'">'+
   '<div class="ax-radar-qheader-v4"><span>'+String(i+1).padStart(2,"0")+' · '+esc(q.concept)+'</span><b>'+esc(kind)+'</b></div>'+
   '<strong>'+esc(q.question||"Texto original não disponível no snapshot desidentificado")+'</strong>'+
   (q.reason?'<p><b>Por que o Radar considerou:</b> '+esc(q.reason)+'</p>':"")+
   '<p>Estado ao registrar: '+esc(q.status)+'</p>'+
   '<div class="ax-radar-v3-inputs"><label>Avaliação<select data-radar-question-verdict="'+esc(q.id)+'">'+opt(VERDICTS,state.verdict||"")+'</select></label>'+
   '<label>Justificativa clínica<select data-radar-question-reason="'+esc(q.id)+'">'+opt(REASONS,state.reason_code||"appropriate")+'</select></label></div></div>';
 }).join("");
 const missingCards=missing.map((x,i)=>'<div class="ax-radar-missing-v4"><div><b>Pergunta que faltou #'+(i+1)+'</b><button type="button" data-ax-radar-missing-remove="'+i+'" aria-label="Remover pergunta faltante">×</button></div><strong>'+esc(x.question)+'</strong><small>'+esc(x.concept)+' · '+esc(x.priority)+(x.rationale?' · '+esc(x.rationale):"")+'</small></div>').join("");
 const covered=ratings.size;
 return '<section class="ax-radar-v3" id="axRadarReviewV3" data-revision="'+rev+'">'+
 '<h3>Auditoria de perguntas do Radar</h3><p>Avalie cada pergunta conforme a queixa e os achados registrados. A necessidade de uma pergunta pode mudar com o contexto; esta revisão é humana, não uma regra automática.</p>'+
 '<div class="ax-radar-coverage-v4"><b><span id="axRadarReviewCountV4">'+covered+'</span> de '+questions.length+' classificadas</b><span>Texto de cada pergunta obtido do snapshot desidentificado</span></div>'+
 (questions.length?'<div id="axRadarQuestionListV4" class="ax-radar-question-list-v4">'+cards+'</div>':
 '<p class="ax-radar-v3-note">Este caso não tem histórico suficiente de perguntas; não será possível afirmar que o Radar foi revisado integralmente.</p>')+
 (row?.deidentified_core_context?.radar_capture?.trace_truncated?'<p class="ax-radar-v3-note">Histórico truncado: não é possível concluir a auditoria integral deste Radar.</p>':"")+
 '<h3>Perguntas que deveriam ter sido feitas</h3><p>Escreva uma pergunta genérica, sem nome, data exata, documento ou outra identificação do paciente. A necessidade clínica depende do caso.</p>'+
 '<div class="ax-radar-v3-inputs"><label>Conceito<select id="axRadarMissingConceptV4">'+opt(concepts)+'</select></label>'+
 '<label>Prioridade<select id="axRadarMissingPriorityV4">'+opt(PRIORITIES,"high")+'</select></label></div>'+
 '<label class="ax-radar-text-v4">Conceito não listado (opcional)<input type="text" id="axRadarMissingCustomConceptV4" maxlength="64" pattern="[a-z][a-z0-9_]*" placeholder="Ex.: neurovascular; letras minúsculas, sem espaço"></label>'+ 
 '<label class="ax-radar-text-v4">Pergunta proposta<textarea id="axRadarMissingTextV4" maxlength="240" placeholder="Ex.: Há alteração de sensibilidade distal ao trauma?"></textarea></label>'+
 '<label class="ax-radar-text-v4">Por que seria relevante? (opcional)<textarea id="axRadarMissingReasonV4" maxlength="240" placeholder="Justificativa clínica sem dados identificáveis"></textarea></label>'+
 '<button type="button" class="ax-reviewbtn" id="axRadarMissingAddV4">+ Adicionar pergunta faltante</button>'+
 '<div class="ax-radar-missing-list-v4">'+missingCards+'</div>'+
 '<details class="ax-radar-extra-v4"><summary>Classificação adicional de falhas do Radar (opcional)</summary>'+
 '<div class="ax-radar-v3-inputs"><label>Conceito<select id="axRadarConceptV3">'+opt(concepts)+'</select></label>'+
 '<label>Tipo de falha<select id="axRadarIssueV3">'+opt(ISSUE_OPTIONS)+'</select></label>'+
 '<label>Resultado<select id="axRadarOutcomeV3">'+opt(OUTCOMES)+'</select></label></div>'+
 '<button type="button" class="ax-reviewbtn" id="axRadarAddV3">+ Classificar falha</button>'+
 '<div class="ax-radar-v3-tags">'+(draft.labels||[]).map((x,i)=>'<span>'+esc(x.concept)+' · '+esc(x.issue)+' <button type="button" data-ax-radar-remove="'+i+'">×</button></span>').join("")+'</div></details>'+
 '<label class="ax-radar-v3-reviewed"><input type="checkbox" id="axRadarReviewedV3" '+(reviewed?"checked":"")+(canComplete?"":" disabled")+
 '> Concluí a avaliação de todas as perguntas que o Radar sugeriu</label>'+
 '<p>Você pode auditar o prontuário agora e deixar o Radar não revisado, ou salvar classificações parciais na pós-auditoria. A aprovação clínica não ativa treinamento.</p>'+
 (audited?'<button type="button" class="ax-bluebtn" id="axRadarSaveV3">Salvar avaliação do Radar (pós-auditoria)</button>':
 '<p class="ax-radar-v3-note">A aprovação/correção salva a classificação das perguntas na mesma transação da auditoria.</p>')+
 '<p role="status" id="axRadarStatusV3"></p></section>';
}
return Object.freeze({SCHEMA,ISSUE_OPTIONS,OUTCOMES,CORE_IDS,VERDICTS,REASONS,PRIORITIES,
 questionCatalogue,conceptOptions,snapshotMeta,sanitizeLabels,sanitizeQuestionReviews,
 sanitizeMissingQuestions,buildPayload,panelHtml});
});
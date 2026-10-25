/* NEXA Core Radar Audit v3: review metadata, NEVER automatic clinical ground truth.
 * The original case, speech and encounter history remain immutable / separate.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.NexaCoreRadarReviewV3=api;
})(globalThis,()=>{
'use strict';
const SCHEMA='nexa-core-radar-review-v3';
const ISSUE_OPTIONS=Object.freeze([
 ['missed_question','Pergunta necessária não sugerida'],
 ['missed_answer','Radar não identificou resposta'],
 ['false_positive','Sugestão clinicamente irrelevante'],
 ['redundant_question','Pergunta repetida'],
 ['wrong_priority','Prioridade inadequada'],
 ['missing_red_flag','Sinal de alarme não identificado'],
 ['unsafe_inference','Inferência sem confirmação'],
 ['other','Outro erro categorizado']
]);
const OUTCOMES=Object.freeze([
 ['confirmed','Confirmado na revisão'],
 ['corrected','Corrigido pelo auditor'],
 ['not_applicable','Não se aplica']
]);
const CORE_IDS=Object.freeze(['comorbidities','allergies','medicines']);
const META_KEYS=Object.freeze(['engine_version','provider','model_version','prompt_version','evidence_version','frontend_version']);
const valid=/^[A-Za-z0-9._:-]{1,80}$/;
const idRx=/^[a-z][a-z0-9_]{0,63}$/;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const safeValue=v=>typeof v==='string'&&valid.test(v)?v:'';
function conceptOptions(caseRow){
 const radar=caseRow?.deidentified_core_context?.radar_learning||{};
 const items=Array.isArray(radar.items)?radar.items:[];
 const values=new Set(CORE_IDS);
 for(const item of items){
  const value=String(item?.concept||item?.id||'');
  if(idRx.test(value))values.add(value);
 }
 return [...values].sort();
}
function snapshotMeta(row){
 const context=isObj(row?.deidentified_core_context)?row.deidentified_core_context:{};
 const source=isObj(context.provenance)?context.provenance:{};
 const snapshot=isObj(context.audit_submission_snapshot)?context.audit_submission_snapshot:{};
 const radar=isObj(context.radar_learning)?context.radar_learning:{};
 const props={
  engine_version:radar.engine_version||source.radar_engine_version||'unknown',
  provider:radar.provider||source.radar_provider||'unknown',
  model_version:radar.model_version||source.radar_model_version||'unknown',
  prompt_version:radar.prompt_version||source.radar_prompt_version||'unknown',
  evidence_version:radar.evidence_version||source.evidence_version||'unknown',
  frontend_version:snapshot.frontend_version||source.app_version||'unknown'
 };
 const meta={};for(const key of META_KEYS)meta[key]=safeValue(props[key])||'unknown';
 return meta;
}
function sanitizeLabels(raw,concepts){
 if(!Array.isArray(raw))throw Error('RADAR_REVIEW_LABELS_INVALID');
 const allowed=new Set(concepts||[]),issues=new Set(ISSUE_OPTIONS.map(([id])=>id)),
  outcomes=new Set(OUTCOMES.map(([id])=>id));
 const output=[],seen=new Set();
 if(raw.length>24)throw Error('RADAR_REVIEW_TOO_MANY_LABELS');
 for(const v of raw){
  if(!isObj(v)||Object.keys(v).some(k=>!['concept','issue','outcome'].includes(k))||
     !allowed.has(v.concept)||!issues.has(v.issue)||!outcomes.has(v.outcome))
    throw Error('RADAR_REVIEW_LABEL_INVALID');
  const key=v.concept+':'+v.issue;
  if(seen.has(key))continue;seen.add(key);
  output.push({concept:v.concept,issue:v.issue,outcome:v.outcome});
 }
 return output;
}
function buildPayload(row,reviewState,labels,expectedRevision=0){
 if(!['not_reviewed','reviewed'].includes(reviewState))throw Error('RADAR_REVIEW_STATE_INVALID');
 if(!Number.isInteger(expectedRevision)||expectedRevision<0)throw Error('RADAR_REVIEW_REVISION_INVALID');
 const l=sanitizeLabels(labels,conceptOptions(row));
 if(reviewState==='not_reviewed'&&l.length)throw Error('RADAR_REVIEW_NEEDS_CONFIRMATION');
 return Object.freeze({schema_version:SCHEMA,
   review_state:reviewState,labels:l,capture_meta:snapshotMeta(row),
   expected_revision:expectedRevision});
}
function optionsHtml(options,selected=''){
 return options.map(([value,label])=>'<option value="'+esc(value)+'"'+(selected===value?' selected':'')+'>'+esc(label)+'</option>').join('');
}
function panelHtml(row,draft){
 const concepts=conceptOptions(row);
 const src=Array.isArray(row?.deidentified_core_context?.radar_learning?.items)
  ? row.deidentified_core_context.radar_learning.items.length:0;
 const isReviewed=draft?.review_state==='reviewed';
 const labels=Array.isArray(draft?.labels)?draft.labels:[];
 const archive=row?.status!=='pending',revision=Math.max(0,Number(draft?.revision||0));
 const labelSelect=concepts.map(v=>[v,({comorbidities:'Comorbidades',allergies:'Alergias',medicines:'Medicações contínuas'}[v]||v)]);
 return '<section class="ax-radar-v3" id="axRadarReviewV3" data-revision="'+revision+'">'+
  '<h3>Avaliação do Radar para o NEXA Core</h3>'+
  '<p>Classifique somente o que foi conferido. Cliques de uso não são verdades clínicas. Nenhum destes dados autoriza treinamento.</p>'+
  '<p class="ax-radar-v3-note">'+src+' itens do Radar no snapshot. Dados técnicos ausentes serão registrados como desconhecidos, não inventados.</p>'+
  '<label class="ax-radar-v3-reviewed"><input type="checkbox" id="axRadarReviewedV3" '+(isReviewed?'checked':'')+'> Revisei o comportamento do Radar neste caso</label>'+
  '<div class="ax-radar-v3-inputs"><label>Conceito<select id="axRadarConceptV3">'+optionsHtml(labelSelect)+'</select></label>'+
  '<label>Problema<select id="axRadarIssueV3">'+optionsHtml(ISSUE_OPTIONS)+'</select></label>'+
  '<label>Resultado<select id="axRadarOutcomeV3">'+optionsHtml(OUTCOMES)+'</select></label></div>'+
  '<button type="button" class="ax-reviewbtn" id="axRadarAddV3">+ Adicionar classificação</button>'+
  '<div class="ax-radar-v3-tags" id="axRadarLabelsV3">'+labels.map((l,i)=>
  '<span>'+esc(l.concept)+' · '+esc(ISSUE_OPTIONS.find(x=>x[0]===l.issue)?.[1]||l.issue)+
  ' <button type="button" data-ax-radar-remove="'+i+'" aria-label="Remover classificação '+(i+1)+'">×</button></span>').join('')+'</div>'+
  (archive?'<button type="button" class="ax-bluebtn" id="axRadarSaveV3">Salvar revisão do Radar (pós-auditoria)</button>':
   '<p class="ax-radar-v3-note">Ao aprovar ou corrigir a auditoria, o Radar será salvo na mesma operação atômica.</p>')+
  '<p role="status" id="axRadarStatusV3"></p></section>';
}
return Object.freeze({SCHEMA,ISSUE_OPTIONS,OUTCOMES,CORE_IDS,conceptOptions,snapshotMeta,
 sanitizeLabels,buildPayload,panelHtml});
});

/**
 * NEXA Core — G0 independent learning + parallel shadow (OFFLINE LAB ONLY).
 *
 * A. compareSyntheticShadow() benchmarks a reference model vs Core against
 *    independently written reference labels. The comparison, scores and
 *    reference outputs are EVALUATION-ONLY: never a training label, filter,
 *    ranking, reward or data-selection signal.
 * B. prepareIndependentSyntheticDataset() accepts a completely separate,
 *    manually authored, original synthetic case. It has no input interface
 *    for API/model outputs or benchmark scores. JSONL is a draft export, not
 *    authorization to train, use clinical data or deploy a clinical model.
 *
 * No calls to models, database, network, filesystem, recorder or provider.
 * No real case, clinical audio, pseudonymized record or clinician note may
 * enter either pathway merely by claiming "synthetic" in a JSON field.
 * A human must independently establish that synthetic provenance is genuine.
 * Reuse existing NEXA shadow and dataset-rights gates; do not bypass them.
 */
export const SHADOW_SCHEMA='nexa-core-independent-shadow-g0';
export const TRAIN_SCHEMA='nexa-core-independent-synthetic-g0';
const ID=/^[a-z][a-z0-9_-]{2,64}$/;
const VERSION=/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/;
const MAX_TEXT=16000;
const MAX_QUESTIONS=64;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>plain(x)&&Object.keys(x).sort().join('|')===[...keys].sort().join('|');
const guard=(yes,code)=>{if(!yes)throw Error(code);};
const directIdentifier=/(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|https?:\/\/|(?:\d{3}\.\d{3}\.\d{3}-\d{2})|(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4})/iu;
const checkText=(s,code)=>{
  guard(typeof s==='string'&&s.length>0&&s.length<=MAX_TEXT&&!directIdentifier.test(s),code);
  return s;
};
function questions(items){
  guard(Array.isArray(items)&&items.length<=MAX_QUESTIONS,'RADAR_QUESTION_SHAPE_REQUIRED');
  const seen=new Set();
  for(const q of items){
    guard(exact(q,['concept_id','question'])&&ID.test(q.concept_id),
      'RADAR_QUESTION_SHAPE_REQUIRED');
    checkText(q.question,'RADAR_QUESTION_SHAPE_REQUIRED');
    guard(!seen.has(q.concept_id),'DUPLICATE_RADAR_CONCEPT');
    seen.add(q.concept_id);
  }
  return seen;
}
function words(s){
  return s.normalize('NFKC').toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/u).filter(Boolean);
}
function wordError(reference,hypothesis){
  const a=words(reference),b=words(hypothesis);
  const d=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let previous=d[0];d[0]=i;
    for(let j=1;j<=b.length;j++){
      const saved=d[j];
      d[j]=Math.min(d[j]+1,d[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));
      previous=saved;
    }
  }
  return {word_errors:d[b.length],reference_words:a.length,
    wer:a.length?Number((d[b.length]/a.length).toFixed(4)):null};
}
function radarMetrics(gold,generated){
  const relevant=[...gold].filter(x=>generated.has(x)).length;
  const missed=gold.size-relevant,additional=generated.size-relevant;
  return {expected:gold.size,generated:generated.size,
    missing_concepts:missed,extra_concepts:additional,
    recall:gold.size?Number((relevant/gold.size).toFixed(4)):null,
    precision:generated.size?Number((relevant/generated.size).toFixed(4)):null};
}
function output(x,provider){
  guard(exact(x,['provider','model_version','transcript','radar_questions','documentation'])
    &&x.provider===provider&&VERSION.test(x.model_version),
    'PROVIDER_OUTPUT_SHAPE_REQUIRED');
  checkText(x.transcript,'TRANSCRIPT_TEXT_REQUIRED');
  checkText(x.documentation,'DOCUMENTATION_TEXT_REQUIRED');
  const q=questions(x.radar_questions);
  return {data:x,concepts:q};
}

/**
 * Performance-only assessment on wholly independently created synthetic
 * examples. The return value never contains verbatim transcripts/questions.
 * NEVER use this assessment to choose or prepare competing-model training
 * data. WER/overlap are proxies, NOT clinical safety or a release threshold.
 */
export function compareSyntheticShadow(input){
  guard(exact(input,['schema_version','source','case_id',
    'reviewed_synthetic_provenance','reference','core','gold']),
    'SHADOW_INPUT_CONTRACT_REQUIRED');
  guard(input.schema_version===SHADOW_SCHEMA&&input.source==='synthetic'
    &&ID.test(input.case_id)&&input.reviewed_synthetic_provenance===true,
    'UNVERIFIED_SYNTHETIC_ONLY');
  const reference=output(input.reference,'openai');
  const core=output(input.core,'nexa-core');
  guard(exact(input.gold,['origin','transcript','radar_questions','documentation'])
    &&input.gold.origin==='independent_human_original',
    'INDEPENDENT_CLINICIAN_REFERENCE_REQUIRED');
  checkText(input.gold.transcript,'GOLD_TRANSCRIPT_REQUIRED');
  checkText(input.gold.documentation,'GOLD_DOCUMENTATION_REQUIRED');
  const goldQuestions=questions(input.gold.radar_questions);
  const measure=model=>({
    transcription:wordError(input.gold.transcript,model.data.transcript),
    radar:radarMetrics(goldQuestions,model.concepts),
    documentation_token_edit_proxy:wordError(input.gold.documentation,model.data.documentation),
  });
  return Object.freeze({
    schema_version:SHADOW_SCHEMA,case_id:input.case_id,
    mode:'synthetic_offline_evaluation_only',
    reference:measure(reference),core:measure(core),
    manual_clinical_review_required:true,
    // Never forward outcomes, labels, rankings or scores to the dataset path.
    training_selection_allowed:false,training_label_allowed:false,
    clinical_release_allowed:false,external_ai_authorized:false,
  });
}

/**
 * Separate, reviewed, human-original synthetic input/output only.
 * The exact whitelist excludes provider outputs, benchmark results,
 * transcripts from real consultations, patient identifiers and audit rows.
 * User-supplied provenance is NOT a cryptographic or legal proof of origin.
 * A documented independent human review remains mandatory before use.
 */
export function prepareIndependentSyntheticDataset(items){
  guard(Array.isArray(items)&&items.length>0&&items.length<=50,
    'SYNTHETIC_BATCH_REQUIRED');
  const ids=new Set(),lines=[];
  for(const x of items){
    guard(exact(x,['schema_version','case_id','source','origin',
      'review','scenario','target']), 'INDEPENDENT_TRAINING_CONTRACT_REQUIRED');
    guard(x.schema_version===TRAIN_SCHEMA&&x.source==='synthetic'&&
      x.origin==='independent_human_original'&&ID.test(x.case_id)&&
      !ids.has(x.case_id),'INDEPENDENT_SYNTHETIC_ORIGIN_REQUIRED');
    ids.add(x.case_id);
    guard(exact(x.review,['clinician_reviewed','no_real_patient_data',
      'no_openai_assisted_creation','original_material_rights_confirmed'])&&
      Object.values(x.review).every(v=>v===true),
      'INDEPENDENT_HUMAN_REVIEW_REQUIRED');
    const scenario=checkText(x.scenario,'ORIGINAL_SYNTHETIC_SCENARIO_REQUIRED');
    guard(exact(x.target,['transcript','radar_questions','documentation']),
      'INDEPENDENT_HUMAN_TARGET_REQUIRED');
    const transcript=checkText(x.target.transcript,'ORIGINAL_TRANSCRIPT_REQUIRED');
    const documentation=checkText(x.target.documentation,'ORIGINAL_DOCUMENTATION_REQUIRED');
    questions(x.target.radar_questions);
    lines.push(JSON.stringify({
      schema_version:TRAIN_SCHEMA,case_id:x.case_id,source:'synthetic',
      origin:'independent_human_original',input:{scenario},
      target:{transcript,radar_questions:x.target.radar_questions,documentation},
    }));
  }
  return Object.freeze({
    status:'SYNTHETIC_JSONL_PREPARED_REVIEW_ONLY',
    record_count:lines.length,jsonl:lines.join('\n')+'\n',
    independent_human_provenance_still_requires_verification:true,
    training_authorized:false,clinical_release_allowed:false,
    external_ai_authorized:false,
  });
}

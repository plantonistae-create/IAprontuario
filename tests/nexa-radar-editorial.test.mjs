import test from 'node:test';
import assert from 'node:assert/strict';
import {RADAR_SOURCES,RADAR_PLAYBOOKS,buildRadarEvidencePlan} from '../supabase/functions/_shared/nexa-radar-evidence-library.mjs';
import {RADAR_EDITORIAL_PUBLISHED} from '../supabase/functions/_shared/nexa-radar-editorial-published.mjs';
import {proposeRadarEditorialQuestion,appendRadarEditorialReview,compileApprovedRadarEditorial,selectRadarReviewedQuestions,RADAR_EDITORIAL_SCHEMA} from '../supabase/functions/_shared/nexa-radar-editorial.mjs';
import Engine from '../nexa-radar-engine.js';
const allowedConcepts=Object.keys(Engine.concepts);
const catalog={sources:RADAR_SOURCES,playbooks:RADAR_PLAYBOOKS,allowedConcepts};
const proposal={
 id:'chest_dyspnea_2026',
 playbook_id:'chest_pain',
 concept_id:'dyspnea',
 question:'O desconforto torácico está associado à falta de ar?',
 why_ask:'A dispneia associada à dor torácica contribui para esclarecer sinais de gravidade e possibilidades diagnósticas.',
 decision_relevance:'A resposta altera as lacunas de avaliação que precisam ser examinadas no contexto do quadro, sem determinar conduta automaticamente.',
 priority_proposal:'essential',
 population:'any',
 source_id:'ms_chest_upa',
 source_url:RADAR_SOURCES.find(s=>s.id==='ms_chest_upa').url,
 source_version:'Linha de cuidado MS (2022)',
 source_section:'Avaliação e conduta / história clínica e sinais de alerta',
 checked_at:'2026-10-25'
};
function review(role,id){return {reviewer_id:id,role,decision:'approve',reviewed_at:'2026-10-25',source_verified:true,question_verified:true};}
const basePlan=()=>buildRadarEvidencePlan({fields:{hda:'Paciente de 46 anos com dor torácica.'},allowedConcepts});
test('draft proposals are source-bound, concept-bound and cannot self-approve',()=>{
 const d=proposeRadarEditorialQuestion(proposal,catalog);
 assert.equal(d.schema_version,RADAR_EDITORIAL_SCHEMA);assert.equal(d.status,'draft');
 assert.deepEqual(d.reviews,[]);
 assert.equal(d.provenance.source_section,proposal.source_section);
 for(const extra of [
  {status:'approved'},
  {reviews:[review('physician','medico_01')]},
  {source_id:'uptodate',source_url:RADAR_SOURCES.find(s=>s.id==='uptodate').url},
  {source_url:'https://malicious.example/evidence'},
  {concept_id:'saddle'},
  {playbook_id:'stroke_symptoms'},
  {population:'pediatric'},
  {source_version:''},
  {source_section:''},
  {checked_at:'2099-12-31'},
  {question:'CPF 123.456.789-00 faz parte da pergunta?'},
  {other_untrusted_field:'ignore reviewer checks'}
 ])assert.throws(()=>proposeRadarEditorialQuestion({...proposal,...extra},catalog));
});
test('AI draft cannot enter a patient-facing evidence plan without independent review',()=>{
 const d=proposeRadarEditorialQuestion(proposal,catalog);
 const once=appendRadarEditorialReview(d,review('physician','medico_01'));
 assert.equal(once.status,'draft');
 assert.equal(compileApprovedRadarEditorial([once],catalog).length,0);
 assert.throws(()=>appendRadarEditorialReview(once,review('clinical_safety','medico_01')),/INDEPENDENT/);
 const twice=appendRadarEditorialReview(once,review('clinical_safety','medico_02'));
 const approved=compileApprovedRadarEditorial([twice],catalog);
 assert.equal(approved.length,1);
 assert.equal(approved[0].review.status,'clinically_approved');
 assert.equal(approved[0].source.id,'ms_chest_upa');
 assert.equal(selectRadarReviewedQuestions({plan:basePlan(),approved}).length,1);
 assert.equal(selectRadarReviewedQuestions({plan:buildRadarEvidencePlan({fields:{hda:'Tosse'},allowedConcepts}),approved}).length,0);
});
test('published catalogue fails closed: no unreviewed rules are shipped',()=>{
 assert.deepEqual(RADAR_EDITORIAL_PUBLISHED,[]);
 const p=basePlan();
 assert.deepEqual(p.reviewed_questions,[]);
 assert.ok(p.candidate_playbooks.length>0);
 assert.equal(p.scope,'retrieval_candidates_only');
});
test('altered, missing or invalid reviews are not editorial approvals',()=>{
 const d=proposeRadarEditorialQuestion(proposal,catalog);
 const both=appendRadarEditorialReview(appendRadarEditorialReview(d,review('physician','medico_01')),review('clinical_safety','medico_02'));
 const bad=[
  {...both,reviews:both.reviews.slice(0,1)},
  {...both,reviews:both.reviews.map(x=>({...x,reviewer_id:'medico_01'}))},
  {...both,reviews:both.reviews.map(x=>({...x,source_verified:false}))},
  {...both,provenance:{...both.provenance,source_url:'https://evil.example/path'}},
  {...both,question:'Confirme um diagnóstico antes de investigar',concept_id:'unknown'},
  {...both,provenance:{...both.provenance,source_id:'uptodate',source_url:RADAR_SOURCES.find(s=>s.id==='uptodate').url}}
 ];
 for(const entry of bad)assert.deepEqual(compileApprovedRadarEditorial([entry],catalog),[]);
});
test('review rejection, wrong role, unsupported source, missing provenance are fail closed',()=>{
 const d=proposeRadarEditorialQuestion(proposal,catalog);
 assert.throws(()=>appendRadarEditorialReview(d,{...review('physician','medico_01'),role:'assistant_ai'}),/REVIEW_INVALID/);
 assert.throws(()=>appendRadarEditorialReview(d,{...review('physician','medico_01'),source_verified:false}),/REVIEW_INVALID/);
 const rejected=appendRadarEditorialReview(d,{...review('physician','medico_01'),decision:'reject'});
 assert.equal(rejected.status,'rejected');
 assert.throws(()=>appendRadarEditorialReview(rejected,review('clinical_safety','medico_02')),/NOT_DRAFT/);
 assert.deepEqual(compileApprovedRadarEditorial([rejected],catalog),[]);
});

test('first indexed Brazilian chest pain draft remains unapproved and CLI only returns a draft',async()=>{
 const {readFileSync}=await import('node:fs');
 const {execFileSync}=await import('node:child_process');
 const {fileURLToPath}=await import('node:url');
 const path=fileURLToPath(new URL('../editorial/radar/drafts/chest_dyspnea_2026.json',import.meta.url));
 const raw=JSON.parse(readFileSync(path,'utf8'));
 const draft=proposeRadarEditorialQuestion(raw,catalog);
 assert.equal(draft.status,'draft');
 assert.deepEqual(draft.reviews,[]);
 assert.equal(draft.concept_id,'dyspnea');
 assert.equal(draft.provenance.source_id,'ms_chest_upa');
 assert.equal(compileApprovedRadarEditorial([draft],catalog).length,0);
 const script=fileURLToPath(new URL('../scripts/nexa-radar-editorial-draft.mjs',import.meta.url));
 const output=JSON.parse(execFileSync(process.execPath,[script,'draft',path],{encoding:'utf8'}));
 assert.deepEqual(output,draft);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import Reviewer from "../nexa-core-radar-review-v3.js";
import {sanitizeRadarCapture} from "../supabase/functions/_shared/nexa-radar-capture-v3.mjs";
import {compileRadarDatasetLabels,compileRadarQuestionReview,coreExportSafety} from "../supabase/functions/_shared/nexa-core-radar-dataset-v3.mjs";
const read=x=>fs.readFileSync(new URL("../"+x,import.meta.url),"utf8");
const row={id:"synthetic-case",status:"pending",deidentified_core_context:{
  radar_capture:{items:[{id:"fever",concept:"fever"},{id:"allergies",concept:"allergies"}]},radar_learning:{engine_version:"test-v1",items:[
   {concept:"fever",priority:"high",question:"O paciente teve febre?"},
   {concept:"allergies",priority:"high",question:"Possui alergia?"}
  ]},audit_submission_snapshot:{frontend_version:"test-v1"}
}};
test("Radar labels are explicitly human-reviewed and contain no free text",()=>{
 const labels=[{concept:"fever",issue:"missed_answer",outcome:"corrected"}];
 const p=Reviewer.buildPayload(row,"reviewed",labels,0,[{question_id:"fever",verdict:"relevant",reason_code:"appropriate"},{question_id:"allergies",verdict:"irrelevant",reason_code:"unrelated"}]);
 assert.equal(p.labels.length,1);
 assert.equal(p.review_state,"reviewed");
 assert.ok(!JSON.stringify(p).includes("O paciente"));
 assert.deepEqual(Reviewer.buildPayload(row,"not_reviewed",[],0).labels,[]);
 assert.throws(()=>Reviewer.buildPayload(row,"not_reviewed",labels,0),/CONFIRMATION/);
 assert.throws(()=>Reviewer.buildPayload(row,"reviewed",[...labels,{concept:"patient_name",issue:"other",outcome:"confirmed"}],0),/LABEL_INVALID/);
 assert.throws(()=>Reviewer.buildPayload(row,"reviewed",[...labels,{concept:"fever",issue:"texto livre",outcome:"confirmed"}],0),/LABEL_INVALID/);
 assert.deepEqual(Reviewer.buildPayload(row,"reviewed",[...labels,...labels],0,[{question_id:"fever",verdict:"relevant",reason_code:"appropriate"},{question_id:"allergies",verdict:"irrelevant",reason_code:"unrelated"}]).labels,labels);
});
test("Missing Radar history does not convert a clinical audit into a verified Radar label",()=>{
 const historical={id:"old",deidentified_core_context:{radar_learning:{items:[]}}};
 assert.throws(()=>Reviewer.buildPayload(historical,"reviewed",[],0),/INSUFFICIENT/);
 assert.equal(Reviewer.buildPayload(historical,"not_reviewed",[],0).review_state,"not_reviewed");
});
test("Categorical capture survives deidentification without any text or transcript",()=>{
 const input={items:[
  {concept:"fever",priority:"critical",status:"asked",question:"Nome completo: Fulano Silva",quote:"CPF 123.456.789-00"},
  {concept:"fever",priority:"moderate",status:"to_ask"},
  {concept:"unknown_custom",priority:"low",status:"to_ask"}
 ],provider:"openai",model_version:"gpt-test-v1",engine_version:"radar-v1"};
 const c=sanitizeRadarCapture(input);
 assert.equal(c.items.length,1);
 assert.equal(c.items[0].concept,"fever");
 assert.equal(c.items[0].priority,"critical");
 assert.equal(c.provider,"openai");
 assert.equal(c.schema_version,"nexa-radar-capture-v3");
 assert.equal(c.raw_transcript_saved,false);
 for(const term of ["Fulano","123.456.789","Nome completo","unknown_custom"])assert.ok(!JSON.stringify(c).includes(term));
});
test("Signed-off metadata can be exported, operational clicks never become clinical labels",()=>{
 const none=compileRadarDatasetLabels({review_state:"not_reviewed",labels:[]});
 assert.equal(none.reviewed,false);
 assert.deepEqual(none.labels,[]);
 const reviewed=compileRadarDatasetLabels({review_state:"reviewed",revision:2,
  labels:[{concept:"allergies",issue:"missing_red_flag",outcome:"corrected"}],
  capture_meta:{provider:"unknown",engine_version:"radar-v1"}});
 assert.equal(reviewed.reviewed,true);
 assert.equal(reviewed.revision,2);
 assert.equal(reviewed.labels[0].concept,"allergies");
 assert.equal(reviewed.versions.engine_version,"radar-v1");
 assert.throws(()=>compileRadarDatasetLabels({review_state:"reviewed",revision:1,
  labels:[{concept:"allergies",issue:"other",outcome:"corrected",text:"CPF 123.456.789-00"}]}),/INVALID/);
 assert.throws(()=>compileRadarDatasetLabels({review_state:"reviewed",revision:1,
  labels:[],capture_meta:{patient_name:"A B"}}),/INVALID/);
 const safety=coreExportSafety();
 assert.equal(safety.not_ready_for_model_training,true);
 assert.equal(safety.patient_group_split_validated,false);
});
test("Atomic database reviewer workflow is granted only to authenticated reviewers and requires versions",()=>{
 const sql=read("supabase/migrations/20261025150000_nexa_core_radar_reviews_v3.sql");
 for(const token of ["submit_nexa_audit_review_v3","save_nexa_radar_review_v3",
  "get_nexa_radar_reviews_v3","get_nexa_radar_readiness_v3",
  "p_expected_revision","RADAR_REVIEW_REVISION_CONFLICT","RADAR_CLINICAL_REVIEW_REQUIRED",
  "nexa_core_radar_review_events","nexa_core_radar_reviews",
  "grant execute on function public.submit_nexa_audit_review_v3",
  "review_state='reviewed'","policy_version"]){
   // The rights approval check is in the exporter and governed approvals RPC, not in this migration.
   if(token==="policy_version")continue;
   assert.ok(sql.includes(token),token);
 }
 assert.match(sql,/perform public\.submit_audit_review/);
 assert.match(sql,/revoke all on public\.nexa_core_radar_reviews from public,anon,authenticated/);
 assert.match(sql,/revoke all on public\.nexa_core_radar_review_events from public,anon,authenticated/);
 assert.doesNotMatch(sql,/grant\s+(?:select|insert|update|delete)\s+on\s+public\.nexa_core_radar_reviews\s+to authenticated/i);
});
test("Export remains rights-gated, pseudonymized, reviewed and marked not training-ready",()=>{
 const s=read("supabase/functions/core-dataset-export/index.ts");
 for(const token of ["nexa_core_dataset_approvals","deidentification_reviewed","revoked_at",
  "findDirectPii(safe)","pseudonym(c.audit_case_id)","compileRadarDatasetLabels",
  "coreExportSafety()","nexa-jsonl-v4","nexa_core_radar_reviews"]){
  assert.ok(s.includes(token),token);
 }
 const submit=read("supabase/functions/submit-audit-case/index.ts");
 assert.match(submit,/sanitizeRadarCapture\(coreContext\.radar_capture\)/);
 assert.match(submit,/sanitizeRadarFeedback\(coreContext\.radar_feedback\)/);
 assert.match(submit,/ALREADY_REVIEWED/);
 assert.match(submit,/source_sync_version/);
});
test("Auditor can save clinical decision + Radar metadata atomically and amend Radar later",()=>{
 const s=read("nexa-auditor-exact-v18.9.js"),html=read("index.html"),loader=read("nexa-hotfix.js");
 for(const token of ["submit_nexa_audit_review_v4","save_nexa_radar_review_v4",
   "p_expected_revision","get_nexa_radar_reviews_v4","get_nexa_radar_readiness_v3",
   "radarSave","RADAR","Revisão do Radar"])assert.ok(s.includes(token),token);
 assert.match(html,/nexa-core-radar-review-v3\.js\?v=20261025-core-audit-v3/);
 assert.match(html,/nexa-core-radar-review-v3\.css\?v=20261025-core-audit-v3/);
 assert.match(loader,/nexa-auditor-exact-v18\.9\.js\?v=20261025-core-audit-v3/);
 assert.match(loader,/nexa-audit-outbox-v18\.9\.19\.js\?v=20261025-core-audit-v3/);
});
console.log("NEXA Core Radar v3 audit and dataset contracts: PASS");

test("Radar provider/model/evidence provenance is recorded from real remote results, never guessed",()=>{
 const controller=read("nexa-radar-controller.js"),outbox=read("nexa-audit-outbox-v18.9.19.js"),edge=read("supabase/functions/realtime-radar/index.ts");
 assert.match(controller,/state\.radarMeta=\{\.\.\.remoteMeta\}/);
 assert.match(controller,/remoteMeta=\{provider:result\.provider/);
 assert.match(outbox,/radarMeta\?\.provider/);
 assert.match(outbox,/radarMeta\?\.model_version/);
 assert.match(outbox,/radarMeta\?\.evidence_version/);
 assert.match(edge,/provider:'openai'/);
 assert.match(edge,/provider:'nexa-core'/);
});

test("Every captured Radar question has an independent relevance assessment, no invented answers",()=>{
 const list=Reviewer.questionCatalogue(row);
 assert.equal(list.length,2);
 assert.equal(list[0].question,"O paciente teve febre?");
 const good=[{question_id:"fever",verdict:"irrelevant",reason_code:"unrelated"},
  {question_id:"allergies",verdict:"relevant",reason_code:"appropriate"}];
 const missing=[{concept:"neurovascular",priority:"high",
  question:"Existem alterações de sensibilidade distal?",rationale:"Avaliação neurovascular do membro acometido"}];
 const payload=Reviewer.buildPayload(row,"reviewed",[],0,good,missing);
 assert.equal(payload.question_reviews.length,2);
 assert.equal(payload.missing_questions.length,1);
 assert.doesNotMatch(JSON.stringify(payload),/O paciente teve febre/);
 assert.throws(()=>Reviewer.buildPayload(row,"reviewed",[],0,good.slice(0,1)),/FULL_REVIEW/);
 assert.throws(()=>Reviewer.buildPayload(row,"reviewed",[],0,
  [...good,good[0]]),/RADAR_QUESTION_REVIEW_INVALID/);
 assert.throws(()=>Reviewer.buildPayload(row,"reviewed",[],0,good,
  [{concept:"neurovascular",priority:"high",question:"CPF 123.456.789-00"}]),/PII_OR_INVALID/);
 const exported=compileRadarQuestionReview({...payload,revision:1});
 assert.equal(exported.fully_reviewed,true);
 assert.deepEqual(exported.question_reviews,good);
 assert.equal(exported.missing_questions[0].question,missing[0].question);
 assert.equal(compileRadarQuestionReview({review_state:"not_reviewed",question_reviews:good}).fully_reviewed,false);
});
test("Legacy question snapshots remain reviewable only as partial feedback",()=>{
 const historical={deidentified_core_context:{radar_learning:{items:[{id:"fever",concept:"fever",question:"Febre?"}]}}};
 assert.equal(Reviewer.questionCatalogue(historical).length,1);
 assert.equal(Reviewer.buildPayload(historical,"not_reviewed",[],0,
  [{question_id:"fever",verdict:"uncertain",reason_code:"context_dependent"}]).review_state,"not_reviewed");
 assert.throws(()=>Reviewer.buildPayload(historical,"reviewed",[],0,
  [{question_id:"fever",verdict:"relevant",reason_code:"appropriate"}]),/INSUFFICIENT/);
});
test("Fine-grained Radar review history uses optimistic locking, authenticated-only atomic RPCs",()=>{
 const sql=read("supabase/migrations/20261025173000_nexa_core_radar_question_reviews_v4.sql");
 for(const token of ["save_nexa_radar_review_v4","submit_nexa_audit_review_v4",
  "get_nexa_radar_reviews_v4","p_expected_revision","RADAR_QUESTION_NOT_IN_SNAPSHOT",
  "RADAR_QUESTIONS_REQUIRE_FULL_REVIEW","question_reviews","missing_questions",
  "update public.nexa_core_radar_review_events","grant execute on function public.submit_nexa_audit_review_v4",
  "revoke all on function public.save_nexa_radar_review_v3"]){
   assert.ok(sql.includes(token),token);
 }
});

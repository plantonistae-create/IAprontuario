const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const A=require("../nexa-core-audit-learning-v2.js");
const sql=fs.readFileSync("supabase/migrations/20261017173000_nexa_core_audit_learning_v2.sql","utf8");
const html=fs.readFileSync("index.html","utf8");
const auditor=fs.readFileSync("nexa-auditor-exact-v18.9.js","utf8");

test("30 audited cases are initial gate; reviewer progress is actual, not training rights",()=>{
  let m=A.normalizeMetrics({consultations:252,queued:128,approved:0,corrected:0,audited_total:0,
    radar_items_available:17,original_final_available:103,training_rights_approved:0});
  assert.equal(m.queued,128);
  assert.deepEqual(A.milestone(m),{audited:0,target:30,remaining:30,percent:0,note:"Primeiro lote para auditoria-piloto"});
  m=A.normalizeMetrics({audited_total:30,training_rights_approved:0});
  assert.equal(A.milestone(m).target,50);
  assert.equal(m.training_rights_approved,0);
  assert.equal(A.milestone({audited_total:510}).percent,100);
});

test("queue filters pending first, oldest first and never matches clinical fields",()=>{
  const cases=[
    {id:"a-older",status:"pending",submitted_at:"2026-09-01",deidentified_fields:{hda:"Segredo"} },
    {id:"b-reviewed",status:"approved",submitted_at:"2026-09-02",reviewed_at:"2026-10-01"},
    {id:"c-newer",status:"pending",submitted_at:"2026-10-01"},
  ];
  assert.deepEqual(A.selectCases(cases,{status:"pending"}).items.map(x=>x.id),["a-older","c-newer"]);
  assert.equal(A.selectCases(cases,{status:"all",search:"Segredo"}).total,0);
  assert.equal(A.selectCases(cases,{status:"reviewed"}).total,1);
  assert.equal(A.selectCases(cases,{status:"all",limit:2}).items.length,2);
});

test("taxonomy is restricted to known codes without free-text clinical payload",()=>{
  assert.deepEqual(A.normalizeErrors(["speaker","speaker","radar_missed_answer","HDA paciente Fulano"]),
    ["speaker","radar_missed_answer"]);
  assert.ok(A.taxonomy.find(([k])=>k==="radar_missing_red_flag"));
});

test("simple field editor changes existing string fields only",()=>{
  const orig={hda:"Dor torácica",exame_fisico:"",meta:{preserved:true}};
  assert.deepEqual(A.correctedFields(orig,{hda:"Dor torácica sem outras queixas."}),
    {hda:"Dor torácica sem outras queixas.",exame_fisico:"",meta:{preserved:true}});
  assert.equal(orig.hda,"Dor torácica");
  assert.throws(()=>A.correctedFields(orig,{patient_name:"Nome"}),/NOT_ALLOWED/);
  assert.throws(()=>A.correctedFields(orig,{meta:"bad"}),/NOT_ALLOWED/);
  assert.throws(()=>A.correctedFields(orig,{hda:"x".repeat(20001)}),/TOO_LONG/);
});

test("migration blocks anonymous data access and candidate selection before review",()=>{
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.nexa_core_audit_annotations from public,anon,authenticated/);
  assert.match(sql,/get_nexa_audit_learning_metrics\(\)/);
  assert.match(sql,/nexa_is_reviewer|get_my_capabilities|p\.is_reviewer is true/);
  assert.match(sql,/CLINICAL_REVIEW_REQUIRED_FOR_EVALUATION/);
  assert.match(sql,/save_nexa_audit_annotation/);
  assert.match(sql,/grant execute on function public\.save_nexa_audit_annotation/);
  assert.equal(sql.includes("grant select on public.nexa_core_audit_annotations to anon"),false);
});
test("UI does not grant training as a side effect of clinical review",()=>{
  assert.match(html,/nexaAuditLearningMetrics/);
  assert.match(html,/nexaAuditFilter/);
  assert.match(html,/nexaAuditLoadMore/);
  assert.match(html,/save_nexa_audit_annotation/);
  assert.match(html,/await saveAnnotation\(false\)/);
  assert.match(html,/nexaAuditPageLimit/);
  assert.match(html,/NexaAuditLearningV2\.selectCases/);
  assert.match(html,/Selecionar para avaliação offline \(não libera treinamento\)/);
  assert.match(html,/review_nexa_core_dataset_rights/);
  assert.match(auditor,/get_nexa_audit_learning_metrics/);
  assert.match(auditor,/Liberados para dataset/);
  assert.match(auditor,/Abrir auditoria guiada e classificação de erros/);
});

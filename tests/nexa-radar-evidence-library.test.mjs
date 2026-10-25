import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {RADAR_EVIDENCE_VERSION,RADAR_SOURCES,RADAR_PLAYBOOKS,buildRadarEvidencePlan} from "../supabase/functions/_shared/nexa-radar-evidence-library.mjs";
import {createCoreRadarRequest,RADAR_API_CONTRACT} from "../supabase/functions/_shared/nexa-core-radar-adapter.mjs";
import {inferRadarLocally} from "../services/nexa-core-radar/infer.mjs";
import Engine from "../nexa-radar-engine.js";
const allow=Object.keys(Engine.concepts);
const plan=(fields,transcript="")=>buildRadarEvidencePlan({fields,transcript,allowedConcepts:allow});
test("national, society and international references are indexed, never ingested as text",()=>{
 assert.ok(RADAR_SOURCES.some(s=>s.id==="ms_chest_upa"));
 assert.ok(RADAR_SOURCES.some(s=>s.id==="ms_stroke"));
 assert.ok(RADAR_SOURCES.some(s=>s.id==="sbc_chest_2025"));
 assert.ok(RADAR_SOURCES.some(s=>s.id==="sbavc_guidelines"));
 assert.ok(RADAR_SOURCES.some(s=>s.id==="amb_guidelines"));
 assert.ok(RADAR_SOURCES.some(s=>s.id==="sbp_fever"));
 assert.ok(RADAR_SOURCES.some(s=>s.id==="nice"));
 assert.ok(RADAR_SOURCES.some(s=>s.id==="ahrq"));
 const uptodate=RADAR_SOURCES.find(s=>s.id==="uptodate");
 assert.equal(uptodate.access,"licensed");
 assert.equal(uptodate.review,"not_ingested");
 for(const p of RADAR_PLAYBOOKS)for(const id of p.focus)assert.ok(allow.includes(id),p.id+": unsupported concept "+id);
});
test("current presenting complaint selects a versioned chest pain reading plan, not approved clinical advice",()=>{
 const out=plan({queixa_principal:"Paciente de 51 anos com dor torácica."});
 assert.equal(out.library_version,RADAR_EVIDENCE_VERSION);
 assert.equal(out.clinical_review,"pending");
 assert.equal(out.scope,"retrieval_candidates_only");
 assert.equal(out.candidate_playbooks[0].id,"chest_pain");
 assert.ok(out.sources.some(s=>s.id==="ms_chest_upa"));
 assert.ok(!out.sources.some(s=>s.id==="uptodate"));
});
test("negated complaint, clinical question only and unknown age cannot trigger unsuitable playbook",()=>{
 assert.equal(plan({hda:"Nega dor torácica"}).candidate_playbooks.length,0);
 assert.equal(plan({}, "Médico: O senhor está com dor torácica?").candidate_playbooks.length,0);
 assert.equal(plan({hda:"Febre desde ontem"}).candidate_playbooks.length,0);
 assert.equal(plan({hda:"Fraqueza súbita de um lado"}).candidate_playbooks.length,0);
});
test("documented population restricts adult stroke and pediatric fever reading candidates",()=>{
 assert.equal(plan({hda:"Paciente de 6 anos com febre"}).candidate_playbooks[0].id,"pediatric_fever");
 assert.equal(plan({hda:"Paciente de 59 anos com fraqueza súbita de um lado"}).candidate_playbooks[0].id,"stroke_symptoms");
 assert.equal(plan({hda:"Paciente de 8 anos com fraqueza súbita de um lado"}).candidate_playbooks.length,0);
});
test("evidence plan contains no patient names, free text or unapproved licensed content",()=>{
 const name="Nome de Paciente HIPERSENSIVEL";
 const out=plan({queixa_principal:name+" refere falta de ar"},name+" documento confidencial");
 const json=JSON.stringify(out);
 assert.equal(json.includes(name),false);
 assert.equal(json.includes("documento confidencial"),false);
 assert.equal(json.includes("uptodate"),false);
 assert.ok(out.candidate_playbooks[0].focus_concepts.includes("spo2"));
});
test("Core v1 contract carries identical evidence plan without breaking baseline response",()=>{
 const fields={hda:"Paciente de 59 anos com dor torácica."};
 const req=createCoreRadarRequest({fields,conceptIds:allow,model:"cpu-candidate"});
 assert.equal(req.schema_version,RADAR_API_CONTRACT);
 assert.deepEqual(req.evidence_context,plan(fields));
 assert.equal(req.evidence_context.candidate_playbooks[0].id,"chest_pain");
 const result=inferRadarLocally(req);
 assert.equal(result.schema_version,RADAR_API_CONTRACT);
 assert.ok(Array.isArray(result.result.items));
 assert.ok(Array.isArray(result.result.observations));
});
test("both remote paths consume the same provider-neutral library",()=>{
 const edge=fs.readFileSync(new URL("../supabase/functions/realtime-radar/index.ts",import.meta.url),"utf8");
 assert.match(edge,/buildRadarEvidencePlan/);
 assert.match(edge,/evidencePlan\.library_version/);
 assert.match(edge,/createCoreRadarRequest/);
});

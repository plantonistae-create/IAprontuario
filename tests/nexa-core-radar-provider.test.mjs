import test from "node:test";
import assert from "node:assert/strict";
import { resolveCapability } from "../supabase/functions/_shared/nexa-ai-capability.mjs";
import { createCoreRadarRequest,requestCoreRadar,RADAR_API_CONTRACT,resolveCoreRadarEndpoint } from "../supabase/functions/_shared/nexa-core-radar-adapter.mjs";
import { sanitizeRadarFeedback } from "../supabase/functions/_shared/nexa-radar-feedback.mjs";
import { safeCoreContext,findDirectPii } from "../supabase/functions/submit-audit-case/audit-contract.mjs";

test("Radar can select NEXA Core as separate provider without changing browser API",()=>{
 const p=resolveCapability("realtime.radar",{provider:"nexa-core",model:"core-radar-1"});
 assert.equal(p.provider,"nexa-core");
 assert.equal(p.adapterVersion,"radar-nexa-core-http-v1");
 assert.notEqual(p.adapterVersion,resolveCapability("realtime.radar",{provider:"openai"}).adapterVersion);
});
test("Core URL is HTTPS, fixed-path, without credentials, query or private IP",()=>{
 assert.equal(resolveCoreRadarEndpoint("https://radar.example.org/v1/radar/analyze"),"https://radar.example.org/v1/radar/analyze");
 for(const url of [
  "http://radar.example.org/v1/radar/analyze",
  "https://localhost/v1/radar/analyze",
  "https://127.0.0.1/v1/radar/analyze",
  "https://radar.example.org/@evil",
  "https://user:pass@radar.example.org/v1/radar/analyze",
  "https://radar.example.org/v1/radar/analyze?trace=1"
 ])assert.throws(()=>resolveCoreRadarEndpoint(url));
});
test("Core request communicates safety constraints and explicit version only",()=>{
 const r=createCoreRadarRequest({transcript:"Cefaleia. Médico: Febre? Paciente: Não.",fields:{hda:"Cefaleia."},conceptIds:["fever","headache"]});
 assert.equal(r.schema_version,RADAR_API_CONTRACT);
 assert.equal(r.capability,"realtime.radar");
 assert.equal(r.constraints.doctor_question_is_not_patient_response,true);
 assert.equal(r.constraints.no_inferred_negatives,true);
 assert.equal(JSON.stringify(r).includes("apiKey"),false);
});
test("Core requires server credential, accepts validated schema and never contacts OpenAI",async()=>{
 let args;
 const result=await requestCoreRadar({
  url:"https://core.example.org/v1/radar/analyze",
  apiKey:"synthetic-server-test-key-long-enough",
  payload:createCoreRadarRequest({fields:{hda:"Cefaleia"},conceptIds:["fever"]}),
  fetchImpl:async(url,opts)=>{
   args={url,opts};
   return new Response(JSON.stringify({schema_version:RADAR_API_CONTRACT,result:{items:[],observations:[]}}),{status:200});
  }
 });
 assert.deepEqual(result,{items:[],observations:[]});
 assert.equal(args.url,"https://core.example.org/v1/radar/analyze");
 assert.equal(args.opts.redirect,"error");
 assert.equal(args.opts.headers.Authorization,"Bearer synthetic-server-test-key-long-enough");
 assert.equal(args.opts.body.includes("synthetic-server-test-key"),false);
});
test("Core rejects invalid output, server errors and absent auth (no silent fallback)",async()=>{
 const payload=createCoreRadarRequest({conceptIds:["fever"]});
 const fetchImpl=async()=>new Response(JSON.stringify({items:[],observations:[]}),{status:200});
 await assert.rejects(requestCoreRadar({url:"https://core.example.org/v1/radar/analyze",apiKey:"long-test-key-long-test-key",payload,fetchImpl}),/CONTRACT_INVALID/);
 await assert.rejects(requestCoreRadar({url:"https://core.example.org/v1/radar/analyze",apiKey:"",payload,fetchImpl}),/AUTH_NOT_CONFIGURED/);
 await assert.rejects(requestCoreRadar({url:"https://core.example.org/v1/radar/analyze",apiKey:"long-test-key-long-test-key",payload,fetchImpl:async()=>new Response("unavailable",{status:503})}),/UPSTREAM_FAILED/);
});
test("Manual Radar annotation strips raw answers, names, PHI and timestamps",()=>{
 const source={
  actions:{
   dyspnea:{action:"evaluated",value:"Paciente Fulano de Tal tem CPF 123.456.789-00",at:"2026-10-17"},
   fever:{action:"dismissed",quote:"Mãe relatou febre"},
   "conflict:fever":{action:"not_applicable",raw:"não guardar"},
   "patient_name":{action:"weird",value:"João"},
  },
  metrics:{covered:5,suggested:8,alerts:1,confirm:2},
  transcript:"CONSULTA SECRETA",
  patient:"João"
 };
 const result=sanitizeRadarFeedback(source);
 const audit=safeCoreContext({radar_feedback:source});
 for(const output of [result,audit.radar_feedback]){
  assert.equal(output.actions.length,3);
  assert.equal(output.actions[0].concept,"dyspnea");
  assert.equal(output.action_counts.evaluated,1);
  assert.equal(output.human_review_required_for_training_labels,true);
  const text=JSON.stringify(output);
  for(const secret of ["123.456.789-00","João","Fulano","CONSULTA SECRETA","Mãe relatou"])assert.equal(text.includes(secret),false);
  assert.deepEqual(findDirectPii(output),[]);
 }
});

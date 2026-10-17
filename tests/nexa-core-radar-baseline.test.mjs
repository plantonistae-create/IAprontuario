import test from "node:test";
import assert from "node:assert/strict";
import Engine from "../nexa-radar-engine.js";
import {inferRadarLocally} from "../services/nexa-core-radar/infer.mjs";
import {createCoreRadarRequest,RADAR_API_CONTRACT} from "../supabase/functions/_shared/nexa-core-radar-adapter.mjs";
import {validate,validateObservations} from "../supabase/functions/realtime-radar/contract.mjs";
const conceptIds=Object.keys(Engine.concepts);
function query(hda,transcript=""){
  return createCoreRadarRequest({transcript,fields:{hda},conceptIds,model:"nexa-radar-cpu-baseline"});
}
test("independent CPU Radar produces compliant evidence-bound suggestions",()=>{
 const payload=query("Dor torácica.");
 const result=inferRadarLocally(payload);
 assert.equal(result.schema_version,RADAR_API_CONTRACT);
 assert.ok(result.result.items.some(i=>i.concept==="dyspnea"));
 const filtered=validate(result.result,conceptIds,"Dor torácica.");
 assert.equal(filtered.length,result.result.items.length);
 assert.ok(result.result.items.every(i=>"concept priority category contextEvidence".split(" ").every(k=>Object.hasOwn(i,k))));
});
test("confirmed negative answer prevents redundant safety gap without claiming alert absent",()=>{
 const payload=query("Dor torácica. Nega dispneia.");
 const result=inferRadarLocally(payload).result;
 assert.equal(result.items.some(i=>i.concept==="dyspnea"),false);
 const filtered=validateObservations(result,conceptIds,{hda:"Dor torácica. Nega dispneia."},"");
 assert.ok(filtered.every(x=>x.subject==="patient"));
});
test("third-party fever cannot become patient's own fever finding",()=>{
 const spoken="Cefaleia. Minha mãe teve febre.";
 const result=inferRadarLocally(query("Cefaleia.",spoken)).result;
 assert.equal(result.observations.some(o=>o.concept==="fever"&&o.state==="known_present"),false);
});
test("invalid or unsupported request fails closed",()=>{
 assert.throws(()=>inferRadarLocally({schema_version:"fake",capability:"realtime.radar",context:{},allowed_concepts:[]}),/RADAR_BASELINE_INVALID_REQUEST/);
 assert.throws(()=>inferRadarLocally({schema_version:RADAR_API_CONTRACT,capability:"other",context:{},allowed_concepts:[]}),/RADAR_BASELINE_INVALID_REQUEST/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {
 reproduceSyntheticOfferRace,syntheticEdgeEnvelope,
} from '../experimental/nexa-webrtc-negotiation-lab.mjs';

test('a synthetic ICE candidate can exist in updated localDescription but not original offer snapshot',async()=>{
 const result=await reproduceSyntheticOfferRace();
 assert.equal(result.fixture_only,true);
 assert.equal(result.offer_snapshot_candidate_count,0);
 assert.equal(result.complete_local_description_candidate_count,1);
 assert.equal(result.ice_gathering_state,'complete');
 assert.equal(result.candidate_can_be_missing_when_sending_offer_snapshot,true);
 assert.equal(result.proves_real_upstream_502_cause,false);
 assert.equal(result.provider_request_count,0);
 assert.equal(result.clinical_runtime_modified,false);
 const json=JSON.stringify(result);
 for(const forbidden of ['192.0.2.10','a=candidate','transcript','patient_id','sdp','authorization','api_key'])
  assert.equal(json.includes(forbidden),false,'no SDP, network or identifiers may appear in report');
});
test('an Edge 502 envelope can mask 4xx, 429, 5xx upstream responses in synthetic replay',()=>{
 for(const status of [400,401,403,404,422,429,500,503]){
  const result=syntheticEdgeEnvelope(status);
  assert.equal(result.simulated_edge_http_status,502);
  assert.equal(result.provider_invoice_known,false);
  assert.equal(result.is_production_observation,false);
 }
 for(const status of [200,201,204])assert.equal(syntheticEdgeEnvelope(status).simulated_edge_http_status,200);
 for(const status of [-1,99,600,NaN,Infinity,'400'])assert.throws(()=>syntheticEdgeEnvelope(status));
});
test('lab observes current frontend offer snapshot path, does not patch it',()=>{
 const frontend=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(frontend,/const offer=await pc\.createOffer\(\)/);
 assert.match(frontend,/await pc\.setLocalDescription\(offer\)/);
 assert.match(frontend,/body:JSON\.stringify\(\{sdp:offer\.sdp/);
 assert.equal(frontend.includes('await pc.setLocalDescription(offer);'),true);
 // This test records current behavior. It does NOT authorize a production fix.
});
test('lab has no paid API, microphone, Supabase, Deno or clinical dependencies',()=>{
 const lab=readFileSync(new URL('../experimental/nexa-webrtc-negotiation-lab.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(lab,/\bfetch\s*\(|\bWebSocket\s*\(|\bgetUserMedia\s*\(|\bDeno\.serve\s*\(/);
 assert.doesNotMatch(lab,/https:\/\/api\.openai\.com/);
 assert.doesNotMatch(lab,/import\s+.+from\s+['"]\.\.\/(?!)/);
});

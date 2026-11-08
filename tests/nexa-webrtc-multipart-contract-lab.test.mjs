import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {inspectSyntheticMultipartWire} from '../experimental/nexa-webrtc-multipart-contract-lab.mjs';

test('hosted-v6-compatible synthetic FormData carries filename for both fields',async()=>{
 const result=await inspectSyntheticMultipartWire();
 assert.equal(result.synthetic_fixture,true);
 assert.deepEqual(result.current_edge_form,{
  sdp:{present:true,classified_as_file:true,content_type:'application/sdp'},
  session:{present:true,classified_as_file:true,content_type:'application/json'}
 });
 assert.deepEqual(result.plain_field_reference,{
  sdp:{present:true,classified_as_file:false,content_type:null},
  session:{present:true,classified_as_file:false,content_type:null}
 });
 assert.equal(result.proves_upstream_status,false);
 assert.equal(result.proves_ice_root_cause,false);
 assert.equal(result.billed_model_calls,0);
});

test('synthetic report never emits SDP, credentials, response body or clinical text',async()=>{
 const report=JSON.stringify(await inspectSyntheticMultipartWire());
 for(const forbidden of [
  'synthetic-offer','synthetic-model','filename="offer.sdp"',
  'filename="session.json"','Authorization','Bearer ',
  'transcript','patient_id','recording','audio_payload'
 ]) assert.equal(report.includes(forbidden),false);
});

test('deployed-compatible multipart shape exists in main Edge source, but no runtime patch is made',()=>{
 const code=readFileSync(new URL('../supabase/functions/realtime-call/index.ts',import.meta.url),'utf8');
 assert.match(code,/new Blob\(/);
 assert.match(code,/"offer\.sdp"/);
 assert.match(code,/"session\.json"/);
 assert.match(code,/form\.append\(/);
 // Asserts the known status-envelope transformation, not that provider
 // actually responded with an HTTP 502.
 assert.match(code,/REALTIME_SESSION_FAILED/);
});

test('synthetic inspection module cannot make network or clinical API requests',()=>{
 const code=readFileSync(new URL('../experimental/nexa-webrtc-multipart-contract-lab.mjs',import.meta.url),'utf8');
 for(const pattern of [/\bfetch\s*\(/,/\bWebSocket\s*\(/,/\bDeno\.serve\s*\(/,
   /\bgetUserMedia\s*\(/,/process\.env/,/localStorage/,/\bimport\s+.*\bfrom\s+['"]/])
  assert.doesNotMatch(code,pattern);
});

// Isolated tests of the ACTUAL frozen hosted v6 and its string-field candidate.
// Only source text is evaluated, never the hosted Edge Function. No network,
// microphone, credentials, personal data, SDP or audio from real patients.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root = new URL('../labs/nexa-realtime-v6/', import.meta.url);
const sources = Object.freeze({
  hosted: readFileSync(new URL('reference/index.ts.txt', root), 'utf8'),
  candidate: readFileSync(new URL('candidate/index.ts.txt', root), 'utf8')
});
const OFFER = 'v=0\r\ns=synthetic-only\r\n';

function extract(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'frozen source function boundaries required');
  return source.slice(from, to);
}
function mockRuntime(kind, {status=200, timeout=false, invalidJson=false}={}) {
  assert.ok(Object.hasOwn(sources,kind));
  const requests=[], metric=[], deadlines=[];
  const context={
    FormData, Blob, Response, File:class SyntheticFile {},
    REALTIME_MODEL:'synthetic-model', TRANSCRIBE_MODEL:'synthetic-transcriber',
    OPENAI_API_KEY:'FAKE-TEST-ONLY',
    AbortSignal:{timeout(ms){deadlines.push(ms);return {aborted:false};}},
    json(payload,statusCode=200) {
      return new Response(JSON.stringify(payload),{status:statusCode,
        headers:{'content-type':'application/json'}});
    },
    emitRealtimeUpstreamStatus(transport,code){metric.push({transport,code});},
    fetch: async (url,init) => {
      assert.ok([
        'https://api.openai.com/v1/realtime/calls',
        'https://api.openai.com/v1/audio/transcriptions'
      ].includes(url),'only fake endpoints allowed in test');
      assert.equal(init.method,'POST');
      assert.equal(init.headers.Authorization,'Bearer FAKE-TEST-ONLY');
      const mode=url.endsWith('/calls')?'webrtc':'chunk';
      const sdp=init.body.get('sdp'), session=init.body.get('session');
      requests.push({mode,sdp_type:typeof sdp,session_type:typeof session,
        file_type:typeof init.body.get('file'),
        has_sdp: sdp!==null,has_session:session!==null});
      if(timeout){const e=new Error('mock deadline');e.name='TimeoutError';throw e;}
      return new Response(invalidJson?'not-json':
        mode==='webrtc'?'v=0\r\ns=synthetic-answer\r\n':
        JSON.stringify({text:'SYNTHETIC-CHUNK'}),
        {status});
    }
  };
  let webrtc = extract(sources[kind],
    'async function createRealtimeCall(', 'async function transcribeFallback(');
  webrtc = webrtc.replace('body: Record<string, unknown>,','body,');
  assert.ok(!webrtc.includes('body: Record<string, unknown>'),'TypeScript adapter');
  let chunk = extract(sources[kind],
    'async function transcribeFallback(', 'Deno.serve(');
  chunk=chunk.replace('req: Request,','req,')
    .replace('let parsed: {text?: unknown} = {};','let parsed = {};');
  assert.ok(!chunk.includes('req: Request')&&!chunk.includes('let parsed: {'),'TypeScript adapter');
  // No Deno.serve, Auth, WebRTC, real fetch, timers or secrets are executed.
  vm.runInNewContext(webrtc+'\n'+chunk,context,{timeout:1000});
  return {context,requests,metric,deadlines};
}

for(const kind of ['hosted','candidate']) {
  test(kind+': invalid SDP is rejected locally with zero model requests', async()=>{
    const h=mockRuntime(kind);
    const r=await h.context.createRealtimeCall({sdp:'invalid'});
    assert.equal(r.status,400);
    assert.equal((await r.json()).error,'INVALID_SDP');
    assert.equal(h.requests.length,0);
    assert.equal(h.metric.length,0);
  });
  test(kind+': successful synthetic session and immutable wire classification',async()=>{
    const h=mockRuntime(kind);
    const r=await h.context.createRealtimeCall({sdp:OFFER});
    assert.equal(r.status,200);
    const data=await r.json();
    assert.equal(data.mode,'webrtc');
    assert.equal(data.transient,true);
    assert.equal(data.official_transcript,false);
    assert.deepEqual(h.deadlines,[18000]);
    assert.equal(h.requests.length,1);
    assert.equal(h.requests[0].has_sdp,true);
    assert.equal(h.requests[0].has_session,true);
    assert.equal(h.requests[0].sdp_type,kind==='candidate'?'string':'object');
    assert.equal(h.requests[0].session_type,kind==='candidate'?'string':'object');
    assert.equal(JSON.stringify(h.metric),JSON.stringify([{transport:'webrtc',code:200}]));
  });
  test(kind+': upstream failures retain explicit code beneath Edge 502',async()=>{
    for(const status of [400,401,403,422,429,500,503]){
      const h=mockRuntime(kind,{status});
      const r=await h.context.createRealtimeCall({sdp:OFFER});
      assert.equal(r.status,502);
      const body=await r.json();
      assert.equal(body.error,'REALTIME_SESSION_FAILED');
      assert.equal(body.status,status);
      assert.equal(h.requests.length,1,'no automatic retry or duplicate charge');
      assert.equal(h.metric.length,1);
      assert.equal(h.metric[0].code,status);
    }
  });
  test(kind+': simulated timeout propagates without retry and without body logging',async()=>{
    const h=mockRuntime(kind,{timeout:true});
    await assert.rejects(h.context.createRealtimeCall({sdp:OFFER}),{name:'TimeoutError'});
    assert.deepEqual(h.deadlines,[18000]);
    assert.equal(h.requests.length,1);
    assert.equal(h.metric.length,0,'no upstream HTTP status exists on timeout');
  });
  test(kind+': fallback chunk HTTP failure is tracked without audio content',async()=>{
    const h=mockRuntime(kind,{status:429});
    const fd=new FormData();
    fd.set('audio',new Blob(['SYNTHETIC-NON-AUDIO'],{type:'audio/webm'}),'fiction.webm');
    const response=await h.context.transcribeFallback({formData:async()=>fd});
    assert.equal(response.status,502);
    const payload=await response.json();
    assert.equal(payload.error,'FALLBACK_TRANSCRIPTION_FAILED');
    assert.equal(payload.status,429);
    assert.equal(h.requests.length,1);
    assert.equal(h.requests[0].mode,'chunk');
    assert.equal(h.metric.length,1);
    assert.equal(h.metric[0].transport,'chunk');
    assert.deepEqual(h.deadlines,[18000]);
  });
  test(kind+': successful synthetic chunk returns transcript without new logging',async()=>{
    const h=mockRuntime(kind);
    const fd=new FormData();
    fd.set('audio',new Blob(['NO-AUDIO'],{type:'audio/webm'}),'fiction.webm');
    const response=await h.context.transcribeFallback({formData:async()=>fd});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.text,'SYNTHETIC-CHUNK');
    assert.equal(body.official_transcript,false);
    assert.equal(h.requests.length,1);
    assert.equal(h.metric.length,0);
  });
  test(kind+': missing chunk is rejected before fake upstream',async()=>{
    const h=mockRuntime(kind);
    const response=await h.context.transcribeFallback({formData:async()=>new FormData()});
    assert.equal(response.status,400);
    assert.equal((await response.json()).error,'AUDIO_REQUIRED');
    assert.equal(h.requests.length,0);
  });
  test(kind+': fallback timeout is single attempt, not a model retry loop',async()=>{
    const h=mockRuntime(kind,{timeout:true});
    const fd=new FormData();
    fd.set('audio',new Blob(['NO-AUDIO'],{type:'audio/webm'}),'fiction.webm');
    await assert.rejects(h.context.transcribeFallback({formData:async()=>fd}),{name:'TimeoutError'});
    assert.equal(h.requests.length,1);
    assert.equal(h.metric.length,0);
  });
}
test('source fixtures contain no credential values or clinical data files',()=>{
  for(const key of Object.keys(sources)){
    const source=sources[key];
    assert.ok(source.includes('getAuthenticatedUser('));
    assert.ok(source.includes('CLINICAL_ACCESS_REQUIRED'));
    assert.ok(!source.includes('sk-proj-'));
    assert.ok(!source.includes('SYNTHETIC-NON-AUDIO'));
  }
});

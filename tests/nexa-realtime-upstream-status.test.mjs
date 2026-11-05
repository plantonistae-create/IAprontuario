import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emitRealtimeUpstreamStatus,realtimeUpstreamMetric} from '../supabase/functions/_shared/nexa-realtime-upstream-status.mjs';

test('WebRTC upstream HTTP errors are distinguished from NEXA wrapper 502 without payload logging',()=>{
 for(const status of [200,400,401,403,404,409,422,429,500,502,503,504]){
  const lines=[];
  const result=emitRealtimeUpstreamStatus('webrtc',status,line=>lines.push(line));
  assert.deepEqual(JSON.parse(lines[0]),result);
  assert.deepEqual(Object.keys(result).sort(),['event','successful','transport','upstream_http_status']);
  assert.equal(result.upstream_http_status,status);
  assert.equal(result.successful,status>=200&&status<300);
  assert.equal(result.event,'nexa_realtime_upstream_v1');
 }
});

test('chunk failures are attributable without exposing audio or transcript',()=>{
 const lines=[];
 const fake={status:429,body:'Patient private transcript',url:'https://secret.local',api_key:'secret'};
 const r=emitRealtimeUpstreamStatus('chunk',fake.status,l=>lines.push(l));
 assert.equal(r.upstream_http_status,429);
 for(const text of [fake.body,fake.url,fake.api_key])assert.equal(lines[0].includes(text),false);
 assert.equal(JSON.stringify(r).includes('private'),false);
 assert.equal(JSON.stringify(r).includes('secret'),false);
});

test('malformed diagnostic data does not write logs and logging failure does not interrupt clinical flow',()=>{
 let called=0;
 for(const transport of ['other','',undefined,'webrtc '] )
  assert.equal(emitRealtimeUpstreamStatus(transport,502,()=>called++),null);
 for(const status of [-1,0,99,600,Infinity,NaN,'502',null,undefined])
  assert.equal(emitRealtimeUpstreamStatus('webrtc',status,()=>called++),null);
 assert.equal(called,0);
 assert.equal(realtimeUpstreamMetric('webrtc',502).successful,false);
 assert.doesNotThrow(()=>emitRealtimeUpstreamStatus('webrtc',502,()=>{throw Error('logger down')}));
});

test('status-only instrumentation appears after OpenAI response; clinical paths and fallback remain intact',()=>{
 const src=readFileSync(new URL('../supabase/functions/realtime-call/index.ts',import.meta.url),'utf8');
 assert.match(src,/import \{ emitRealtimeUpstreamStatus \} from ".\.\.\/_shared\/nexa-realtime-upstream-status\.mjs"/);
 const webrtc=src.indexOf('emitRealtimeUpstreamStatus("webrtc", upstream.status)');
 const fallback=src.indexOf('emitRealtimeUpstreamStatus("chunk", upstream.status)');
 assert.ok(webrtc>src.indexOf('const answerSdp ='));
 assert.ok(fallback>src.indexOf('async function transcribeFallback('));
 assert.match(src,/error:\s*"REALTIME_SESSION_FAILED"/);
 assert.match(src,/error:\s*"FALLBACK_TRANSCRIPTION_FAILED"/);
 assert.match(src,/return withTechnicalExecutionHeaders\(/);
 assert.doesNotMatch(src,/emitRealtimeUpstreamStatus\([^\n]*(?:answerSdp|raw|transcript|audio|user|apiKey)/);
});

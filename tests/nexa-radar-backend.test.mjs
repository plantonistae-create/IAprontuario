import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {schema,validate,authorized} from '../supabase/functions/realtime-radar/contract.mjs';
import E from '../nexa-radar-engine.js';
import {radarRequestFingerprint,createRadarInFlightCoalescer} from '../supabase/functions/realtime-radar/inflight.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../supabase/functions/realtime-radar/concepts.json',import.meta.url)));
test('backend catalogue matches clinical engine',()=>assert.deepEqual(catalog.map(c=>c.id),Object.keys(E.concepts)));
test('structured schema rejects arbitrary fields',()=>assert.equal(schema(['trauma']).properties.items.items.additionalProperties,false));
test('backend rejects unsupported model evidence',()=>assert.deepEqual(validate({items:[{concept:'trauma',priority:'high',category:'history',contextEvidence:'Inventado'}]},['trauma'],'Dor no tornozelo'),[]));
test('clinical access is fail closed for every role/status combination',()=>{for(const status of ['pending','disabled',undefined])for(const role of ['is_admin','is_reviewer'])assert.equal(authorized({access_status:status,clinical_access:true,[role]:true}),false);assert.equal(authorized({access_status:'active',clinical_access:false,is_admin:true}),false);assert.equal(authorized({access_status:'active',clinical_access:true}),true);});

test('in-flight dedup fingerprint never exposes consultation context or merges owners',async()=>{
 const raw=JSON.stringify({transcript:'Paciente sintetico: dor no peito',clinical_context:{hda:'Dor toracica'}});
 const same=await radarRequestFingerprint('doctor-a','openai','gpt-5.6-luna',raw);
 assert.match(same,/^[a-f0-9]{64}$/);
 assert.equal(same,await radarRequestFingerprint('doctor-a','openai','gpt-5.6-luna',raw));
 assert.notEqual(same,await radarRequestFingerprint('doctor-b','openai','gpt-5.6-luna',raw));
 assert.notEqual(same,await radarRequestFingerprint('doctor-a','nexa-core','gpt-5.6-luna',raw));
 assert.notEqual(same,await radarRequestFingerprint('doctor-a','openai','gpt-5.6-luna',raw+' '));
 assert.equal(same.includes('Paciente'),false);
 await assert.rejects(()=>radarRequestFingerprint('doctor-a','openai','gpt-5.6-luna','x'.repeat(60001)),/RADAR_INFLIGHT_KEY_INVALID/);
});

test('two simultaneous identical requests execute one provider call; later requests are fresh',async()=>{
 const coalesce=createRadarInFlightCoalescer();
 const key=await radarRequestFingerprint('doctor-a','openai','gpt-5.6-luna','{"a":1}');
 let release,executed=0;
 const work=()=>{executed++;return new Promise(resolve=>{release=resolve;});};
 const first=coalesce(key,work),second=coalesce(key,work);
 assert.strictEqual(first,second);
 await Promise.resolve();
 assert.equal(executed,1,'two concurrent identical POSTs must incur one upstream execution');
 release(new Response(JSON.stringify({items:[{concept:'syncope'}]}),{status:200}));
 const [r1,r2]=await Promise.all([first,second]);
 assert.equal(await r1.clone().text(),await r2.clone().text(),'both callers receive the same verified response');
 assert.equal(r1.bodyUsed,false,'the base Response remains unconsumed for per-request cloning');
 const next=await coalesce(key,()=>{executed++;return new Response('next response');});
 assert.equal(executed,2,'no responses are cached after the in-flight work settles');
 assert.equal(await next.text(),'next response');
});

test('new clinical evidence and different authenticated owners never coalesce',async()=>{
 const coalesce=createRadarInFlightCoalescer();
 const a=await radarRequestFingerprint('doctor-a','openai','gpt-5.6-luna','{"transcript":"Dor"}');
 const b=await radarRequestFingerprint('doctor-a','openai','gpt-5.6-luna','{"transcript":"Dor e desmaio"}');
 const c=await radarRequestFingerprint('doctor-b','openai','gpt-5.6-luna','{"transcript":"Dor"}');
 let called=0;
 const results=await Promise.all([a,b,c].map(key=>coalesce(key,()=>{called++;return Promise.resolve(key);})));
 assert.equal(new Set(results).size,3);
 assert.equal(called,3,'changed symptoms and owner identity require independent clinical analysis');
});

test('failed attempts may be retried, and a full tracker never drops clinical requests',async()=>{
 const coalesce=createRadarInFlightCoalescer(1);
 const a='a'.repeat(64),b='b'.repeat(64);
 await assert.rejects(coalesce(a,()=>Promise.reject(new Error('synthetic failure'))),/synthetic failure/);
 let release,called=0;
 const pending=coalesce(a,()=>{called++;return new Promise(resolve=>{release=resolve;});});
 const second=await coalesce(b,()=>{called++;return 'separate';});
 assert.equal(second,'separate','capacity exhaustion executes the request instead of suppressing it');
 await Promise.resolve();
 release('first');
 await pending;
 assert.equal(called,2);
 const retry=await coalesce(a,()=>{called++;return 'retry';});
 assert.equal(retry,'retry');
 assert.equal(called,3);
});

test('Radar coalescing is gated after clinical Auth and clones HTTP bodies',()=>{
 const source=fs.readFileSync(new URL('../supabase/functions/realtime-radar/index.ts',import.meta.url),'utf8');
 const auth=source.indexOf('if(profileError||!authorized(profile))');
 const lookup=source.indexOf('const requestKey=await radarRequestFingerprint');
 assert.ok(auth>=0 && lookup>auth,'coalescing must never run before clinical authorization');
 assert.match(source,/coalesceRadarInFlight\(requestKey,/);
 assert.match(source,/withTechnicalExecutionHeaders\(radarResponse\.clone\(\),radarMetadata\)/);
});

test('coalescing reports only the count of avoided calls, never patient evidence',async()=>{
 const events=[];
 const coalesce=createRadarInFlightCoalescer(64,event=>events.push(event));
 const key=await radarRequestFingerprint('synthetic-doctor','openai','gpt-5.6-luna',
   '{"transcript":"synthetic private text"}');
 let resolve,calls=0;
 const first=coalesce(key,()=>{calls++;return new Promise(done=>{resolve=done;});});
 const second=coalesce(key,()=>{throw Error('must never duplicate the provider');});
 await Promise.resolve();
 assert.equal(calls,1);
 assert.strictEqual(first,second);
 assert.deepEqual(events,['NEXA_RADAR_COALESCED_v1']);
 assert.equal(events.join('').includes('private'),false);
 assert.equal(events.join('').includes(key),false);
 resolve({items:[]});await Promise.all([first,second]);
 const another=await coalesce(key,()=>{calls++;return Promise.resolve({items:[]});});
 assert.equal(calls,2,'new request after completion must not reuse stale answer');
 assert.deepEqual(events,['NEXA_RADAR_COALESCED_v1'],'only in-flight duplication emits a counter');
});

test('monitoring failures never interrupt the Radar, even on shared requests',async()=>{
 const coalesce=createRadarInFlightCoalescer(64,()=>{throw Error('logging unavailable')});
 const key='a'.repeat(64);
 let release;
 const first=coalesce(key,()=>new Promise(done=>{release=done;}));
 const second=coalesce(key,()=>Promise.reject(new Error('should not execute')));
 await Promise.resolve();
 release('ok');
 assert.deepEqual(await Promise.all([first,second]),['ok','ok']);
 assert.throws(()=>createRadarInFlightCoalescer(64,{}),/RADAR_OBSERVER_INVALID/);
});

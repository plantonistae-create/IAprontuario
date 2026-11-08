// A no-network VM harness runs the REAL frontend transport/fallback functions,
// with every browser, auth, microphone and fetch dependency replaced by fakes.
// No provider credentials, patients, audio or real SDP are involved.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {syntheticEdgeEnvelope} from '../experimental/nexa-webrtc-negotiation-lab.mjs';

const frontend=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=frontend.indexOf('async function startRealtimeRadar(mediaStream){');
const stop=frontend.indexOf('function stopRealtimeRadar(',start);
const end=frontend.indexOf('\n\nlet mediaRecorder,',stop);
assert.ok(start>0&&stop>start&&end>stop,'actual frontend functions must be present');
const transportCode=frontend.slice(start,end);

function harness({status=200,deferred=false,authenticated=true,candidateAbortOnFallback=false,abortableFetch=false,candidateSplitAbortDomains=false,chunkDeferred=false,allowSyntheticChunkEvent=false}={}){
 const pcs=[],recorders=[],calls=[],statuses=[],chunkEvents=[];
 const timers=new Map();
 let seq=0,pending=null,pendingChunk=null,abortSeen=0,chunkAbortSeen=0;
 const mediaStream={getAudioTracks:()=>[{kind:'audio',synthetic:true}]};
 class FakePeer {
  constructor(){this.remoteDescription=null;this.closed=false;this.channels=[];pcs.push(this);}
  addTrack(){return {synthetic:true};}
  createDataChannel(){
   const dc={onopen:null,onclose:null,onmessage:null,closed:false,
    close(){this.closed=true}};
   this.channels.push(dc);
   return dc;
  }
  async createOffer(){return {type:'offer',sdp:'v=0\r\ns=fake\r\n'};}
  async setLocalDescription(offer){
   // Simulates candidates arriving after the createOffer snapshot.
   this.localDescription={type:offer.type,sdp:offer.sdp+'a=candidate:synthetic\r\n'};
   this.iceGatheringState='complete';
  }
  async setRemoteDescription(description){this.remoteDescription=description;}
  close(){this.closed=true;}
 }
 class FakeRecorder {
  constructor(_stream,opts={}){this.mimeType=opts.mimeType||'audio/webm';this.state='inactive';recorders.push(this);}
  static isTypeSupported(){return true;}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.onstop?.();}
 }
 const response=(value)=>({ok:value>=200&&value<300,status:value,
  json:async()=>value>=200&&value<300?{sdp:'v=0\r\ns=fake-answer\r\n'}:{error:'SYNTHETIC_STATUS'}});
 const sandbox={
  radarTransportRevision:0,radarTransportAbort:null,radarRealtimeHandshakeAbort:null,recording:true,
  radarConnectTimeout:null,realtimePc:null,realtimeDc:null,radarFallbackActive:false,
  sessionPaused:false,radarChunkStopper:null,radarChunkRecorder:null,
  radarChunkQueue:[],radarChunkSequence:0,radarChunkSending:false,
  window:{RTCPeerConnection:FakePeer},RTCPeerConnection:FakePeer,
  MediaRecorder:FakeRecorder,AbortController,Blob,FormData,
  APP_CONFIG:{realtimeCallPath:'/functions/v1/realtime-call',appVersion:'fixture-only'},
  SUPABASE_URL:'https://not-real.invalid',
  SUPABASE_ANON_KEY:'FAKE_ANON_TEST_ONLY',
  sb:{auth:{getSession:async()=>({data:{session:authenticated?
   {access_token:'FAKE_JWT_TEST_ONLY'}:null}})}},
  $:(id)=>id==='consent'?{checked:true}:null,
  matchMedia:()=>({matches:true}),
  radarTransportStatus:(value)=>statuses.push(value),
  handleRealtimeEvent:(evt)=>{if(!allowSyntheticChunkEvent)throw Error('A no-audio mock must not emit a clinical event');const d=JSON.parse(evt.data);chunkEvents.push({type:d.type,item_id:d.item_id});},
  setTimeout:(fn,delay)=>{const id=++seq;timers.set(id,{fn,delay});return id;},
  clearTimeout:(id)=>{timers.delete(id);},clearInterval:()=>{},radarTimer:null,
  fetch:async(url,init)=>{
   assert.equal(url,'https://not-real.invalid/functions/v1/realtime-call');
   assert.equal(init.method,'POST');
   if(init.body instanceof FormData){
    assert.equal(init.body.get('mode'),'chunk');
    assert.ok(init.body.get('audio') instanceof Blob,'synthetic blob only');
    calls.push({mode:'chunk',has_audio_field:true});
    if(chunkDeferred)return new Promise((resolve,reject)=>{
      pendingChunk=resolve;
      init.signal.addEventListener('abort',()=>{
        chunkAbortSeen++;reject(new Error('SYNTHETIC_CHUNK_ABORT'));
      },{once:true});
    });
    return {ok:true,status:200,json:async()=>({text:'SYNTHETIC_CHUNK'})};
   }
   const body=JSON.parse(init.body);
   calls.push({app_version:body.app_version,has_offer_snapshot:body.sdp==='v=0\r\ns=fake\r\n',
    includes_final_ice_candidate:body.sdp.includes('a=candidate:')});
   if(deferred)return new Promise((resolve,reject)=>{
    pending=resolve;
    if(abortableFetch) {
     if(init.signal.aborted){abortSeen++;reject(new Error('SYNTHETIC_ABORT'));return;}
     init.signal.addEventListener('abort',()=>{
      abortSeen++;reject(new Error('SYNTHETIC_ABORT'));
     },{once:true});
    }
   });
   return response(status);
  },
  mediaStream,
 };
 let codeToRun=transportCode;
 if(candidateAbortOnFallback){
  const anchor="radarFallbackActive=true;clearTimeout(radarConnectTimeout);";
  assert.equal(transportCode.split(anchor).length,2,'exactly one safe injection point');
  codeToRun=transportCode.replace(anchor,anchor+
   "\n  radarTransportAbort?.abort(); // SYNTHETIC CANDIDATE ONLY; not in runtime");
 }
 if(candidateSplitAbortDomains){
  // Experimental source transform is confined to vm.runInNewContext.
  const handshake='radarTransportAbort=new AbortController();const signal=radarTransportAbort.signal;';
  const split='radarTransportAbort=new AbortController();radarRealtimeHandshakeAbort?.abort();radarRealtimeHandshakeAbort=new AbortController();const signal=radarRealtimeHandshakeAbort.signal;';
  assert.equal(codeToRun.split(handshake).length,2,'unique handshake source anchor');
  codeToRun=codeToRun.replace(handshake,split);
  const fallback='radarFallbackActive=true;clearTimeout(radarConnectTimeout);';
  assert.equal(codeToRun.split(fallback).length,2,'unique fallback source anchor');
  codeToRun=codeToRun.replace(fallback,fallback+'radarRealtimeHandshakeAbort?.abort();');
  const stop='++radarTransportRevision;radarTransportAbort?.abort();radarTransportAbort=null;';
  assert.equal(codeToRun.split(stop).length,2,'unique stop source anchor');
  codeToRun=codeToRun.replace(stop,'++radarTransportRevision;radarTransportAbort?.abort();radarRealtimeHandshakeAbort?.abort();radarRealtimeHandshakeAbort=null;radarTransportAbort=null;');
 }
 vm.runInNewContext(codeToRun,sandbox,{timeout:1000,filename:'real-frontend-fake-dependencies'});
 return {
  sandbox,pcs,recorders,calls,statuses,timers,chunkEvents,get abortSeen(){return abortSeen;},get chunkAbortSeen(){return chunkAbortSeen;},
  start:()=>sandbox.startRealtimeRadar(mediaStream),
  resolve:(code)=>{assert.ok(pending,'deferred request not reached');pending(response(code));},
  resolveChunk:()=>{assert.ok(pendingChunk,'deferred chunk not reached');pendingChunk({ok:true,status:200,json:async()=>({text:'SYNTHETIC_CHUNK'})});},
  stop:()=>sandbox.stopRealtimeRadar({wipe:false}),
  fire:(delay)=>{for(const [id,t] of [...timers])if(t.delay===delay){timers.delete(id);t.fn();}},
 };
}
async function flush(){for(let i=0;i<16;i++)await Promise.resolve();}

test('actual frontend: HTTP 200 sets answer, but submits initial offer rather than final ICE description',async()=>{
 const h=harness();
 await h.start();
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].has_offer_snapshot,true);
 assert.equal(h.calls[0].includes_final_ice_candidate,false);
 assert.ok(h.pcs[0].localDescription.sdp.includes('a=candidate:'));
 assert.ok(h.pcs[0].remoteDescription);
 assert.equal(h.sandbox.radarFallbackActive,false);
 assert.equal(h.recorders.length,0);
 // On-open event cancels the 10s watchdog and sets live state.
 h.pcs[0].channels[0].onopen();
 h.fire(10000);
 assert.equal(h.sandbox.radarFallbackActive,false);
 assert.ok(h.statuses.includes('live'));
});

test('actual frontend: simulated upstream 400/401/422/429/503 become Edge 502 and trigger one fallback',async()=>{
 for(const upstream of [400,401,422,429,503]){
  const edge=syntheticEdgeEnvelope(upstream);
  const h=harness({status:edge.simulated_edge_http_status});
  await h.start();
  assert.equal(h.calls.length,1);
  assert.equal(h.sandbox.radarFallbackActive,true);
  assert.equal(h.pcs[0].closed,true);
  assert.equal(h.recorders.length,1);
  assert.equal(h.recorders[0].state,'recording');
  h.fire(10000); // Should already be cleared by fallback.
  assert.equal(h.recorders.length,1,'no duplicate fallback MediaRecorder');
  assert.equal(edge.provider_invoice_known,false);
 }
});

test('actual frontend: 10s watchdog activates fallback once if data channel never opens',async()=>{
 const h=harness({status:200});
 await h.start();
 assert.equal(h.sandbox.radarFallbackActive,false);
 h.fire(10000);
 assert.equal(h.sandbox.radarFallbackActive,true);
 assert.equal(h.recorders.length,1);
 assert.equal(h.pcs[0].closed,true);
});

test('actual frontend: late successful WebRTC response cannot override active fallback',async()=>{
 const h=harness({deferred:true});
 const running=h.start();
 await flush();
 assert.equal(h.calls.length,1);
 const dc=h.pcs[0].channels[0];
 assert.equal(typeof dc.onclose,'function');
 dc.onclose(); // Simulates a data-channel closure before the Edge responds.
 assert.equal(h.sandbox.radarFallbackActive,true);
 h.resolve(200);
 await running;
 assert.equal(h.pcs[0].remoteDescription,null);
 assert.equal(h.recorders.length,1);
});

test('actual frontend: watchdog starts chunks while pending WebRTC request is not aborted',async()=>{
 const h=harness({deferred:true});
 const running=h.start();
 await flush();
 assert.equal(h.calls.length,1);
 const requestController=h.sandbox.radarTransportAbort;
 assert.equal(requestController.signal.aborted,false);
 h.fire(10000);
 assert.equal(h.sandbox.radarFallbackActive,true);
 assert.equal(h.recorders.length,1);
 // This is a transport overlap opportunity, NOT proof the provider billed twice.
 assert.equal(requestController.signal.aborted,false);
 h.resolve(200);
 await running;
 assert.equal(h.pcs[0].remoteDescription,null);
 assert.equal(h.recorders.length,1);
});

test('synthetic-only candidate aborts pending fetch at fallback, without duplicate recorder',async()=>{
 const h=harness({deferred:true,abortableFetch:true,candidateAbortOnFallback:true});
 const running=h.start();
 await flush();
 assert.equal(h.calls.length,1);
 const parent=h.sandbox.radarTransportAbort;
 assert.equal(parent.signal.aborted,false);
 h.fire(10000);
 await running;
 assert.equal(parent.signal.aborted,true);
 assert.equal(h.abortSeen,1,'the stub transport observed exactly one abort');
 assert.equal(h.sandbox.radarFallbackActive,true);
 assert.equal(h.recorders.length,1);
 assert.equal(h.pcs[0].remoteDescription,null);
 h.fire(10000);
 assert.equal(h.recorders.length,1);
});

test('naive abort candidate changes abort lifecycle also used to guard chunk fallback',async()=>{
 const h=harness({deferred:true,abortableFetch:true,candidateAbortOnFallback:true});
 const run=h.start();await flush();h.fire(10000);await run;
 assert.equal(h.sandbox.radarTransportAbort.signal.aborted,true);
 // Current chunk drain registers abort bridging on this same shared controller.
 // New listeners attached after parent abort do not re-fire that past event.
 assert.match(transportCode,/radarTransportAbort\?\.signal\.addEventListener\('abort',abort,/);
 const parent=h.sandbox.radarTransportAbort;
 let notified=0;
 parent.signal.addEventListener('abort',()=>notified++);
 await flush();
 assert.equal(notified,0);
 // Hence simply inserting abort() in the real frontend is NOT authorized.
});

test('candidate abort does not run on WebRTC 200/open before fallback',async()=>{
 const h=harness({status:200,candidateAbortOnFallback:true,abortableFetch:true});
 await h.start();
 h.pcs[0].channels[0].onopen();h.fire(10000);
 assert.equal(h.sandbox.radarTransportAbort.signal.aborted,false);
 assert.equal(h.sandbox.radarFallbackActive,false);
 assert.equal(h.abortSeen,0);
});

test('actual frontend: stale revision or stopped recording must not start fallback after a 502',async()=>{
 const h=harness({deferred:true});
 const running=h.start();
 await flush();
 assert.equal(h.calls.length,1);
 h.sandbox.radarTransportRevision++;
 h.sandbox.recording=false;
 h.resolve(502);
 await running;
 assert.equal(h.sandbox.radarFallbackActive,false);
 assert.equal(h.recorders.length,0);
});

test('actual frontend: unauthenticated synthetic path does not invoke network stub',async()=>{
 const h=harness({authenticated:false});
 await h.start();
 assert.equal(h.calls.length,0);
 assert.equal(h.sandbox.radarFallbackActive,true);
 assert.equal(h.recorders.length,1);
});

test('VM harness has no actual network or patient payload in its observable results',async()=>{
 const h=harness({status:502});
 await h.start();
 const report=JSON.stringify({calls:h.calls,statuses:h.statuses,
  fallback_activated:h.sandbox.radarFallbackActive,recorder_count:h.recorders.length});
 for(const forbidden of ['FAKE_JWT','FAKE_ANON','v=0','a=candidate:','patient',
  'recording_audio','authorization','Bearer','transcript','encounter'])assert.equal(report.includes(forbidden),false);
 assert.equal(h.calls.length,1);
});


test('lab split: fallback aborts only pending handshake, chunk remains deliverable',async()=>{
 const h=harness({deferred:true,abortableFetch:true,candidateSplitAbortDomains:true,allowSyntheticChunkEvent:true});
 const connection=h.start();await flush();
 const parent=h.sandbox.radarTransportAbort,handshake=h.sandbox.radarRealtimeHandshakeAbort;
 h.fire(10000);await connection;
 assert.equal(handshake.signal.aborted,true);
 assert.equal(parent.signal.aborted,false,'fallback parent must remain usable');
 assert.equal(h.abortSeen,1);
 const rev=h.sandbox.radarTransportRevision;
 h.sandbox.radarChunkQueue.push({blob:new Blob(['NO-AUDIO'],{type:'audio/webm'}),id:'synthetic:1'});
 await h.sandbox.drainRadarChunks(rev);
 assert.equal(h.calls.length,2);
 assert.equal(h.calls[1].mode,'chunk');
 assert.equal(h.chunkEvents.length,1);
 assert.equal(h.chunkEvents[0].item_id,'synthetic:1');
 assert.equal(parent.signal.aborted,false);
 h.stop();
 assert.equal(parent.signal.aborted,true);
});

test('lab split: chunk timeout aborts only one chunk, no retry or parent abort',async()=>{
 const h=harness({deferred:true,abortableFetch:true,candidateSplitAbortDomains:true,chunkDeferred:true});
 const connection=h.start();await flush();h.fire(10000);await connection;
 const parent=h.sandbox.radarTransportAbort,rev=h.sandbox.radarTransportRevision;
 h.sandbox.radarChunkQueue.push({blob:new Blob(['NO-AUDIO'],{type:'audio/webm'}),id:'synthetic:2'});
 const pending=h.sandbox.drainRadarChunks(rev);await flush();
 assert.equal(h.calls.length,2);
 h.fire(18000);await pending;
 assert.equal(h.chunkAbortSeen,1);
 assert.equal(parent.signal.aborted,false);
 assert.equal(h.sandbox.radarChunkQueue.length,0);
 assert.ok(h.statuses.includes('unavailable'));
 h.stop();
});

test('lab split: stop aborts pending chunk and invalidates stale revision',async()=>{
 const h=harness({deferred:true,abortableFetch:true,candidateSplitAbortDomains:true,chunkDeferred:true,allowSyntheticChunkEvent:true});
 const connection=h.start();await flush();h.fire(10000);await connection;
 const parent=h.sandbox.radarTransportAbort,rev=h.sandbox.radarTransportRevision;
 h.sandbox.radarChunkQueue.push({blob:new Blob(['NO-AUDIO'],{type:'audio/webm'}),id:'synthetic:3'});
 const pending=h.sandbox.drainRadarChunks(rev);await flush();
 assert.equal(h.calls.length,2);
 h.stop();await pending;
 assert.equal(parent.signal.aborted,true);
 assert.equal(h.sandbox.radarRealtimeHandshakeAbort,null);
 assert.equal(h.chunkAbortSeen,1);
 assert.equal(h.chunkEvents.length,0);
 assert.equal(h.sandbox.radarTransportRevision,rev+1);
 assert.equal(h.sandbox.radarFallbackActive,false);
});

test('actual frontend: stop aborts handshake without triggering late fallback',async()=>{
 const h=harness({deferred:true,abortableFetch:true});
 const connection=h.start();await flush();
 const parent=h.sandbox.radarTransportAbort;
 h.stop();await connection;
 assert.equal(parent.signal.aborted,true);
 assert.equal(h.abortSeen,1);
 assert.equal(h.recorders.length,0);
 assert.equal(h.calls.length,1);
 assert.equal(h.sandbox.radarFallbackActive,false);
});

test('lab split: successful live handshake remains active until channel closes',async()=>{
 const h=harness({status:200,candidateSplitAbortDomains:true});
 await h.start();
 const handshake=h.sandbox.radarRealtimeHandshakeAbort;
 h.pcs[0].channels[0].onopen();h.fire(10000);
 assert.equal(handshake.signal.aborted,false);
 assert.equal(h.recorders.length,0);
 h.pcs[0].channels[0].onclose();
 assert.equal(h.sandbox.radarFallbackActive,true);
 assert.equal(handshake.signal.aborted,true);
 h.fire(10000);
 assert.equal(h.recorders.length,1);
 h.stop();
});

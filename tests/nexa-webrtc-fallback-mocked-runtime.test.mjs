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
const end=frontend.indexOf('function stopRealtimeRadar(',start);
assert.ok(start>0&&end>start,'actual frontend functions must be present');
const transportCode=frontend.slice(start,end);

function harness({status=200,deferred=false,authenticated=true}={}){
 const pcs=[],recorders=[],calls=[],statuses=[];
 const timers=new Map();
 let seq=0,pending=null;
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
  radarTransportRevision:0,radarTransportAbort:null,recording:true,
  radarConnectTimeout:null,realtimePc:null,realtimeDc:null,radarFallbackActive:false,
  sessionPaused:false,radarChunkStopper:null,radarChunkRecorder:null,
  radarChunkQueue:[],radarChunkSequence:0,radarChunkSending:false,
  window:{RTCPeerConnection:FakePeer},RTCPeerConnection:FakePeer,
  MediaRecorder:FakeRecorder,AbortController,Blob,
  APP_CONFIG:{realtimeCallPath:'/functions/v1/realtime-call',appVersion:'fixture-only'},
  SUPABASE_URL:'https://not-real.invalid',
  SUPABASE_ANON_KEY:'FAKE_ANON_TEST_ONLY',
  sb:{auth:{getSession:async()=>({data:{session:authenticated?
   {access_token:'FAKE_JWT_TEST_ONLY'}:null}})}},
  $:(id)=>id==='consent'?{checked:true}:null,
  matchMedia:()=>({matches:true}),
  radarTransportStatus:(value)=>statuses.push(value),
  handleRealtimeEvent:()=>{throw Error('A no-audio mock must not emit a clinical event');},
  setTimeout:(fn,delay)=>{const id=++seq;timers.set(id,{fn,delay});return id;},
  clearTimeout:(id)=>{timers.delete(id);},
  fetch:async(url,init)=>{
   assert.equal(url,'https://not-real.invalid/functions/v1/realtime-call');
   assert.equal(init.method,'POST');
   const body=JSON.parse(init.body);
   calls.push({app_version:body.app_version,has_offer_snapshot:body.sdp==='v=0\r\ns=fake\r\n',
    includes_final_ice_candidate:body.sdp.includes('a=candidate:')});
   if(deferred)return new Promise(resolve=>{pending=resolve;});
   return response(status);
  },
  mediaStream,
 };
 vm.runInNewContext(transportCode,sandbox,{timeout:1000,filename:'real-frontend-fake-dependencies'});
 return {
  sandbox,pcs,recorders,calls,statuses,timers,
  start:()=>sandbox.startRealtimeRadar(mediaStream),
  resolve:(code)=>{assert.ok(pending,'deferred request not reached');pending(response(code));},
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

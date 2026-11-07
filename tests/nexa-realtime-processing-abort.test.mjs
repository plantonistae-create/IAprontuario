import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercises actual client processing functions with synthetic auth, fetch and audio.
// No outgoing network, credentials, microphone, patient data or paid requests.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const begin=html.indexOf('function processingForm(blob){');
const end=html.indexOf('function nexaShowMedicationReview(',begin);
assert.ok(begin>0&&end>begin,'clinical processing functions must remain available');
const source=html.slice(begin,end);
const audio=new Blob(['synthetic-only'],{type:'audio/webm'});

function harness({slowAuth=false,respondAfterAbort=false,status=200}={}){
  const requests=[],state={resolveAuth:null,resolveResponse:null,refreshes:0,aborts:0};
  const context={
    AbortController,DOMException,Blob,FormData,
    setTimeout,clearTimeout,crypto:{randomUUID:()=> 'synthetic-id'},
    SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'synthetic',
    APP_CONFIG:{aiGatewayPath:'/functions/v1/process-consultation',maxStyleExamples:2,appVersion:'synthetic'},
    styleExamples:[],mode:()=> 'synthetic',
    $:()=>({checked:false}),
    requireClinicalSession:()=>slowAuth?new Promise(resolve=>{state.resolveAuth=()=>resolve({access_token:'synthetic'});}):Promise.resolve({access_token:'synthetic'}),
    sb:{auth:{refreshSession:async()=>{state.refreshes++;return {data:{session:{access_token:'synthetic-new'}}}},signOut:async()=>{}}},
    fetch(url,options){
      assert.ok(url.startsWith('https://example.invalid/'),'synthetic URL only');
      requests.push({url,options});
      if(respondAfterAbort)return new Promise(resolve=>{state.resolveResponse=()=>resolve({ok:status===200,status,json:async()=>({segments:[{speaker:'fixture'}],fields:{hda:'synthetic'}})});});
      return new Promise((_resolve,reject)=>{
        if(options.signal.aborted){state.aborts++;reject(new DOMException('aborted','AbortError'));return;}
        options.signal.addEventListener('abort',()=>{state.aborts++;reject(new DOMException('aborted','AbortError'));},{once:true});
      });
    }
  };
  const exports='\nglobalThis.actions={invoke,nexaDiarizeAudio,nexaInvokeAutomaticSpeakerSegments,nexaProcessingGate};';
  vm.runInNewContext(source+exports,context,{timeout:1000});
  return {actions:context.actions,requests,state};
}
async function until(fn){for(let i=0;i<60&&!fn();i++)await Promise.resolve();assert.ok(fn(),'synthetic checkpoint not reached');}

for(const [label,make] of [
  ['standard transcription',h=>h.actions.invoke(audio,h.signal)],
  ['speaker diarization',h=>h.actions.nexaDiarizeAudio(audio,h.signal)],
  ['speaker structure',h=>h.actions.nexaInvokeAutomaticSpeakerSegments([{speaker:'synthetic'}],h.signal)]
]){
  test(label+' aborts pending HTTP request when consent is withdrawn',async()=>{
    const h=harness(),parent=new AbortController();h.signal=parent.signal;
    const work=make(h);await until(()=>h.requests.length===1);
    parent.abort();await assert.rejects(work,{name:'AbortError'});
    assert.equal(h.state.aborts,1);
    assert.equal(h.requests.length,1);
    assert.equal(h.requests[0].options.signal.aborted,true);
  });
  test(label+' cannot send new HTTP request after consent revoked during authentication',async()=>{
    const h=harness({slowAuth:true}),parent=new AbortController();h.signal=parent.signal;
    const work=make(h);await until(()=>typeof h.state.resolveAuth==='function');
    parent.abort();h.state.resolveAuth();
    await assert.rejects(work,{name:'AbortError'});
    assert.equal(h.requests.length,0,'revoked consent must not dispatch late request');
  });
}
test('standard transcription does not retry paid endpoint after 401 if consent was revoked',async()=>{
  const h=harness({respondAfterAbort:true,status:401}),parent=new AbortController();
  const work=h.actions.invoke(audio,parent.signal);await until(()=>h.requests.length===1);
  parent.abort();h.state.resolveResponse();
  await assert.rejects(work,{name:'AbortError'});
  assert.equal(h.requests.length,1);
  assert.equal(h.state.refreshes,0);
});
test('late HTTP response after revoke is rejected for diarization and structure',async()=>{
  for(const name of ['nexaDiarizeAudio','nexaInvokeAutomaticSpeakerSegments']){
    const h=harness({respondAfterAbort:true}),parent=new AbortController();
    const arg=name==='nexaDiarizeAudio'?audio:[{speaker:'synthetic'}];
    const work=h.actions[name](arg,parent.signal);await until(()=>h.requests.length===1);
    parent.abort();h.state.resolveResponse();
    await assert.rejects(work,{name:'AbortError'});
    assert.equal(h.requests.length,1);
  }
});
test('the real frontend cancels processing on reset and consent withdrawal',()=>{
  const revoke=html.slice(html.indexOf('let nexaConsentRevision=0'),html.indexOf(";$('recBtn').onclick=",html.indexOf('let nexaConsentRevision=0')));
  assert.match(revoke,/nexaClinicalProcessingAbort\?\.abort\(\)/);
  const clear=html.slice(html.indexOf('function clearClinicalSession('),html.indexOf("$('resetBtn').onclick=",html.indexOf('function clearClinicalSession(')));
  assert.match(clear,/nexaClinicalProcessingAbort\?\.abort\(\)/);
  const process=html.slice(html.indexOf('async function processAudio(){'),html.indexOf("}$('processBtn').onclick=processAudio;"));
  assert.match(process,/if\(processingAbort\.signal\.aborted\)return;/,'diarization abort must not fall through to standard paid transcription');
  assert.match(process,/nexaClinicalProcessingAbort=processingAbort/);
  assert.match(process,/nexaClinicalProcessingAbort!==processingAbort/,'old finally must not reset newer processing');
});

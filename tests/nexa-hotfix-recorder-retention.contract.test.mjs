import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Sprint 3 hotfix: the recorder-recovery wrapper in nexa-hotfix-v1.js must never
// silently discard audio held for this session (transcribed, NOT archived).
// Runs the REAL installRecorderRecovery/releaseStaleRecorder source against a
// fake original startRec that mimics index.html. Synthetic data only.
const src=fs.readFileSync(new URL('../nexa-hotfix-v1.js',import.meta.url),'utf8');
const a=src.indexOf('let startInFlight = false;'),b=src.indexOf('function recordingSnapshot(){');
assert.ok(a>0&&b>a,'recorder recovery section must exist');
const section=src.slice(a,b);

const preamble=`
var audioBlob=null,chunks=[],recording=false,mediaRecorder=null,stream=null,audioCtx=null,
    analyser=null,dataArray=null,raf=0,discardStoppedRecording=false,seconds=0;
var __mode='ok',__shown=[],__confirms=0,__startCalls=0;
function confirm(){__confirms++;return true}
function show(m,err){__shown.push({m,err})}
function stopRealtimeRadar(){}function stopRecordingTimer(){}function cancelAnimationFrame(){}
function refreshRecordingControls(){}
function makeRecorder(state){
  const r={state,onstopHook:null,
    addEventListener(ev,fn){if(ev==='stop')r.onstopHook=fn},
    stop(){r.state='inactive';
      // mirrors index.html mediaRecorder.onstop discard branch
      if(discardStoppedRecording){chunks=[];audioBlob=null;byId('processBtn').disabled=true}
      if(r.onstopHook)r.onstopHook()}};
  return r;
}
async function startRec(){ // mirrors index.html: mic first, THEN the confirmed discard
  __startCalls++;
  if(__mode==='throw')throw new Error('falha sintética');
  if(__mode==='denied'){show('Não foi possível acessar o microfone.',true);return}
  chunks=[];audioBlob=null;recording=true;
}
`;
function env(){
  const els={recBtn:{classList:{remove(){}},disabled:false},consent:{checked:true},
    circleShape:{style:{}},stopShape:{style:{}},processBtn:{disabled:true}};
  let topHandler=null;
  els.nexaDesktopPause={dataset:{},addEventListener(ev,fn){topHandler=fn}};
  const ctx=vm.createContext({console:{error(){},warn(){},log(){}},setTimeout,Blob,
    byId:id=>els[id]||null,document:{}});
  vm.runInContext(preamble,ctx);
  vm.runInContext(`(function(){'use strict';${section}\ninstallRecorderRecovery();})();`,ctx);
  const get=n=>vm.runInContext(n,ctx),run=c=>vm.runInContext(c,ctx);
  return{ctx,els,get,run,topHandler:()=>topHandler};
}
function retain(e){
  e.run(`audioBlob=Object.assign(new Blob(['synthetic-audio']),{nexaTranscribed:true});chunks=['c1','c2'];`);
  e.els.processBtn.disabled=true; // index.html keeps Transcribe disabled after a saved note
  return e.get('audioBlob');
}

test('wrapper is installed over startRec (real path)',()=>{
  const e=env();assert.equal(e.get('startRec.__nexaRecoveredStart'),true);
});

test('mic denied after the user confirmed: transcribed audio survives',async()=>{
  const e=env(),blob=retain(e);e.run(`__mode='denied'`);
  await e.run('startRec()');
  assert.equal(e.get('audioBlob'),blob,'same blob object kept');
  assert.equal(e.get('audioBlob.nexaTranscribed'),true);
  assert.equal(JSON.stringify(e.get('chunks')),JSON.stringify(['c1','c2']));
  assert.equal(e.els.processBtn.disabled,true,'process button state restored');
  assert.equal(e.get('recording'),false);
});

test('original start throws: recovery path keeps the audio, reports error, not stuck',async()=>{
  const e=env(),blob=retain(e);e.run(`__mode='throw'`);
  await e.run('startRec()');
  assert.equal(e.get('audioBlob'),blob);assert.equal(JSON.stringify(e.get('chunks')),JSON.stringify(['c1','c2']));
  assert.ok(e.get('__shown').some(s=>s.err&&/gravador foi recuperado/.test(s.m)));
  e.run(`__mode='ok'`);await e.run('startRec()');
  assert.equal(e.get('__startCalls'),2,'no permanent block after a failure');
  assert.equal(e.get('recording'),true);
});

test('stale active recorder: its discard-on-stop cannot erase retained audio',async()=>{
  const e=env(),blob=retain(e);
  e.run(`mediaRecorder=makeRecorder('recording');recording=false;__mode='denied'`);
  await e.run('startRec()');
  assert.equal(e.get('audioBlob'),blob);assert.equal(JSON.stringify(e.get('chunks')),JSON.stringify(['c1','c2']));
  assert.equal(e.get('mediaRecorder'),null,'recorder machinery was still recovered');
  assert.equal(e.get('discardStoppedRecording'),false);
});

test('explicit new take after confirmation still discards, with no extra confirmation here',async()=>{
  const e=env();retain(e);
  await e.run('startRec()');
  assert.equal(e.get('audioBlob'),null,'confirmed new recording replaces the old audio');
  assert.equal(e.get('recording'),true);
  assert.equal(e.get('__confirms'),0,'hotfix must not add a duplicate confirmation');
});

test('no held audio: stale chunks are still cleaned (recovery behaviour preserved)',async()=>{
  const e=env();
  e.run(`chunks=['stale'];mediaRecorder=makeRecorder('recording');recording=false;__mode='denied'`);
  await e.run('startRec()');
  assert.equal(JSON.stringify(e.get('chunks')),JSON.stringify([]));assert.equal(e.get('audioBlob'),null);
});

test('untranscribed audio is preserved by recovery too',async()=>{
  const e=env();e.run(`audioBlob=new Blob(['volatile']);chunks=['v1']`);const blob=e.get('audioBlob');
  e.run(`__mode='throw'`);await e.run('startRec()');
  assert.equal(e.get('audioBlob'),blob);assert.equal(JSON.stringify(e.get('chunks')),JSON.stringify(['v1']));
});

test('top recording button defers to the native confirm flow when audio is held',()=>{
  const e=env();retain(e);
  let prevented=false;
  e.topHandler()({preventDefault(){prevented=true},stopImmediatePropagation(){prevented=true}});
  assert.equal(prevented,false);assert.equal(e.get('__startCalls'),0);
});

test('module never confirms or claims durable storage',()=>{
  assert.equal(/\bconfirm\s*\(/.test(section),false);
  assert.equal(/arquivad|salvo no servidor|durável/i.test(section),false);
  const rel=section.slice(section.indexOf('async function releaseStaleRecorder'),section.indexOf('function installRecorderRecovery'));
  assert.equal(/chunks\s*=\s*\[\]\s*;\s*audioBlob\s*=\s*null/.test(rel.replace(/else\s*\{[^}]*\}/,'')),false,
    'unconditional discard must not remain outside the no-held-audio branch');
});

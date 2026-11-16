import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Regression for the real beforeReset/performReset functions. These guards
// protect audio held ONLY in this browser session, not durable archival.
// All encounters and microphone states in this test are synthetic.
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const outbox=fs.readFileSync(new URL('../nexa-audit-outbox-v18.9.19.js',import.meta.url),'utf8');
const start=outbox.indexOf('function performReset(target){');
const mid=outbox.indexOf('async function beforeReset(el){',start);
const end=outbox.indexOf('async function manual(button)',mid);
assert.ok(start>0&&mid>start&&end>mid,'reset source functions must be present');
const source=outbox.slice(start,end);

function harness({state='stopped',transcribed=true,clinical=true,accept=true,failPreserve=false}={}){
  let confirmCount=0,resets=0,rotates=0;
  const prompts=[],toasts=[],callbacks=new Map();
  const nodes={
    recBtn:{dataset:{recordingState:state,...(transcribed?{audioTranscribed:'1'}:{})}},
    resetBtn:{onclick(){if(win.confirm('native reset?')){
      resets++;win.dispatchEvent({type:'nexa:consultation-reset'});
    }}}
  };
  const record={owner_user_id:'synthetic-doctor',encounter_id:'synthetic-case',
    local_revision:1,fields:{hda:clinical?'Atendimento sintético':''},sync_state:'synced'};
  const autosave={
    async preserve(){if(failPreserve)throw Error('LOCAL_PRESERVE_FAIL');return {...record}},
    async get(){return {...record}},
    async startNew(){},
    async flush(){}
  };
  const win={
    nexaEncounterAutosave18101:autosave,
    confirm(message){confirmCount++;prompts.push(message);return accept},
    addEventListener(type,fn){if(!callbacks.has(type))callbacks.set(type,new Set());callbacks.get(type).add(fn)},
    removeEventListener(type,fn){callbacks.get(type)?.delete(fn)},
    dispatchEvent(event){for(const fn of callbacks.get(event.type)||[])fn(event)},
    scrollTo(){}
  };
  const factory=new Function(
    'window','document','owner','collect','valid','store',
    'ensureAuditSnapshotBeforeReset','holdConflictSnapshot',
    'flush','rotateEncounter','toast','navigator','console',
    'let resetting=false;\n'+source+'\nreturn beforeReset;');
  const beforeReset=factory(win,{getElementById:id=>nodes[id]||null},
    ()=>'synthetic-doctor',()=>({...record.fields}),()=>false,
    {get:async()=>null},async()=>null,async()=>null,async()=>({}),
    ()=>{rotates++},(...args)=>toasts.push(args),{onLine:false},{warn(){},error(){}});
  return{call:()=>beforeReset(nodes.resetBtn),
    result:()=>({confirmCount,resets,rotates,prompts,toasts})};
}
test('marker follows local structured checkpoint and is reset on new recording or clear',()=>{
  const saving=index.indexOf("await nexaPersistSession('structured')");
  const success=index.indexOf('if(structuredSaved){',saving);
  const flag=index.indexOf("audioBlob.nexaTranscribed=true;$('recBtn').dataset.audioTranscribed='1'",success);
  const failure=index.indexOf('}else{',flag);
  assert.ok(saving>0&&success>saving&&flag>success&&failure>flag);
  assert.match(index,/chunks=\[\];audioBlob=null;delete \$\('recBtn'\)\.dataset\.audioTranscribed/);
  assert.match(index,/chunks=\[\];delete \$\('recBtn'\)\.dataset\.audioTranscribed;nexaSetAudioArchiveNotice\('none'\)/);
});
test('transcribed audio: one explicit discard confirmation then reset',async()=>{
  const h=harness();await h.call();const r=h.result();
  assert.equal(r.confirmCount,1);assert.equal(r.resets,1);assert.equal(r.rotates,1);
  assert.match(r.prompts[0],/NÃO foi arquivado/);
});
test('transcribed audio: refusal keeps the encounter',async()=>{
  const h=harness({accept:false});await h.call();const r=h.result();
  assert.equal(r.confirmCount,1);assert.equal(r.resets,0);assert.equal(r.rotates,0);
});
test('untranscribed audio is always hard-blocked without confirmation',async()=>{
  const h=harness({transcribed:false});await h.call();const r=h.result();
  assert.equal(r.confirmCount,0);assert.equal(r.resets,0);
  assert.match(r.toasts.map(x=>x[0]).join(' '),/TRANSCRIVA_OU_FINALIZE/);
});
for(const state of ['recording','paused']){
  test(state+' cannot reset, even if marker exists',async()=>{
    const h=harness({state});await h.call();const r=h.result();
    assert.equal(r.confirmCount,0);assert.equal(r.resets,0);
  });
}
test('clinical notes without held audio preserve existing confirmation',async()=>{
  const h=harness({state:'idle',transcribed:false});await h.call();const r=h.result();
  assert.equal(r.confirmCount,1);assert.equal(r.resets,1);
  assert.match(r.prompts[0],/Iniciar novo atendimento/);
});
test('empty idle encounter resets without prompting',async()=>{
  const h=harness({state:'idle',transcribed:false,clinical:false});await h.call();
  assert.equal(h.result().confirmCount,0);assert.equal(h.result().resets,1);
});
test('checkpoint failure prevents reset after audio discard consent',async()=>{
  const h=harness({failPreserve:true});await h.call();const r=h.result();
  assert.equal(r.confirmCount,1);assert.equal(r.resets,0);
  assert.match(r.toasts.map(x=>x[0]).join(' '),/LOCAL_PRESERVE_FAIL/);
});

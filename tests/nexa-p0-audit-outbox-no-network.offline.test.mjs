/* NEXA P0 — Offline audit-outbox dispatch STOP. Synthetic only; not PostgreSQL. */
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../nexa-audit-outbox-v18.9.19.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const take=(start,end)=>{
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'missing expected function boundary: '+start);
 return source.slice(a,b);
};
function isolated(start,end,context={}){
 const code=take(start,end);
 const sandbox={
  fetch:()=>{throw new Error('FORBIDDEN_AUDIT_HTTP')},
  auditSubmitUrl:()=>{throw new Error('FORBIDDEN_AUDIT_URL')},
  ...context
 };
 vm.runInNewContext(code+'\nthis.__run='+start.match(/function\s+(\w+)/)[1]+';',sandbox,{timeout:1000});
 return {run:sandbox.__run,code,sandbox};
}
test('both audit HTTP functions are physically removed from candidate source',()=>{
 assert.doesNotMatch(source,/\bfetch\s*\(\s*auditSubmitUrl\s*\(/);
 assert.doesNotMatch(take('async function sendItem(','async function recoverStale('),/\bfetch\s*\(/);
 assert.doesNotMatch(take('async function submitRemoteEncounter(','async function reconcileRemoteReady('),/\bfetch\s*\(/);
 assert.doesNotMatch(take('async function reconcileRemoteReady(','function scheduleAutomaticHandoff('),/\bfetch\s*\(/);
 assert.doesNotMatch(take('async function flush(','function toast('),/\bfetch\s*\(/);
 assert.match(html.slice(html.indexOf('async function submitCurrentForAudit(){'),
  html.indexOf("$('submitAuditBtn').onclick=submitCurrentForAudit;")),
  /audit_gate_blocked/);
});
test('local queued snapshot never submits or mutates when attempted directly',async()=>{
 let mutations=0;
 const x=isolated('async function sendItem(','async function recoverStale(',{
  store:{put:async()=>{mutations++}}
 });
 const original={idempotency_key:'synthetic:final-v1',state:'queued',payload:{fields:{hda:'sintético'}}};
 const before=structuredClone(original);
 const response=await x.run(original);
 assert.equal(response.sent,false);assert.equal(response.pending,true);
 assert.equal(response.reason,'GATE_C_NO_GO');assert.equal(mutations,0);
 assert.deepEqual(original,before);
});
test('remote source reconciliation cannot submit even with forged local approval',async()=>{
 const x=isolated('async function submitRemoteEncounter(','async function reconcileRemoteReady(',{
  window:{externalAiConsent:true,reviewed_documentation:true}
 });
 const response=await x.run({encounter_id:'synthetic'},{access:'fake'});
 assert.equal(response.sent,false);
 assert.equal(response.reason,'GATE_C_NO_GO');
 assert.equal(response.skipped,true);
});
test('remote ready scan does not call Supabase or audit HTTP',async()=>{
 let reads=0;
 const x=isolated('async function reconcileRemoteReady(','function scheduleAutomaticHandoff(',{
  client:()=>{reads++;throw Error('REMOTE_READ_NOT_AUTHORIZED')}
 });
 const result=await x.run(10);
 assert.equal(reads,0);assert.equal(result.processed,0);
 assert.equal(result.sent,0);assert.equal(result.reason,'GATE_C_NO_GO');
});
test('flush preserves all queued, sending and held items without network or retry writes',async()=>{
 let writes=0;const queue=[
  {state:'queued',owner_user_id:'physician-1'},
  {state:'sending',owner_user_id:'physician-1'},
  {state:'held_conflict',owner_user_id:'physician-1'},
  {state:'locked',owner_user_id:'physician-1'},
  {state:'queued',owner_user_id:'physician-2'}
 ];
 const before=structuredClone(queue);
 const x=isolated("async function flush(","function toast(",{
  owner:()=> 'physician-1',
  store:{all:async()=>queue,put:async()=>{writes++}},
  sessionAuth:()=>{throw Error('NO_SESSION_REQUIRED_FOR_STOP')}
 });
 const result=await x.run('online');
 assert.equal(result.sent,0);assert.equal(result.pending,2);
 assert.equal(result.reason,'GATE_C_NO_GO');assert.equal(writes,0);
 assert.deepEqual(queue,before);
});
test('manual priority action retains snapshot and never claims server submission',async()=>{
 let keep=0, priority=0,flushes=0;const alerts=[];
 const x=isolated('async function manual(','async function automaticHandoff(',{
  window:{nexaEncounterAutosave18101:{prioritize:async()=>{priority++}}},
  preserve:async(reason)=>{keep++;assert.equal(reason,'manual_priority');return{idempotency_key:'synthetic'}},
  flush:()=>{flushes++;throw Error('AUDIT_FLUSH_CALLED')},
  toast:(msg)=>alerts.push(msg),
  setTimeout:()=>0
 });
 const button={textContent:'Priorizar para auditoria'};
 await x.run(button);
 assert.equal(priority,1);assert.equal(keep,1);assert.equal(flushes,0);
 assert.equal(button.textContent,'Pendente local');
 assert.match(alerts[0],/fila local/);
 assert.doesNotMatch(alerts.join('\n'),/Caso priorizado para Auditoria\./);
});
test('automatic handoff preserves local checkpoint but returns no audit sent receipt',async()=>{
 let saved=0,queued=0,sent=0,syncRequests=0;
 const x=isolated('async function automaticHandoff(','async function submitRemoteEncounter(',{
  window:{nexaEncounterAutosave18101:{
   preserve:async()=>{saved++;return{sync_state:'pending'}},
   flush:()=>{syncRequests++;return null}
  }},
  collect:()=>({hda:'Texto sintético'}),
  valid:()=>true,
  preserve:async()=>{queued++;return{idempotency_key:'lab-synthetic'}},
  flush:async()=>{sent++;return{sent:0,reason:'GATE_C_NO_GO'}},
  console:{warn:()=>{}}
 });
 const r=await x.run('navigation');
 assert.equal(saved,1);assert.equal(queued,1);
 assert.equal(syncRequests,1);assert.equal(sent,1);
 assert.equal(r.sent,0);assert.equal(r.reason,'GATE_C_NO_GO');
});
test('reset path retains local checkpoint without claiming audited status',()=>{
 const reset=take('async function beforeReset(','async function manual(');
 assert.match(reset,/ensureAuditSnapshotBeforeReset/);
 assert.match(reset,/performReset\(/);
 assert.match(reset,/Cópia local preservada; envio à auditoria ainda não autorizado/);
 assert.doesNotMatch(reset,/Consulta confirmada no servidor e adicionada à fila de auditoria/);
});
test('all UI and lifecycle triggers route through stopped outbox functions',()=>{
 const binding=take('function bind(){','bind();window.ensureAuditSnapshotBeforeReset=');
 for(const token of ['#submitAuditBtn','manual(manualButton)',
  "automaticHandoff('navigation')","reconcileRemoteReady(10)",
  "flush('online')","flush('startup')","flush('encounter-server-ack')",
  "flush('event')"])
  assert.ok(binding.includes(token),'missing audited route: '+token);
});
test('source JavaScript syntax remains valid',()=>{
 new vm.Script(source,{filename:'nexa-audit-outbox-v18.9.19.js'});
});

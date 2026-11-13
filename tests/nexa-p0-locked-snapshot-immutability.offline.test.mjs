/* P0: real autosave source, synthetic IndexedDB adapter. No database or network. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const source=fs.readFileSync(new URL('../nexa-encounter-autosave-v18.10.1.js',import.meta.url),'utf8');
const begin=source.indexOf("async function buildLocal(");
const finish=source.indexOf("function remotePayload(",begin);
assert.ok(begin>0&&finish>begin,'buildLocal contract must exist');
const part=source.slice(begin,finish);
const USER='11111111-1111-4111-8111-111111111111';
const ID='22222222-2222-4222-8222-222222222222';
const createBuild=(stored)=>{
 const seen=[];
 const adapter={get:async id=>{seen.push(id);return structuredClone(stored)}};
 const make=new Function('store','owner','assertOwnerStill','currentEncounterId','isUuid',
  'setActiveId','uuid','collectFields','clone','eligible','nowIso','processingMeta',
  'window','lastProcessedMeta',part+'\nreturn buildLocal;');
 const build=make(adapter,()=>USER,who=>assert.equal(who,USER),()=>ID,
   x=>x===ID,()=>{},()=>ID,()=>({hda:'unchanged clinical note'}),
   structuredClone,()=>true,()=> '2026-11-13T20:00:00.000Z',()=>({}),
   {__NEXA_PROTOCOL_USAGE__:null},null);
 return {build,seen};
};
function item({state='audited',sync='locked'}={}){
 return {encounter_id:ID,owner_user_id:USER,encounter_state:state,
  sync_state:sync,fields:{hda:'unchanged clinical note'},
  local_revision:8,sync_version:5,last_client_saved_at:'2026-11-13T19:00:00Z',
  created_at:'2026-11-13T18:00:00Z'};
}

for(const [title,settings] of [
 ['audited',{state:'audited',sync:'locked'}],
 ['discarded',{state:'discarded',sync:'locked'}],
 ['server-locked pending review',{state:'ready_for_audit',sync:'locked'}]
]){
 test(title+' rejects post-lock field edits',async()=>{
  const prior=item(settings),f=createBuild(prior);
  await assert.rejects(f.build('input',ID,{hda:'changed after lock'},USER),
    /LOCKED_ENCOUNTER_IMMUTABLE/);
  assert.equal(prior.fields.hda,'unchanged clinical note');
  assert.equal(prior.local_revision,8);
 });
 test(title+' keeps exact prior content on unchanged navigation',async()=>{
  const prior=item(settings),f=createBuild(prior);
  const record=await f.build('navigation',ID,{hda:'unchanged clinical note'},USER);
  assert.deepEqual(record,prior);
  assert.equal(record.local_revision,8);
  assert.equal(record.last_client_saved_at,prior.last_client_saved_at);
 });
}
test('owner mismatch remains fail-closed before locked handling',async()=>{
 const prior=item();prior.owner_user_id='33333333-3333-4333-8333-333333333333';
 const f=createBuild(prior);
 await assert.rejects(f.build('input',ID,{hda:'unchanged clinical note'},USER),
  /ENCOUNTER_OWNER_MISMATCH/);
});
test('unchanged locked preserve returns without writing or announcing save',async()=>{
 const store={get:async()=>item(),put:async()=>{throw Error('LOCKED_RECORD_MUTATED')}};
 const original=source.slice(source.indexOf("async function preserve("),
  source.indexOf("async function startNew(",source.indexOf("async function preserve(")));
 assert.ok(original.includes("rec.sync_state==='locked')return rec"));
 const make=new Function('owner','ensureOwnerScope','ownerSwitchRequiresExplicitEncounter',
  'cancelScheduledPersist','currentEncounterId','collectFields','serializeLocal',
  'store','assertOwnerStill','buildLocal','window','navigator','syncOne',
  'CustomEvent',original+'\nreturn preserve;');
 let dispatched=0;
 const sandbox={dispatchEvent:()=>{dispatched++}};
 const f=createBuild(item());
 const preserve=make(()=>USER,()=>{},false,()=>{},()=>ID,
   ()=>({hda:'unchanged clinical note'}),async run=>run(),store,
   x=>assert.equal(x,USER),f.build,sandbox,{onLine:false},
   ()=>{throw Error('REMOTE_SYNC_NOT_ALLOWED')},
   class {});
 const result=await preserve('navigation',{sync:false});
 assert.equal(result.local_revision,8);
 assert.equal(dispatched,0);
});

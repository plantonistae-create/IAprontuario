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


/* A reset must never adopt retained text from a locked note as a new patient. */
function startFixture({originalState='audited',originalSync='locked',visible='Texto de consulta bloqueada',priorId=ID}={}){
 const records=new Map([[ID,item({state:originalState,sync:originalSync})]]);
 const events=[];let minted=0;
 const currentFields=()=>({hda:visible});
 const original=source.slice(source.indexOf('async function startNew('),
  source.indexOf('async function adoptExisting(',source.indexOf('async function startNew(')));
 assert.match(original,/NEW_ENCOUNTER_REQUIRES_EMPTY_FORM/);
 assert.match(original,/LOCKED_ENCOUNTER_REQUIRES_EMPTY_FORM/);
 const factory=new Function('ensureOwnerScope','owner','collectFields',
   'ownerSwitchRequiresExplicitEncounter','meaningful','serializeLocal',
   'currentEncounterId','store','assertOwnerStill','uuid','setActiveId',
   'buildLocal','navigator','syncOne','window','CustomEvent',
   original+'\nreturn startNew;');
 const store={
  get:async id=>structuredClone(records.get(id)||null),
  put:async rec=>{records.set(rec.encounter_id,structuredClone(rec));return rec}
 };
 let active=priorId;
 const run=factory(()=>{},()=>USER,currentFields,false,
   x=>Object.values(x||{}).some(y=>String(y||'').trim()),
   async callback=>callback(),()=>active,store,who=>assert.equal(who,USER),
   ()=>'44444444-4444-4444-8444-'+String(++minted).padStart(12,'0'),
   id=>{active=id},
   async (_reason,id,fields,actor)=>({encounter_id:id,owner_user_id:actor,
    fields,encounter_state:'draft',sync_state:'pending'}),
   {onLine:false},()=>{throw Error('REMOTE_SYNC_NOT_ALLOWED')},
   {dispatchEvent:x=>events.push(x)},
   class{constructor(name,opts){this.type=name;this.detail=opts?.detail}});
 return {run,records,events,get minted(){return minted},get active(){return active}};
}

test('failed reset cannot duplicate previous patient text into new encounter',async()=>{
 const f=startFixture();
 const before=structuredClone(f.records.get(ID));
 await assert.rejects(f.run('after_reset'),/NEW_ENCOUNTER_REQUIRES_EMPTY_FORM/);
 assert.equal(f.minted,0);
 assert.equal(f.records.size,1);
 assert.deepEqual(f.records.get(ID),before);
 assert.equal(f.active,ID);
 assert.equal(f.events.length,0);
});
test('manual new encounter from locked visible note requires clearing first',async()=>{
 const f=startFixture();
 await assert.rejects(f.run('new_encounter'),/LOCKED_ENCOUNTER_REQUIRES_EMPTY_FORM/);
 assert.equal(f.minted,0);
 assert.equal(f.records.size,1);
 assert.equal(f.events.length,0);
});
test('blank canonical reset can create a fresh empty draft safely',async()=>{
 const f=startFixture({visible:''});
 const previous=structuredClone(f.records.get(ID));
 const started=await f.run('after_reset');
 assert.equal(f.minted,1);
 assert.notEqual(started.encounter_id,ID);
 assert.deepEqual(started.fields,{hda:''});
 assert.equal(started.owner_user_id,USER);
 assert.deepEqual(f.records.get(ID),previous);
 assert.equal(f.records.size,2);
 assert.equal(f.events.length,1);
});


test('ordinary pending draft cannot be cloned as a new encounter by direct start',async()=>{
 const f=startFixture({originalState:'draft',originalSync:'pending'});
 await assert.rejects(f.run('new_encounter'),/NEW_ENCOUNTER_REQUIRES_EMPTY_FORM/);
 assert.equal(f.minted,0);
 assert.equal(f.records.size,1);
 assert.equal(f.active,ID);
});
test('unknown existing encounter id with visible clinical text fails closed',async()=>{
 const UNKNOWN='55555555-5555-4555-8555-555555555555';
 const f=startFixture({priorId:UNKNOWN});
 await assert.rejects(f.run('new_encounter'),/ACTIVE_ENCOUNTER_NOT_RECOVERED/);
 assert.equal(f.minted,0);
 assert.equal(f.active,UNKNOWN);
});
test('fresh encounter without an active id can preserve a new unprocessed note',async()=>{
 const f=startFixture({priorId:'',visible:'Anamnese sintética de nova consulta'});
 const started=await f.run('recording_start');
 assert.notEqual(started.encounter_id,ID);
 assert.equal(started.fields.hda,'Anamnese sintética de nova consulta');
 assert.equal(f.records.size,2);
});

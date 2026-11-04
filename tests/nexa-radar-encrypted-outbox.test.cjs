const {test}=require('node:test');
const assert=require('node:assert/strict');
const outbox=require('../nexa-radar-encrypted-outbox.js');
const ledger=require('../nexa-radar-ledger-client.js');

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const keySlot='44444444-4444-4444-8444-444444444444';
const encounter='11111111-1111-4111-8111-111111111111';
const organization='22222222-2222-4222-8222-222222222222';
const consultation={id:'legacy-text-consultation',encounter_id:encounter,organization_id:organization,
  user_id:owner,encounter_state:'draft'};
const binding=()=>ledger.bind({consultation,activeEncounterId:encounter,userId:owner,organizationId:organization});
const event=i=>({event_id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,sequence:i,
  id:'dyspnea',concept:'dyspnea',type:'appeared',previous_status:null,current_status:'to_ask',
  previous_priority:null,current_priority:'high',reason_code:'engine_recalculation',
  origin:'engine',engine_version:'radar-temporal-v1',snapshot_version:1,
  transcript:'This synthetic text must not be stored'});
const input=i=>({owner_user_id:owner,encounter_id:encounter,organization_id:organization,event:event(i)});
const key=()=>crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
function memoryStore(){const items=new Map();return{
  items,get:async id=>items.get(id),all:async()=>[...items.values()],
  add:async item=>{if(items.has(item.id))throw new Error('RADAR_OUTBOX_DUPLICATE');items.set(item.id,item)},
  remove:async id=>{items.delete(id)}
}}

test('requires a nonextractable externally supplied key',async()=>{
  const store=memoryStore();
  assert.throws(()=>outbox.create({keySlot,key:null,store,ledger}),/RADAR_OUTBOX_PROTECTED_KEY_REQUIRED/);
  const extractable=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  assert.throws(()=>outbox.create({keySlot,key:extractable,store,ledger}),/RADAR_OUTBOX_PROTECTED_KEY_REQUIRED/);
});

test('stores only ciphertext and recovers pending events with the same unlocked key',async()=>{
  const secret=await key(),store=memoryStore();
  const first=outbox.create({keySlot,key:secret,store,ledger});
  await first.enqueue(input(1));
  assert.equal(store.items.size,1);
  const raw=[...store.items.values()][0];
  assert.deepEqual(Object.keys(raw).sort(),['ciphertext','id','iv','slot']);
  assert.ok(!JSON.stringify(raw).includes(encounter));
  assert.ok(!JSON.stringify(raw).includes('synthetic text'));
  const afterReload=outbox.create({keySlot,key:secret,store,ledger});
  assert.equal((await afterReload.pending(binding())).length,1);
  assert.equal((await afterReload.pending({...binding(),owner_user_id:encounter})).length,0);
  const wrongKey=await key();
  await assert.rejects(()=>outbox.create({keySlot,key:wrongKey,store,ledger}).pending(binding()),
    /RADAR_OUTBOX_DECRYPT_FAILED/);
});

test('retries after lost ACK and deduplicates two tabs without deleting before server ACK',async()=>{
  const secret=await key(),store=memoryStore(),a=outbox.create({keySlot,key:secret,store,ledger}),
    b=outbox.create({keySlot,key:secret,store,ledger});
  await a.enqueue(input(2));
  await b.enqueue(input(2));
  await assert.rejects(()=>b.enqueue({...input(2),event:{...event(2),reason_code:'patient_answer'}}),
    /RADAR_OUTBOX_EVENT_ID_CONFLICT/);
  const failed=await a.drain({rpc:async()=>{throw new Error('ACK lost')}},binding());
  assert.deepEqual(failed,{acknowledged:0,pending:1,complete:false});
  assert.equal(store.items.size,1);
  let calls=0;
  const success=await b.drain({rpc:async()=>{calls++;return {data:1,error:null}}},binding());
  assert.deepEqual(success,{acknowledged:1,pending:0,complete:true});
  assert.equal(calls,1);
  assert.equal(store.items.size,0);
});

test('a second user key slot does not decrypt or count the first user queue',async()=>{
  const store=memoryStore(),first=outbox.create({keySlot,key:await key(),store,ledger});
  await first.enqueue(input(504));
  const second=outbox.create({keySlot:'55555555-5555-4555-8555-555555555555',
    key:await key(),store,ledger});
  assert.equal((await second.pending(binding())).length,0);
  assert.equal((await first.pending(binding())).length,1);
});

test('retains all 502 categorical events beyond the visual cap and drains in order',async()=>{
  const secret=await key(),store=memoryStore(),box=outbox.create({keySlot,key:secret,store,ledger});
  for(let i=1;i<=502;i++)await box.enqueue(input(i));
  assert.equal((await box.pending(binding())).length,502);
  let sequence=0;
  const result=await box.drain({rpc:async(_name,payload)=>{
    assert.equal(payload.p_event_id,event(++sequence).event_id);
    return {data:sequence,error:null};
  }},binding());
  assert.deepEqual(result,{acknowledged:502,pending:0,complete:true});
  assert.equal(store.items.size,0);
});

test('accepts actual clinical engine concepts, including camelCase IDs',async()=>{
  globalThis.NexaRadarEngine=require('../nexa-radar-engine.js');
  require('../nexa-radar-controller.js');
  const captured=[];let hda='';
  const controller=NexaRadarController.create({context:()=>({fields:{hda},transcript:'',cid:''}),
    publish(){},captureEvent:value=>captured.push(value)});
  controller.setOwner(owner);
  controller.bindEncounter(encounter);
  for(let i=0;i<300&&captured.length<502;i++){
    hda=i%2?'Paciente com dispneia há dois dias.':'Paciente com dor abdominal há dois dias.';
    controller.recalculate();
  }
  assert(captured.length>=502);
  assert(captured.some(value=>value.concept==='respFocal'));
  const box=outbox.create({keySlot,key:await key(),store:memoryStore(),ledger});
  for(const value of captured)await box.enqueue({owner_user_id:owner,
    encounter_id:encounter,organization_id:organization,event:value});
  assert.equal((await box.pending(binding())).length,captured.length);
});

test('two tabs may race to retry one event without losing its ID',async()=>{
  const secret=await key(),store=memoryStore();
  const a=outbox.create({keySlot,key:secret,store,ledger}),b=outbox.create({keySlot,key:secret,store,ledger});
  await a.enqueue(input(503));
  const seen=[];
  const client={rpc:async(_name,payload)=>{
    seen.push(payload.p_event_id);
    await new Promise(resolve=>setTimeout(resolve,2));
    return {data:503,error:null};
  }};
  const results=await Promise.all([a.drain(client,binding()),b.drain(client,binding())]);
  assert.ok(results.every(x=>x.complete));
  assert.deepEqual(seen,[event(503).event_id,event(503).event_id]);
  assert.equal(store.items.size,0);
});

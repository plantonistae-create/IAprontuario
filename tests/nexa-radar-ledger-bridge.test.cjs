const {test}=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../nexa-radar-ledger-bridge.js');
const ledger=require('../nexa-radar-ledger-client.js');
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const encounter='11111111-1111-4111-8111-111111111111';
const organization='22222222-2222-4222-8222-222222222222';
const row={id:'legacy-text-consultation',encounter_id:encounter,organization_id:organization,
  user_id:owner,encounter_state:'draft'};
const event={event_id:'00000000-0000-4000-8000-000000000001',id:'dyspnea',concept:'dyspnea',
  type:'appeared',previous_status:null,current_status:'to_ask',previous_priority:null,
  current_priority:'high',reason_code:'engine_recalculation',origin:'engine',
  engine_version:'radar-temporal-v1',snapshot_version:1};

test('waits for a confirmed authenticated autosave before sending queued events',async()=>{
  let active=encounter,serverRow=null,rpcCalls=0;const queued=[];
  const statuses=[];
  const client={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},
    from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:serverRow,error:null})}),
    rpc:async()=>{rpcCalls++;return {data:1,error:null}}};
  const outbox={enqueue:async value=>{queued.push(value);return {state:'pending'}},
    drain:async(c,b)=>{for(const value of queued)await ledger.append(c,b,value.event);
      const acknowledged=queued.length;queued.length=0;return {acknowledged,pending:0,complete:true}}};
  const candidate=bridge.create({ledger,outbox,client,userId:owner,organizationId:organization,
    currentEncounterId:()=>active,onStatus:s=>statuses.push(s)});
  await candidate.captureEvent(event,encounter,owner);
  assert.equal(queued.length,1);
  assert.equal(rpcCalls,0);
  assert.deepEqual(await candidate.onAutosaveSynced({encounter_id:encounter}),
    {complete:false,reason:'binding_unverified'});
  assert.equal(rpcCalls,0);
  serverRow=row;
  assert.deepEqual(await candidate.onAutosaveSynced({encounter_id:encounter}),
    {acknowledged:1,pending:0,complete:true});
  assert.equal(rpcCalls,1);
  assert.equal(statuses.at(-1).state,'confirmed');
  active='33333333-3333-4333-8333-333333333333';
  await assert.rejects(()=>candidate.captureEvent(event,encounter,owner),/RADAR_LEDGER_ENCOUNTER_UNBOUND/);
  assert.equal(rpcCalls,1);
});

test('a delayed lookup cannot send after encounter switch',async()=>{
  let active=encounter,resolveRow,rpcCalls=0;
  const client={auth:{getUser:async()=>({data:{user:{id:owner}}})},
    from:()=>({select(){return this},eq(){return this},maybeSingle:()=>new Promise(resolve=>{resolveRow=resolve})}),
    rpc:async()=>{rpcCalls++;return {data:1}}};
  const candidate=bridge.create({ledger,client,userId:owner,organizationId:organization,
    currentEncounterId:()=>active,outbox:{enqueue:async()=>{},drain:async()=>({complete:true,pending:0})}});
  const waiting=candidate.onAutosaveSynced({encounter_id:encounter});
  await new Promise(resolve=>setTimeout(resolve,0));
  active='33333333-3333-4333-8333-333333333333';candidate.invalidate();
  resolveRow({data:row,error:null});
  assert.deepEqual(await waiting,{complete:false,reason:'superseded'});
  assert.equal(rpcCalls,0);
});

test('candidate bridge follows autosave events and detaches cleanly',async()=>{
  const target=new EventTarget(),statuses=[];let boundId='',drains=0;
  const client={auth:{getUser:async()=>({data:{user:{id:owner}}})},
    from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:row,error:null})})};
  const candidate=bridge.create({ledger,client,userId:owner,organizationId:organization,
    currentEncounterId:()=>encounter,radar:{bindEncounter:id=>{boundId=id;return true}},
    outbox:{enqueue:async()=>{},drain:async()=>{drains++;return {complete:true,pending:0}}},
    onStatus:s=>statuses.push(s.state)});
  const detach=candidate.attach(target);
  target.dispatchEvent(new CustomEvent('nexa:encounter-started',{detail:{encounter_id:encounter}}));
  assert.equal(boundId,encounter);
  target.dispatchEvent(new CustomEvent('nexa:encounter-synced',{detail:{encounter_id:encounter}}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(drains,1);
  assert.equal(statuses.at(-1),'confirmed');
  detach();
  target.dispatchEvent(new CustomEvent('nexa:encounter-synced',{detail:{encounter_id:encounter}}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(drains,1);
});

test('reset or sign-out blocks a late ACK for the old encounter',async()=>{
  const target=new EventTarget();let drains=0,authListener;
  const client={auth:{getUser:async()=>({data:{user:{id:owner}}}),
    onAuthStateChange:fn=>{authListener=fn;return {data:{subscription:{unsubscribe(){}}}}}},
    from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:row,error:null})})};
  const candidate=bridge.create({ledger,client,userId:owner,organizationId:organization,
    currentEncounterId:()=>encounter,radar:{bindEncounter:()=>true},
    outbox:{enqueue:async()=>{},drain:async()=>{drains++;return {complete:true,pending:0}}}});
  const detach=candidate.attach(target);
  target.dispatchEvent(new Event('nexa:consultation-reset'));
  await assert.rejects(()=>candidate.captureEvent(event,encounter,owner),/RADAR_LEDGER_ENCOUNTER_UNBOUND/);
  target.dispatchEvent(new CustomEvent('nexa:encounter-synced',{detail:{encounter_id:encounter}}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(drains,0);
  authListener('SIGNED_OUT');
  assert.deepEqual(await candidate.onAutosaveSynced({encounter_id:encounter}),
    {complete:false,reason:'superseded'});
  detach();
});

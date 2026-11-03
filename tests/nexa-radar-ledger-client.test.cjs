const {test}=require('node:test');
const assert=require('node:assert/strict');
const ledger=require('../nexa-radar-ledger-client.js');
global.NexaRadarEngine=require('../nexa-radar-engine.js');
require('../nexa-radar-controller.js');
const controller=global.NexaRadarController;

const encounter='11111111-1111-4111-8111-111111111111';
const organization='22222222-2222-4222-8222-222222222222';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const eventId='00000000-0000-4000-8000-000000000501';
const row={id:'legacy-consultation-text-42',encounter_id:encounter,organization_id:organization,
  user_id:owner,encounter_state:'draft'};
const event={event_id:eventId,id:'dyspnea',concept:'dyspnea',type:'changed',
  previous_status:'to_ask',current_status:'asked',previous_priority:'high',current_priority:'high',
  reason_code:'patient_answer',origin:'engine',engine_version:'radar-temporal-v1',snapshot_version:1,
  transcript:'Synthetic text must never enter the ledger',patient_text:'Synthetic voice'};
const binding=()=>ledger.bind({consultation:row,activeEncounterId:encounter,userId:owner,organizationId:organization});

test('keeps the legacy text consultation ID distinct from the canonical encounter UUID',()=>{
  const payload=ledger.args(binding(),event);
  assert.equal(payload.p_consultation_id,row.id);
  assert.equal(payload.p_encounter_id,encounter);
  assert.equal(payload.p_organization_id,organization);
  assert.equal(payload.p_event_id,eventId);
  assert.ok(!JSON.stringify(payload).includes('Synthetic text'));
  assert.ok(!JSON.stringify(payload).includes('Synthetic voice'));
});

test('maps a categorical controller event to the candidate RPC without clinical text',()=>{
  const radar=controller.create({context:()=>({fields:{hda:'Dor torácica sintética.'}}),publish(){}});
  radar.setOwner(owner);
  radar.recalculate();
  const generated=radar.snapshot().questionEvents.find(x=>x.concept==='dyspnea');
  assert.ok(generated);
  const payload=ledger.args(binding(),generated);
  assert.equal(payload.p_event_type,'appeared');
  assert.equal(payload.p_previous_status,null);
  assert.equal(payload.p_current_status,generated.status);
  assert.equal(payload.p_origin,'engine');
  assert.ok(!JSON.stringify(payload).includes('sintética'));
  radar.reset();
});

test('rejects an unconfirmed, foreign or mismatched consultation binding',()=>{
  for(const changed of [
    {activeEncounterId:'99999999-9999-4999-8999-999999999999'},
    {userId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
    {organizationId:'33333333-3333-4333-8333-333333333333'},
    {consultation:{...row,encounter_state:'local_only'}},
    {consultation:{...row,encounter_id:'99999999-9999-4999-8999-999999999999'}}
  ])assert.throws(()=>ledger.bind({consultation:row,activeEncounterId:encounter,userId:owner,
    organizationId:organization,...changed}),/RADAR_LEDGER_BINDING_UNVERIFIED/);
  assert.throws(()=>ledger.args({...binding()},event),/RADAR_LEDGER_BINDING_UNVERIFIED/);
});

test('rejects invalid event metadata and withholds ACK on remote failure',async()=>{
  const bound=binding();
  assert.throws(()=>ledger.args(bound,{...event,event_id:'legacy-text-id'}),/RADAR_LEDGER_EVENT_INVALID/);
  assert.throws(()=>ledger.args(bound,{...event,reason_code:'free text'}),/RADAR_LEDGER_EVENT_INVALID/);
  let sent;
  const client={rpc:async(name,payload)=>{sent={name,payload};return {data:501,error:null}}};
  assert.equal(await ledger.append(client,bound,event),501);
  assert.equal(sent.name,'append_nexa_radar_question_event');
  assert.deepEqual(sent.payload,ledger.args(bound,event));
  await assert.rejects(()=>ledger.append({rpc:async()=>({data:null,error:{code:'42501'}})},bound,event),
    /RADAR_LEDGER_REMOTE_ACK_MISSING/);
  await assert.rejects(()=>ledger.append({rpc:async()=>({data:null,error:null})},bound,event),
    /RADAR_LEDGER_REMOTE_ACK_MISSING/);
  await assert.rejects(()=>ledger.append({rpc:async()=>{throw new Error('Synthetic network failure')}},bound,event),
    /RADAR_LEDGER_REMOTE_ACK_MISSING/);
});

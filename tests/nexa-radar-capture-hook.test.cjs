const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

function candidate(){
  let turn=0;
  const engine={analyze(){turn++;return {items:[{id:turn%2?'first':'second',concept:'dyspnea',
    priority:'high',status:'to_ask'}],hasContext:false}},concepts:{dyspnea:{}}};
  const root={NexaRadarEngine:engine,crypto,structuredClone,setTimeout,clearTimeout,
    AbortController,Date,Promise};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../nexa-radar-controller.js'),'utf8'),root);
  return root.NexaRadarController;
}

test('captures more than 500 categorical events before the 300-row visual cap',()=>{
  const captured=[],controller=candidate().create({context:()=>({}),publish(){},
    captureEvent:(entry,encounter,owner)=>captured.push({entry,encounter,owner})});
  controller.setOwner('synthetic-owner');
  for(let i=0;i<252;i++)controller.recalculate();
  const snapshot=controller.snapshot();
  assert.ok(captured.length>=500);
  assert.equal(snapshot.questionEvents.length,300);
  assert.equal(snapshot.questionEventSequence,captured.length);
  assert.equal(snapshot.questionTraceTruncated,true);
  assert.deepEqual(captured.map(x=>x.entry.sequence),
    Array.from({length:captured.length},(_,i)=>i+1));
  assert.ok(captured.every(x=>x.encounter===snapshot.encounter&&x.owner==='synthetic-owner'));
  assert.ok(captured.every(x=>!JSON.stringify(x.entry).includes('transcript')));
});

test('capture rejection is visible and cannot mark a later encounter failed',async()=>{
  let reject;
  const controller=candidate().create({context:()=>({}),publish(){},
    captureEvent:()=>new Promise((_,r)=>{reject=r})});
  controller.setOwner('synthetic-owner');
  controller.recalculate();
  reject(new Error('synthetic IDB failure'));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(controller.snapshot().questionEventCaptureError,true);
  controller.reset('synthetic-owner');
  assert.equal(controller.snapshot().questionEventCaptureError,false);
});

test('candidate synchronization state stays explicit and resets with the encounter',()=>{
  const controller=candidate().create({context:()=>({}),publish(){}});
  controller.setLedgerSyncStatus({state:'pending',pending:7});
  assert.equal(controller.state.ledgerSyncStatus.state,'pending');
  assert.equal(controller.state.ledgerSyncStatus.pending,7);
  controller.reset('synthetic-owner');
  controller.recalculate();
  assert.equal(controller.state.ledgerSyncStatus.state,'inactive');
});

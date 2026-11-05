'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../nexa-transcript-encrypted-draft');
const bridge=require('../nexa-transcript-draft-bridge');
const uuid=()=>crypto.randomUUID();
const key=()=>crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
const binding=()=>({owner_user_id:uuid(),organization_id:uuid(),encounter_id:uuid(),
  consultation_id:'synthetic-consultation-'+uuid()});
function store(){
  const rows=new Map();let fail=false;
  return {rows,setFail:value=>{fail=value},
    add:async item=>{if(fail)throw Error('synthetic storage failure');if(rows.has(item.id))throw Error('duplicate');rows.set(item.id,item)},
    all:async()=>[...rows.values()],remove:async id=>{if(fail)throw Error('synthetic storage failure');rows.delete(id)}};
}

test('draft bridge cannot activate on the public production host',()=>{
  const previous={location:globalThis.location,flag:globalThis.__NEXA_TRANSCRIPT_DRAFT_E2E__,
    store:globalThis.NexaTranscriptEncryptedDraft};
  try{
    globalThis.NexaTranscriptEncryptedDraft={create};
    globalThis.__NEXA_TRANSCRIPT_DRAFT_E2E__={enabled:true};
    globalThis.location={hostname:'plantonistae-create.github.io'};
    assert.equal(bridge.enabled(),false);
    globalThis.location={hostname:'127.0.0.1'};
    delete globalThis.__NEXA_TRANSCRIPT_DRAFT_E2E__;
    assert.equal(bridge.enabled(),false);
  }finally{
    globalThis.location=previous.location;
    globalThis.__NEXA_TRANSCRIPT_DRAFT_E2E__=previous.flag;
    globalThis.NexaTranscriptEncryptedDraft=previous.store;
  }
});

test('a forced close can reopen only encrypted, unconfirmed snapshots with the supplied key',async()=>{
  const memory=store(),secret=await key(),slot=uuid(),scope=binding(),parent=uuid();
  const first=create({key:secret,keySlot:slot,store:memory});
  const older=await first.save({binding:scope,parent_version_id:parent,text:'Correção sintética inicial.'});
  const newer=await first.save({binding:scope,parent_version_id:parent,text:'Correção sintética após edição.'});
  assert.equal(older.state,'stored_locally_unconfirmed');
  assert.equal(newer.state,'stored_locally_unconfirmed');
  assert.equal(memory.rows.size,2,'snapshots are append-only across tabs');
  assert.ok([...memory.rows.values()].every(row=>!JSON.stringify(row).includes('Correção sintética')),
    'no plaintext may be written to persistent storage');
  const reopened=create({key:secret,keySlot:slot,store:memory});
  const drafts=await reopened.list(scope);
  assert.equal(drafts.length,2);
  assert.deepEqual(new Set(drafts.map(x=>x.text)),new Set(['Correção sintética inicial.','Correção sintética após edição.']));
  assert.deepEqual(drafts.map(x=>x.parent_version_id),[parent,parent]);
  await reopened.remove(scope,older.draft_id);
  assert.equal((await reopened.list(scope)).length,1,'deletion must be explicit');
});

test('wrong key, missing key and foreign identity fail closed without deleting ciphertext',async()=>{
  const memory=store(),secret=await key(),slot=uuid(),scope=binding();
  const draft=create({key:secret,keySlot:slot,store:memory});
  const saved=await draft.save({binding:scope,parent_version_id:uuid(),text:'Texto sintético protegido.'});
  assert.throws(()=>create({keySlot:slot,store:memory}),/PROTECTED_KEY_REQUIRED/);
  await assert.rejects(create({key:await key(),keySlot:slot,store:memory}).list(scope),/DECRYPT_FAILED/);
  assert.deepEqual(await draft.list({...scope,owner_user_id:uuid()}),[]);
  await assert.rejects(draft.remove({...scope,organization_id:uuid()},saved.draft_id),/BINDING_INVALID/);
  assert.equal(memory.rows.size,1);
  assert.deepEqual(await create({key:secret,keySlot:uuid(),store:memory}).list(scope),[]);
});

test('concurrent session snapshots survive independently; failure never claims a local ACK',async()=>{
  const memory=store(),secret=await key(),slot=uuid(),scope=binding(),parent=uuid();
  const tabA=create({key:secret,keySlot:slot,store:memory}),tabB=create({key:secret,keySlot:slot,store:memory});
  await Promise.all([tabA.save({binding:scope,parent_version_id:parent,text:'A'}),
    tabB.save({binding:scope,parent_version_id:parent,text:'B'})]);
  assert.deepEqual(new Set((await tabA.list(scope)).map(x=>x.text)),new Set(['A','B']));
  memory.setFail(true);
  await assert.rejects(tabA.save({binding:scope,parent_version_id:parent,text:'C'}),/storage failure/);
  assert.equal(memory.rows.size,2);
  assert.ok((await tabB.list(scope)).every(x=>x.version===1));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewAuthorityBoundaryCandidate as check} from './nexa-ack-authority-boundary.P0-CANDIDATE.mjs';

// All IDs and hashes below are synthetic; no patient or live token appears here.
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const E='33333333-3333-4333-8333-333333333333';
const X='44444444-4444-4444-8444-444444444444';
const P='55555555-5555-4555-8555-555555555555';
const H='66666666-6666-4666-8666-666666666666';
const C='77777777-7777-4777-8777-777777777777';
const S='88888888-8888-4888-8888-888888888888';
const D='sha256:'+'a'.repeat(64);
const OUT='sha256:'+'b'.repeat(64);
const token='a'.repeat(43);
const now=1_800_000_000_000;
const baseReq={encounterId:E,expectedSyncVersion:5,displayedDigest:D};
const consumeReq={...baseReq,challengeId:C,challengeToken:token,actionId:S,confirmation:{physicianReviewedExactPersistedSnapshot:true}};

function fixture(overrides={}) {
  const ctx={
    actor:A,
    row:{ownerUserId:A,encounterId:E,sourceRowId:'synthetic-source',syncVersion:5,clinicalDigest:D,
      canonicalization:'pg-jsonb-v1',ownerAndActiveSlotVerified:true,serverSyncAck:true},
    processing:{ownerUserId:A,encounterId:E,sourceRowId:'synthetic-source',sourceSyncVersion:5,
      sourceDigest:D,canonicalization:'pg-jsonb-v1',terminalState:'COMPLETED',producedByServer:true,
      immutableServerReceiptReadback:true,executionId:X,receiptId:P,outputDigest:OUT,
      provider:'synthetic',modelVersion:'model-test-v1'},
    audio:{ownerUserId:A,encounterId:E,sourceRowId:'synthetic-source',evidenceId:H,
      finishedByTrustedServer:true,allChunksAccountedFor:true,pendingChunks:0,archiveRequired:false,
      verifiedArchiveReceipt:false},
    reconciliation:{ownerUserId:A,encounterId:E,sourceSyncVersion:5,sourceDigest:D,
      processingReceiptId:P,serverVerified:true,pending:false,conflict:false,postReviewEdits:false},
    consent:{ownerUserId:A,encounterId:E,purpose:'audit_deidentification',serverVerified:true,
      revoked:false,eventId:S},
    challenge:{id:C,ownerUserId:A,encounterId:E,sourceRowId:'synthetic-source',sourceSyncVersion:5,
      sourceDigest:D,processingReceiptId:P,audioEvidenceId:H,consentEventId:S,
      issuedByServer:true,consumedAt:null,expiresAtEpochMs:now+60_000,
      nonceHashVerifiedByServer:true},
    now,
    ...overrides
  };
  let authCount=0;
  const deps={
    auth:{getUser:async()=>({id:++authCount===2&&ctx.changedActor?ctx.changedActor:ctx.actor})},
    source:{readOwnedSyncedSource:async()=>ctx.row},
    evidence:{readServerProcessingReceipt:async()=>ctx.processing,
      readServerAudioCompletion:async()=>ctx.audio,
      readServerReconciliation:async()=>ctx.reconciliation,
      readServerConsent:async()=>ctx.consent},
    challengeStore:{readVerifiedChallenge:async()=>ctx.challenge},
    clock:{nowEpochMs:async()=>ctx.now},
  };
  return {ctx,deps};
}
async function run(kind='consume',overrides={},request) {
  const {deps}=fixture(overrides);
  const req=request|| (kind==='receipt'?{encounterId:E,executionId:X}:
    kind==='issue'?baseReq:consumeReq);
  return check({kind,request:req,...deps});
}
function stopped(result,code){
  assert.equal(result.status,'STOP');
  assert.equal(result.code,code);
  for (const key of ['processingReceiptRecorded','challengeIssued','challengeConsumed',
    'ackRecorded','externalAiAuthorized','auditAuthorized','gateCVerified']) {
    assert.equal(result[key],false,key);
  }
  assert.equal(Object.isFrozen(result),true);
}

test('fully synthetic processing facts never become an immutable receipt',async()=>{
  stopped(await run('receipt'),'PROCESSING_LEDGER_TRANSACTION_NOT_PROVEN');
});
test('complete synthetic facts never issue a server challenge',async()=>{
  stopped(await run('issue'),'SERVER_CHALLENGE_ISSUER_NOT_PROVEN');
});
test('complete synthetic facts never consume challenge or authorize ACK',async()=>{
  stopped(await run(),'ATOMIC_CHALLENGE_CONSUMPTION_NOT_PROVEN');
});
test('rejects clinical fields, client actor and unrecognized payload',async()=>{
  stopped(await run('issue',{}, {...baseReq,fields:{hda:'sensitive'}}),'REQUEST_REJECTED');
  stopped(await run('receipt',{}, {encounterId:E,executionId:X,actorId:A}),'REQUEST_REJECTED');
  stopped(await run('consume',{}, {...consumeReq,serverVerified:true}),'REQUEST_REJECTED');
});
test('explicit medical confirmation is mandatory',async()=>{
  stopped(await run('consume',{}, {...consumeReq,confirmation:{physicianReviewedExactPersistedSnapshot:false}}),'REQUEST_REJECTED');
});
test('rejects forged or short-lived client challenge token',async()=>{
  stopped(await run('consume',{}, {...consumeReq,challengeToken:'short'}),'REQUEST_REJECTED');
});
test('untrusted or missing owner/sync slot fails closed',async()=>{
  stopped(await run('issue',{row:{...fixture().ctx.row,ownerUserId:B}}),'OWNER_SOURCE_OR_SYNC_NOT_VERIFIED');
  stopped(await run('issue',{row:{...fixture().ctx.row,serverSyncAck:false}}),'OWNER_SOURCE_OR_SYNC_NOT_VERIFIED');
  stopped(await run('issue',{row:{...fixture().ctx.row,ownerAndActiveSlotVerified:false}}),'OWNER_SOURCE_OR_SYNC_NOT_VERIFIED');
});
test('newer source version, changed digest and different canonicalization rejected',async()=>{
  stopped(await run('issue',{row:{...fixture().ctx.row,syncVersion:6}}),'SOURCE_VERSION_OR_DIGEST_CHANGED');
  stopped(await run('issue',{row:{...fixture().ctx.row,clinicalDigest:OUT}}),'SOURCE_VERSION_OR_DIGEST_CHANGED');
  stopped(await run('issue',{row:{...fixture().ctx.row,canonicalization:'readback-v1'}}),'OWNER_SOURCE_OR_SYNC_NOT_VERIFIED');
});
test('processing requires independently read back server evidence and correct model identity',async()=>{
  stopped(await run('issue',{processing:{...fixture().ctx.processing,producedByServer:false}}),'PROCESSING_SERVER_RECEIPT_NOT_VERIFIED');
  stopped(await run('issue',{processing:{...fixture().ctx.processing,immutableServerReceiptReadback:false}}),'PROCESSING_SERVER_RECEIPT_NOT_VERIFIED');
  stopped(await run('receipt',{processing:{...fixture().ctx.processing,executionId:S}}),'PROCESSING_SERVER_RECEIPT_NOT_VERIFIED');
});
test('audio absent, pending chunks, and archive required without receipt all stop',async()=>{
  stopped(await run('issue',{audio:null}),'COMPLETE_SERVER_EVIDENCE_NOT_VERIFIED');
  stopped(await run('issue',{audio:{...fixture().ctx.audio,pendingChunks:1}}),'COMPLETE_SERVER_EVIDENCE_NOT_VERIFIED');
  stopped(await run('issue',{audio:{...fixture().ctx.audio,archiveRequired:true,verifiedArchiveReceipt:false}}),'COMPLETE_SERVER_EVIDENCE_NOT_VERIFIED');
});
test('not all consultations require archived audio when completion independently proved',async()=>{
  stopped(await run('issue',{audio:{...fixture().ctx.audio,archiveRequired:false,verifiedArchiveReceipt:false}}),'SERVER_CHALLENGE_ISSUER_NOT_PROVEN');
});
test('unsynced or edited clinical reconciliation denies challenge',async()=>{
  stopped(await run('issue',{reconciliation:{...fixture().ctx.reconciliation,pending:true}}),'COMPLETE_SERVER_EVIDENCE_NOT_VERIFIED');
  stopped(await run('issue',{reconciliation:{...fixture().ctx.reconciliation,postReviewEdits:true}}),'COMPLETE_SERVER_EVIDENCE_NOT_VERIFIED');
  stopped(await run('issue',{reconciliation:{...fixture().ctx.reconciliation,sourceSyncVersion:4}}),'COMPLETE_SERVER_EVIDENCE_NOT_VERIFIED');
});
test('revoked, missing or foreign consent never enables challenge',async()=>{
  stopped(await run('issue',{consent:{...fixture().ctx.consent,revoked:true}}),'COMPLETE_SERVER_EVIDENCE_NOT_VERIFIED');
  stopped(await run('issue',{consent:{...fixture().ctx.consent,ownerUserId:B}}),'COMPLETE_SERVER_EVIDENCE_NOT_VERIFIED');
  stopped(await run('issue',{consent:null}),'COMPLETE_SERVER_EVIDENCE_NOT_VERIFIED');
});
test('challenge expiry, reuse, actor mismatch, nonce mismatch, version mismatch stop',async()=>{
  stopped(await run('consume',{challenge:{...fixture().ctx.challenge,expiresAtEpochMs:now-1}}),'CHALLENGE_MISMATCH_EXPIRED_OR_CONSUMED');
  stopped(await run('consume',{challenge:{...fixture().ctx.challenge,consumedAt:now-100}}),'CHALLENGE_MISMATCH_EXPIRED_OR_CONSUMED');
  stopped(await run('consume',{challenge:{...fixture().ctx.challenge,ownerUserId:B}}),'CHALLENGE_MISMATCH_EXPIRED_OR_CONSUMED');
  stopped(await run('consume',{challenge:{...fixture().ctx.challenge,nonceHashVerifiedByServer:false}}),'CHALLENGE_MISMATCH_EXPIRED_OR_CONSUMED');
  stopped(await run('consume',{challenge:{...fixture().ctx.challenge,sourceSyncVersion:3}}),'CHALLENGE_MISMATCH_EXPIRED_OR_CONSUMED');
});
test('second authentication failure means no candidate authority',async()=>{
  stopped(await run('consume',{changedActor:B}),'SESSION_CHANGED');
});
test('missing backend adapters fail before evidence operations',async()=>{
  const f=fixture();
  stopped(await check({kind:'issue',request:baseReq,auth:f.deps.auth,source:f.deps.source,evidence:{}}),'SERVER_AUTHORITY_ADAPTER_MISSING');
});
test('backend evidence errors cannot produce positive output',async()=>{
  const f=fixture();f.deps.source.readOwnedSyncedSource=async()=>{throw Error('offline synthetic missing')};
  stopped(await check({kind:'issue',request:baseReq,...f.deps}),'SERVER_EVIDENCE_READ_FAILED');
});
test('concurrent consume preflights NEVER mutate or authorize anything',async()=>{
  const f=fixture();let writes=0;
  // Even if the caller offers such a method, this candidate must not invoke it.
  f.deps.challengeStore.consumeAndAckAtomic=async()=>{writes++;return {ackRecorded:true}};
  const x=await Promise.all(Array.from({length:5},()=>check({kind:'consume',request:consumeReq,...f.deps})));
  assert.equal(writes,0);for(const y of x)stopped(y,'ATOMIC_CHALLENGE_CONSUMPTION_NOT_PROVEN');
});

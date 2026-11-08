import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineReceiptReview} from '../labs/nexa-quota/receipt-review.G8-LAB-ONLY.mjs';
const R='99999999-9999-4999-8999-000000000001',X='99999999-9999-4999-8999-000000000002';
const receipt=(requestId=R,outcome='seen')=>({provider_request_id:requestId,outcome,source:'offline_mock'});
function harness({state='outcome_unknown',receiptData=receipt(),failClaim=false,failReceipt=false}={}){
 let claimReads=0,receiptReads=0;
 const review=createOfflineReceiptReview({
  getClaimState:async()=>{claimReads++;if(failClaim)throw Error('database');return state;},
  readMockReceipt:async()=>{receiptReads++;if(failReceipt)throw Error('offline');return receiptData;}
 });
 return {review,counts:()=>({claimReads,receiptReads})};
}
test('mock provider seen does NOT prove billing, clinical safety or justify retry',async()=>{
 const x=harness(),r=await x.review(R);
 assert.equal(r.status,'REVIEW_REQUIRED');
 assert.equal(r.detail,'MOCK_PROVIDER_SEEN_NOT_BILLING_PROOF');
 assert.equal(r.official_provider_billing_verified,false);
 assert.equal(r.zero_charge_verified,false);
 assert.equal(r.automatic_paid_retry,false);
 assert.equal(r.remote_provider_calls,0);
});
test('mock provider not-found never becomes proof of zero charge',async()=>{
 const x=harness({receiptData:receipt(R,'not_found')});
 const r=await x.review(R);
 assert.equal(r.detail,'MOCK_NOT_FOUND_NOT_NO_CHARGE_PROOF');
 assert.equal(r.zero_charge_verified,false);
});
test('unclaimed or reserved states cannot trigger even a simulated receipt lookup',async()=>{
 for(const state of ['reserved','missing','not_verified']){
  const x=harness({state});
  const r=await x.review(R);
  assert.equal(r.status,'STOP');assert.equal(x.counts().receiptReads,0);
 }
});
test('foreign request IDs, client supplied PHI and forged mock receipt source stop review',async()=>{
 for(const receiptData of [
  receipt(X),{...receipt(),source:'user_metadata'},
  {...receipt(),patient:'PRIVATE'},
  {...receipt(),provider_invoice:'claim_paid'}
 ]){
  const x=harness({receiptData});
  assert.equal((await x.review(R)).detail,'MOCK_RECEIPT_UNTRUSTED');
 }
 const x=harness();
 assert.equal((await x.review({requestId:R,tenantId:'forged'})).detail,'INVALID_REQUEST_ID');
});
test('unavailable receipt is review required, not automatically unbilled',async()=>{
 const x=harness({failReceipt:true});
 const r=await x.review(R);
 assert.equal(r.status,'REVIEW_REQUIRED');
 assert.equal(r.detail,'MOCK_RECEIPT_UNAVAILABLE');
 assert.equal(r.zero_charge_verified,false);
});
test('unknown claim authority fails STOP before receipt lookup',async()=>{
 const x=harness({failClaim:true});
 assert.equal((await x.review(R)).detail,'CLAIM_STATE_UNVERIFIED');
 assert.equal(x.counts().receiptReads,0);
});
test('repeat review is stable and makes no second mock lookup',async()=>{
 const x=harness();
 const a=await x.review(R),b=await x.review(R);
 assert.equal(a,b);
 assert.deepEqual(x.counts(),{claimReads:1,receiptReads:1});
});
test('all synthetic receipt outcomes leave live admission and billing unresolved',async()=>{
 for(const status of ['seen','not_found','indeterminate']){
  const x=harness({receiptData:receipt(R,status)});
  const r=await x.review(R);
  assert.equal(r.automatic_paid_retry,false);
  assert.equal(r.official_provider_billing_verified,false);
  assert.equal(r.clinical_result_verified,false);
 }
});

test('16 overlapping offline receipt reviews coalesce to one lookup',async()=>{
 const x=harness();
 const results=await Promise.all(Array.from({length:16},()=>x.review(R)));
 assert.ok(results.every(r=>r===results[0]));
 assert.deepEqual(x.counts(),{claimReads:1,receiptReads:1});
});

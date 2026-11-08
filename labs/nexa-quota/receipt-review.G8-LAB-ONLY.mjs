// G8 OFFLINE ONLY. Mocked provider "receipts" are NOT invoices or hosted evidence.
// Never import into app/Edge, never attempt a provider API call, never retry dispatch.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const claimStates=new Set(['claimed','outcome_unknown','confirmed_response']);
const receiptOutcomes=new Set(['seen','not_found','indeterminate']);
const keys=new Set(['provider_request_id','outcome','source']);
const plain=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const result=(status,detail)=>Object.freeze({
 schema_version:'nexa-g8-offline-receipt-v1',
 status,detail,automatic_paid_retry:false,
 official_provider_billing_verified:false,
 zero_charge_verified:false,clinical_result_verified:false,
 remote_provider_calls:0
});
export function createOfflineReceiptReview({getClaimState,readMockReceipt}={}){
 if(typeof getClaimState!=='function'||typeof readMockReceipt!=='function')
  throw Error('OFFLINE_RECEIPT_ADAPTER_INVALID');
 const reviewed=new Map();
 return async function review(requestId){
  if(typeof requestId!=='string'||!uuid.test(requestId))return result('STOP','INVALID_REQUEST_ID');
  if(reviewed.has(requestId))return reviewed.get(requestId);
  const pending=(async()=>{
  let state;
  try{state=await getClaimState(requestId);}
  catch{return result('STOP','CLAIM_STATE_UNVERIFIED');}
  if(!claimStates.has(state))return result('STOP','CLAIM_NOT_DISPATCHED_OR_UNVERIFIED');
  // Pure offline fixture lookup. Result is NOT used to change state of claims,
  // authorize dispatch, infer zero billing, or claim external verification.
  let receipt;
  try{receipt=await readMockReceipt(requestId);}
  catch{receipt=null;}
  let answer;
  if(receipt===null){
   answer=result('REVIEW_REQUIRED','MOCK_RECEIPT_UNAVAILABLE');
  }else if(!plain(receipt)||Object.keys(receipt).some(k=>!keys.has(k))||
   receipt.provider_request_id!==requestId||receipt.source!=='offline_mock'||
   !receiptOutcomes.has(receipt.outcome)){
   answer=result('STOP','MOCK_RECEIPT_UNTRUSTED');
  }else if(receipt.outcome==='seen'){
   answer=result('REVIEW_REQUIRED','MOCK_PROVIDER_SEEN_NOT_BILLING_PROOF');
  }else if(receipt.outcome==='not_found'){
   answer=result('REVIEW_REQUIRED','MOCK_NOT_FOUND_NOT_NO_CHARGE_PROOF');
  }else{
   answer=result('REVIEW_REQUIRED','MOCK_OUTCOME_INDETERMINATE');
  }
  // Simulated memoization reduces repeated lab probes but provides no
  // durable exactly-once guarantee or crash consistency.
  return answer;
  })();
  reviewed.set(requestId,pending);
  return pending;
 };
}

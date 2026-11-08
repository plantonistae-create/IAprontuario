// G9 OFFLINE FIXTURE. No provider I/O, official receipts or billable retry.
// Signature proves only control of a synthetic test key, never provider billing.
import {createHash,verify} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const fields=['aud','event_id','issued_at','issuer','key_id','observation','request_id','tenant_id','type'];
const observations=new Set(['seen','not_found','indeterminate']);
const deny=reason=>Object.freeze({verified:false,reason,paid_retry_allowed:false,official_invoice_verified:false,zero_charge_verified:false});
export function createOfflineSignedReceiptVerifier({publicKey,clock,getClaim}={}){
 if(publicKey?.type!=='public'||publicKey.asymmetricKeyType!=='ed25519'||
   typeof clock!=='function'||typeof getClaim!=='function')throw Error('G9_RECEIPT_DEPS_INVALID');
 return async (proof,expectedRequestId)=>{
  if(!uuid.test(expectedRequestId||'')||!plain(proof)||!plain(proof.claims)||
   Object.keys(proof).sort().join('|')!=='claims|signature'||
   Object.keys(proof.claims).sort().join('|')!==fields.slice().sort().join('|')||
   typeof proof.signature!=='string'||!/^[A-Za-z0-9_-]{80,100}$/.test(proof.signature))
    return deny('RECEIPT_ENVELOPE_INVALID');
  const c=proof.claims,now=clock();
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(c.issued_at)||c.issued_at>now||
    now-c.issued_at>120||c.type!=='nexa-g9-offline-receipt'||
    c.issuer!=='offline-provider-fixture'||c.aud!=='nexa-g9-lab'||
    c.key_id!=='ephemeral-provider-ed25519'||c.request_id!==expectedRequestId||
    !uuid.test(c.tenant_id||'')||!uuid.test(c.event_id||'')||
    !observations.has(c.observation))return deny('RECEIPT_CLAIMS_INVALID');
  let signed=false;
  try{signed=verify(null,Buffer.from(JSON.stringify(c)),publicKey,
    Buffer.from(proof.signature,'base64url'))}catch{}
  if(!signed)return deny('RECEIPT_SIGNATURE_INVALID');
  let claim;
  try{claim=await getClaim({requestId:c.request_id});}
  catch{return deny('CLAIM_LOOKUP_UNAVAILABLE');}
  if(!plain(claim)||claim.tenant_id!==c.tenant_id||
     !['claimed','outcome_unknown','confirmed_response'].includes(claim.state)||
     claim.authenticated_source!=='disposable_postgres')
   return deny('CLAIM_NOT_AUTHORIZED_OR_VISIBLE');
  return Object.freeze({verified:true,reason:'SIGNED_OFFLINE_FIXTURE_ONLY',
   receipt_digest:createHash('sha256').update(JSON.stringify(c)).digest('hex'),
   observation:c.observation,paid_retry_allowed:false,
   official_invoice_verified:false,zero_charge_verified:false,
   clinic_validated:false});
 };
}

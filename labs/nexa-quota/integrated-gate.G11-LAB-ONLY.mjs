// G11 INTEGRATED TRUST LAB — NEVER import into hosted Edge or UI.
// A mock Ed25519 issuer + disposable PostgreSQL login are two synthetic
// independent factors. Neither establishes a real Supabase Auth identity.
// No billable dispatch is available in this module, by design.
import {verify} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noncePattern=/^[0-9a-f]{32}$/;
const keys=['aud','db_principal','expires_at','issuer','key_epoch','nonce','not_before','operator_id','role','tenant_id','typ'];
const trustedStatus=new Set(['UNKNOWN_WITH_SIGNED_MOCK_DIGEST',
 'UNKNOWN_WITHOUT_MOCK','CONFIRMED_HTTP_NOT_BILLING','CLAIMED_REMOTE_UNVERIFIED',
 'NO_VISIBLE_DISPATCH','AUTHORITY_NOT_VERIFIED']);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(o,expected)=>plain(o)&&Object.keys(o).sort().join('|')===expected.slice().sort().join('|');
const stop=reason=>Object.freeze({route:'STOP',reason,automatic_paid_retry:false,
 official_invoice_verified:false,clinical_go:false,real_supabase_auth_verified:false});
export function createIntegratedOfflineRecoveryG11({publicKey,clock,lookupAuthority,
 consumeDurableNonce,inspectReceipt}={}){
 if(publicKey?.type!=='public'||publicKey.asymmetricKeyType!=='ed25519'||
  [clock,lookupAuthority,consumeDurableNonce,inspectReceipt].some(x=>typeof x!=='function'))
  throw Error('G11_DEPENDENCIES_REQUIRED');
 return async (signed,requestId)=>{
  if(!uuid.test(requestId||'')||!exact(signed,['claims','signature'])||
   !exact(signed.claims,keys)||typeof signed.signature!=='string'||
   !/^[A-Za-z0-9_-]{80,100}$/.test(signed.signature))
   return stop('UNTRUSTED_ENVELOPE');
  const c=signed.claims,t=clock();
  if(!Number.isSafeInteger(t)||c.typ!=='nexa-g11-offline-operator'||
   c.issuer!=='disposable-independent-auth-fixture'||c.aud!=='nexa-g11-offline'||
   c.role!=='inspect_unknown_claim'||!uuid.test(c.operator_id||'')||
   !uuid.test(c.tenant_id||'')||!/^nexa_g8_tenant_[ab]$/.test(c.db_principal||'')||
   !Number.isSafeInteger(c.key_epoch)||c.key_epoch<1||
   !noncePattern.test(c.nonce||'')||!Number.isSafeInteger(c.not_before)||
   !Number.isSafeInteger(c.expires_at)||c.not_before>t||
   c.expires_at<=t||c.expires_at-c.not_before>120||c.not_before<t-120)
   return stop('CLAIMS_INVALID_OR_EXPIRED');
  let valid=false;
  try{valid=verify(null,Buffer.from(JSON.stringify(c)),publicKey,
   Buffer.from(signed.signature,'base64url'))}catch{}
  if(!valid)return stop('SIGNATURE_UNVERIFIED');
  let registry;
  try{registry=await lookupAuthority({tenantId:c.tenant_id,operatorId:c.operator_id});}
  catch{return stop('REGISTRY_UNAVAILABLE');}
  if(!plain(registry)||registry.source!=='disposable_private_registry'||
    registry.active!==true||registry.approver_active!==true||
    registry.tenant_id!==c.tenant_id||registry.operator_id!==c.operator_id||
    registry.db_principal!==c.db_principal||registry.key_epoch!==c.key_epoch)
   return stop('AUTHORITY_NOT_LINKED');
  let nonce;
  try{nonce=await consumeDurableNonce({tenantId:c.tenant_id,principal:c.db_principal,
    epoch:c.key_epoch,nonce:c.nonce,expiryISO:new Date(c.expires_at*1000).toISOString()});}
  catch{return stop('NONCE_DATABASE_UNAVAILABLE');}
  if(!plain(nonce)||nonce.accepted!==true||
   nonce.reason!=='CONSUMED_ONCE_OFFLINE'||nonce.automatic_paid_retry!==false)
   return stop('REPLAY_REVOKED_OR_NONCE_UNVERIFIED');
  // A crash after durable nonce consumption must NEVER replay a paid dispatch.
  // Instead, a fresh attestation/nonce can inspect the same stored claim.
  let receipt;
  try{receipt=await inspectReceipt({tenantId:c.tenant_id,
    principal:c.db_principal,requestId});}
  catch{return stop('CRASH_OR_RECEIPT_READ_UNAVAILABLE');}
  if(!plain(receipt)||!trustedStatus.has(receipt.status)||
    receipt.automatic_paid_retry!==false||
    receipt.official_provider_bill_verified!==false||
    receipt.provider_no_charge_proven!==false)
   return stop('RECEIPT_OUTCOME_UNTRUSTED');
  if(['AUTHORITY_NOT_VERIFIED','NO_VISIBLE_DISPATCH'].includes(receipt.status))
   return stop('RECEIPT_NOT_VISIBLE');
  return Object.freeze({route:'HUMAN_REVIEW_REQUIRED',
   outcome:receipt.status,automatic_paid_retry:false,
   official_invoice_verified:false,clinical_go:false,
   real_supabase_auth_verified:false,
   provider_charge_known:false});
 };
}

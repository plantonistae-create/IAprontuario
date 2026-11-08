// G9 OFFLINE ONLY. Ed25519 laboratory attestation, NOT Supabase auth/JWT.
// Keys generated in disposable tests. This module has no network or paid calls.
import {verify} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields=['aud','expires_at','issuer','key_id','nonce','not_before','operator_id','role','tenant_id','typ'];
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
const exact=(o,keys)=>plain(o)&&Object.keys(o).sort().join('|')===keys.slice().sort().join('|');
const stop=reason=>Object.freeze({authorized:false,reason,automatic_paid_retry:false,live_approved:false});
export function createOfflineOperatorBoundary({publicKey,now,lookupAuthority,consumeNonce}={}){
 if(publicKey?.type!=='public'||publicKey.asymmetricKeyType!=='ed25519'||
  typeof now!=='function'||typeof lookupAuthority!=='function'||typeof consumeNonce!=='function')
   throw Error('G9_TRUST_BOUNDARY_INVALID');
 return async proof=>{
  if(!exact(proof,['claims','signature'])||!exact(proof.claims,fields)||
   typeof proof.signature!=='string'||!/^[A-Za-z0-9_-]{80,100}$/.test(proof.signature))
    return stop('ENVELOPE_INVALID');
  const c=proof.claims,ts=now();
  if(c.typ!=='nexa-g9-admin-grant'||c.issuer!=='offline-authority-fixture'||
   c.aud!=='nexa-g9-lab'||c.key_id!=='ephemeral-ed25519'||
   c.role!=='reconcile_unknown'||!uuid.test(c.operator_id||'')||!uuid.test(c.tenant_id||'')||
   typeof c.nonce!=='string'||!/^[0-9a-f]{32}$/.test(c.nonce)||
   !Number.isSafeInteger(ts)||!Number.isSafeInteger(c.not_before)||
   !Number.isSafeInteger(c.expires_at)||
   c.not_before>ts||c.expires_at<=ts||
   c.expires_at-c.not_before>120||c.not_before<ts-120)
    return stop('CLAIMS_NOT_CURRENT_OR_TRUSTED');
  let authentic=false;
  try{authentic=verify(null,Buffer.from(JSON.stringify(c)),publicKey,
   Buffer.from(proof.signature,'base64url'))}catch{}
  if(!authentic)return stop('SIGNATURE_UNTRUSTED');
  let entry;
  try{entry=await lookupAuthority({operatorId:c.operator_id,tenantId:c.tenant_id});}
  catch{return stop('AUTHORITY_UNAVAILABLE');}
  if(!plain(entry)||entry.source!=='admin_registry'||entry.active!==true||
   entry.operator_id!==c.operator_id||entry.tenant_id!==c.tenant_id||
   entry.admin_authorized!==true)return stop('ADMIN_NOT_VERIFIED');
  try{if(await consumeNonce({tenantId:c.tenant_id,nonce:c.nonce})!==true)
   return stop('REPLAY_OR_NONCE_UNAVAILABLE');}
  catch{return stop('REPLAY_OR_NONCE_UNAVAILABLE');}
  return Object.freeze({authorized:true,reason:'OFFLINE_SIGNATURE_AND_REGISTRY_ACCEPTED',
   automatic_paid_retry:false,live_approved:false,
   trusted_operator_login_proven:false,provider_charge_verified:false});
 };
}

/* NEXA V5.14 (LAB-VALIDATED, NOT DEPLOYED) — client side of the authoritative ASSISTANCE authorization.
 * The browser never decides: it asks a configured server issuer, then re-verifies the decision and checks that the answer echoes
 * exactly this encounter and purpose. Checkbox/flags are only the physician's declaration (digest), recorded as EVIDENCE, never as the grant.
 * No transport configured (production today: no hosted issuer exists) => ensure() answers AUTHORITY_NOT_CONFIGURED and the caller keeps its hard STOP.
 * Assistance only: training/audit/Core export/external-AI egress are NOT requested, NOT granted and NOT implied by this module. */
(()=>{
'use strict';
if(window.nexaAssistAuthorityV514)return;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATEMENT='NEXA-ATTESTATION-ASSISTANCE-V1: o médico declara que o paciente foi informado sobre a gravação e o processamento assistencial deste atendimento.';
let transport=null,last={authorized:false,reason:'AUTHORITY_NOT_CONFIGURED'};
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const sha256=async t=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)));
const deny=(reason,extra)=>(last=Object.freeze({authorized:false,reason,...(extra||{})}));
function configure(t){
 if(t===null){transport=null;last={authorized:false,reason:'AUTHORITY_NOT_CONFIGURED'};return}
 if(!t||['attest','grant','verify'].some(k=>typeof t[k]!=='function'))throw new Error('AUTHORITY_TRANSPORT_INVALID');
 transport=t;
}
async function ensure({encounterId,purposes=['assistance','clinical_backup']}={}){
 if(!transport)return deny('AUTHORITY_NOT_CONFIGURED');
 if(typeof encounterId!=='string'||!UUID.test(encounterId))return deny('ENCOUNTER_INVALID');
 try{
  const digest=await sha256(STATEMENT+'|'+encounterId.toLowerCase());
  const ev=await transport.attest(encounterId,digest);
  if(!ev||ev.external_ai_authorized!==false)return deny('ATTESTATION_NOT_RECORDED');   // evidence must never claim authorization
  const g=await transport.grant(encounterId,'assistance');
  if(!g||g.authorized!==true)return deny((g&&typeof g.reason==='string'&&/^[A-Z_]{3,60}$/.test(g.reason))?g.reason:'GRANT_DENIED');
  const v=await transport.verify(encounterId,'assistance');   // independent second round trip
  const now=Date.parse(v&&v.server_now),end=Date.parse(v&&v.expires_at);
  if(!v||v.authorized!==true||v.purpose!=='assistance'||String(v.encounter_id).toLowerCase()!==encounterId.toLowerCase()||
     !UUID.test(String(v.grant_id))||v.grant_id!==g.grant_id||!Number.isFinite(now)||!Number.isFinite(end)||end<=now)return deny('GRANT_NOT_CONFIRMED');
  let backup=false;
  if(purposes.includes('clinical_backup')&&typeof transport.grant==='function'){
   try{const b=await transport.grant(encounterId,'clinical_backup');backup=!!(b&&b.authorized===true)}catch{backup=false}   // backup failure never blocks assistance
  }
  // The client keeps the SERVER's expiry. It never extends it and never trusts its own clock to decide validity.
  return (last=Object.freeze({authorized:true,reason:'OK',grantId:v.grant_id,encounterId:v.encounter_id,expiresAt:v.expires_at,serverNow:v.server_now,backupGrant:backup,externalAiAuthorized:false}));
 }catch(e){return deny('AUTHORITY_UNAVAILABLE')}   // network/server failure => no grant (fail closed)
}
function httpTransport({origin,getCredential}){
 const u=new URL(origin);
 const call=async(path,{method='GET',body}={})=>{
  const r=await fetch(new URL(path,u),{method,body:body?JSON.stringify(body):undefined,redirect:'error',cache:'no-store',credentials:'omit',
   headers:{Authorization:'Bearer '+await getCredential(),...(body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('AUTHORITY_HTTP_'+r.status);
  return r.json();
 };
 return{
  attest:(e,d)=>call('/authority/attest',{method:'POST',body:{encounter:e,statement_digest:d}}),
  grant:(e,p)=>call('/authority/grant',{method:'POST',body:{encounter:e,purpose:p}}),
  verify:(e,p)=>call('/authority/verify?encounter='+encodeURIComponent(e)+'&purpose='+encodeURIComponent(p)),
  backupSource:(e,s,r)=>call('/authority/backup-source',{method:'POST',body:{encounter:e,session:s,revision:r}}),
  revoke:(g,reason)=>call('/authority/revoke',{method:'POST',body:{grant:g,reason}})
 };
}
// Supabase transport (candidate SQL: supabase/proposals/V515/assist_authority.CANDIDATE.sql). Every call runs under the physician's own JWT; RPC errors throw (=> no grant, fail closed).
function supabaseTransport(client){
 const rpc=async(name,args)=>{const r=await client.rpc(name,args);if(r.error)throw new Error('AUTHORITY_RPC_'+String(r.error.code||'ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,20));return Array.isArray(r.data)?r.data[0]:r.data};
 return{attest:(e,d)=>rpc('nexa_assist_attest',{p_encounter:e,p_statement_digest:d}),grant:(e,p)=>rpc('nexa_assist_issue',{p_encounter:e,p_purpose:p}),verify:(e,p)=>rpc('nexa_assist_verify',{p_encounter:e,p_purpose:p}),revoke:(g,r)=>rpc('nexa_assist_revoke',{p_grant:g,p_reason:r})};
}
window.nexaAssistAuthorityV514=Object.freeze({configure,configured:()=>!!transport,ensure,last:()=>last,httpTransport,supabaseTransport,STATEMENT,
 transport:()=>transport,mode:'lab_validated_not_deployed',externalAiAuthorized:false,trainingAuthorized:false});
})();

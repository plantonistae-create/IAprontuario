import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyExternalIssuerReceiptJws } from "../_shared/nexa-external-issuer-receipt.mjs";

const env=(name:string)=>Deno.env.get(name)||'';
const url=env('SUPABASE_URL');
const serviceKey=env('SUPABASE_SERVICE_ROLE_KEY');
const trustedKeys=env('NEXA_TRUSTED_EXTERNAL_ISSUER_KEYS');
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});
function equalSecret(a:string,b:string){
 if(!a||!b||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
serve(async(req)=>{
 if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
 if(!equalSecret(req.headers.get('apikey')||'',serviceKey))return json(401,{error:'UNAUTHORIZED'});
 if(!trustedKeys)return json(503,{error:'TRUST_NOT_CONFIGURED'});
 let body:unknown;
 try{
  if(Number(req.headers.get('content-length')||0)>20000)return json(413,{error:'PAYLOAD_TOO_LARGE'});
  body=JSON.parse(await req.text());
 }catch{return json(400,{error:'INVALID_PAYLOAD'})}
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).length!==1||typeof (body as {receipt?:unknown}).receipt!=='string')
  return json(400,{error:'INVALID_PAYLOAD'});
 let verified;
 try{
  const blocked=new Set(env('NEXA_BLOCKED_EXTERNAL_ISSUER_KIDS').split(',').map(x=>x.trim()).filter(Boolean));
  const allowed=(JSON.parse(trustedKeys) as Array<{kid:string}>).filter(entry=>!blocked.has(entry.kid));
  verified=await verifyExternalIssuerReceiptJws((body as {receipt:string}).receipt,{trustedKeys:allowed});
 }catch{return json(422,{error:'RECEIPT_VERIFICATION_FAILED'})}
 const p_receipt={
  evidence_id:verified.evidenceId,previous_receipt_sha256:verified.previousReceiptSha256,
  sequence_no:verified.sequenceNo,event_kind:verified.eventKind,
  issuer_identity:verified.issuerIdentity,
  independent_verifier_identity:verified.independentVerifierIdentity,
  verifier_key_id:verified.verifierKeyId,signing_algorithm:verified.signingAlgorithm,
  verification_method:verified.verificationMethod,external_event_id:verified.externalEventId,
  document_sha256:verified.documentSha256,
  source_reference_sha256:verified.sourceReferenceSha256,
  proof_reference_sha256:verified.proofReferenceSha256,
  signed_payload_sha256:verified.signedPayloadSha256,compact_jws_sha256:verified.compactJwsSha256,
  assertion_issued_at:verified.assertionIssuedAt,
  assertion_expires_at:verified.assertionExpiresAt,
  externally_verified_at:verified.externallyVerifiedAt
 };
 const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
 const {data,error}=await admin.rpc('nexa_ingest_verified_external_receipt',{p_receipt});
 if(error){console.error('NEXA_ISSUER_PERSISTENCE',String(error.code||'UNKNOWN').slice(0,12));
  return json(error.code==='23505'||error.code==='23514'?409:500,{error:'RECEIPT_PERSISTENCE_FAILED'});}
 return json(200,{ok:true,receipt_id:data,event_kind:verified.eventKind,sequence_no:verified.sequenceNo});
});

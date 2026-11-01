import test from "node:test";
import assert from "node:assert/strict";
import {
  ExternalIssuerReceiptError,
  parseTrustedExternalIssuerKeys,
  verifyExternalIssuerReceiptJws
} from "../supabase/functions/_shared/nexa-external-issuer-receipt.mjs";

const NOW=1793509200;
const ISSUER="https://synthetic-verifier.invalid";
const AUDIENCE="nexa-synthetic-receipt-test";
const encoder=new TextEncoder();

function base64url(value){
  const bytes=typeof value==="string"?encoder.encode(value):value;
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}

async function fixture(){
  const keys=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
  const jwk=await crypto.subtle.exportKey("jwk",keys.publicKey);
  const trustedKeys=[{
    issuer:ISSUER,audience:AUDIENCE,verifier_identity:"synthetic-independent-verifier",
    kid:"synthetic-key-1",alg:"ES256",jwk
  }];
  const payload={
    iss:ISSUER,aud:AUDIENCE,iat:NOW-5,nbf:NOW-5,exp:NOW+120,jti:"synthetic-event-1",
    evidence_id:"11111111-1111-4111-8111-111111111111",event_kind:"verified",sequence_no:1,
    previous_receipt_sha256:null,issuer_identity:"synthetic-document-issuer",
    document_sha256:"1".repeat(64),verification_method:"digital_signature",
    source_reference_sha256:"2".repeat(64),proof_reference_sha256:"3".repeat(64),
    externally_verified_at:NOW-10
  };
  return {keys,trustedKeys,payload};
}

async function sign(payload,privateKey,header={alg:"ES256",kid:"synthetic-key-1",typ:"NEXA-EXTERNAL-ISSUER-RECEIPT+JWT"}){
  const encodedHeader=base64url(JSON.stringify(header));
  const encodedPayload=base64url(JSON.stringify(payload));
  const input=`${encodedHeader}.${encodedPayload}`;
  const signature=new Uint8Array(await crypto.subtle.sign(
    {name:"ECDSA",hash:"SHA-256"},privateKey,encoder.encode(input)
  ));
  return `${input}.${base64url(signature)}`;
}

async function rejected(code,operation){
  await assert.rejects(operation,error=>
    error instanceof ExternalIssuerReceiptError&&error.code===code);
}

test("pinned ES256 receipt verifies and returns only persistence-safe metadata",async()=>{
  const {keys,trustedKeys,payload}=await fixture();
  const compact=await sign(payload,keys.privateKey);
  const receipt=await verifyExternalIssuerReceiptJws(compact,{trustedKeys,nowEpochSeconds:NOW});
  assert.equal(receipt.contractVersion,"nexa-external-issuer-receipt-v1");
  assert.equal(receipt.independentVerifierIdentity,"synthetic-independent-verifier");
  assert.equal(receipt.eventKind,"verified");
  assert.equal(receipt.sequenceNo,1);
  assert.equal(receipt.documentSha256,"1".repeat(64));
  assert.match(receipt.signedPayloadSha256,/^[a-f0-9]{64}$/);
  assert.match(receipt.compactJwsSha256,/^[a-f0-9]{64}$/);
  assert.equal("compactJws" in receipt,false);
  assert.equal("sourceReference" in receipt,false);
  assert.equal("proofReference" in receipt,false);
});

test("payload tampering and unknown verifier keys fail closed",async()=>{
  const {keys,trustedKeys,payload}=await fixture();
  const compact=await sign(payload,keys.privateKey);
  const parts=compact.split(".");
  const tampered={...payload,document_sha256:"9".repeat(64)};
  await rejected("RECEIPT_SIGNATURE_INVALID",()=>verifyExternalIssuerReceiptJws(
    `${parts[0]}.${base64url(JSON.stringify(tampered))}.${parts[2]}`,
    {trustedKeys,nowEpochSeconds:NOW}
  ));
  const wrongKey=structuredClone(trustedKeys);
  wrongKey[0].kid="other-key";
  wrongKey[0].jwk.kid="other-key";
  await rejected("RECEIPT_TRUST_MISMATCH",()=>verifyExternalIssuerReceiptJws(
    compact,{trustedKeys:wrongKey,nowEpochSeconds:NOW}
  ));
});

test("strict claims reject free text, expired assertions and wrong audience",async()=>{
  const {keys,trustedKeys,payload}=await fixture();
  await rejected("RECEIPT_CLAIMS_INVALID",async()=>verifyExternalIssuerReceiptJws(
    await sign({...payload,patient_name:"must-not-enter-receipt"},keys.privateKey),
    {trustedKeys,nowEpochSeconds:NOW}
  ));
  await rejected("RECEIPT_TIME_INVALID",async()=>verifyExternalIssuerReceiptJws(
    await sign({...payload,iat:NOW-400,nbf:NOW-400,exp:NOW-100},keys.privateKey),
    {trustedKeys,nowEpochSeconds:NOW}
  ));
  await rejected("RECEIPT_TRUST_MISMATCH",async()=>verifyExternalIssuerReceiptJws(
    await sign({...payload,aud:"other-audience"},keys.privateKey),
    {trustedKeys,nowEpochSeconds:NOW}
  ));
});

test("receipt chain requires a verified root and a bound previous digest",async()=>{
  const {keys,trustedKeys,payload}=await fixture();
  await rejected("RECEIPT_CHAIN_INVALID",async()=>verifyExternalIssuerReceiptJws(
    await sign({...payload,event_kind:"contested"},keys.privateKey),
    {trustedKeys,nowEpochSeconds:NOW}
  ));
  await rejected("RECEIPT_CHAIN_INVALID",async()=>verifyExternalIssuerReceiptJws(
    await sign({...payload,sequence_no:2,previous_receipt_sha256:null},keys.privateKey),
    {trustedKeys,nowEpochSeconds:NOW}
  ));
  const chained={...payload,jti:"synthetic-event-2",event_kind:"revoked",sequence_no:2,
    previous_receipt_sha256:"4".repeat(64)};
  const receipt=await verifyExternalIssuerReceiptJws(await sign(chained,keys.privateKey),{
    trustedKeys,nowEpochSeconds:NOW
  });
  assert.equal(receipt.eventKind,"revoked");
  assert.equal(receipt.previousReceiptSha256,"4".repeat(64));
});

test("trust configuration rejects private key material and duplicate identities",async()=>{
  const {trustedKeys}=await fixture();
  const withPrivate=structuredClone(trustedKeys);
  withPrivate[0].jwk.d="secret-material";
  assert.throws(()=>parseTrustedExternalIssuerKeys(withPrivate),error=>
    error instanceof ExternalIssuerReceiptError&&error.code==="TRUST_CONFIGURATION_INVALID");
  assert.throws(()=>parseTrustedExternalIssuerKeys([...trustedKeys,...trustedKeys]),error=>
    error instanceof ExternalIssuerReceiptError&&error.code==="TRUST_CONFIGURATION_INVALID");
});

const encoder=new TextEncoder();
const decoder=new TextDecoder("utf-8",{fatal:true});
const SHA256=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const METHODS=new Set(["digital_signature","issuer_api","issuer_confirmation","institutional_registry"]);
const EVENTS=new Set(["verified","revoked","contested"]);
const HEADER_KEYS=new Set(["alg","kid","typ"]);
const PAYLOAD_KEYS=new Set([
  "iss","aud","iat","nbf","exp","jti","evidence_id","event_kind","sequence_no",
  "previous_receipt_sha256","issuer_identity","document_sha256","verification_method",
  "source_reference_sha256","proof_reference_sha256","externally_verified_at"
]);
const TRUST_KEYS=new Set(["issuer","audience","verifier_identity","kid","alg","jwk"]);
const JWK_KEYS=new Set(["kty","crv","x","y","use","key_ops","alg","kid","ext"]);

export const EXTERNAL_ISSUER_RECEIPT_CONTRACT="nexa-external-issuer-receipt-v1";

export class ExternalIssuerReceiptError extends Error{
  constructor(code){super(code);this.name="ExternalIssuerReceiptError";this.code=code}
}

function fail(code){throw new ExternalIssuerReceiptError(code)}
function plain(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function exactKeys(value,allowed,code){
  if(!plain(value))fail(code);
  for(const key of Object.keys(value))if(!allowed.has(key))fail(code);
}
function bounded(value,max,code){
  if(typeof value!=="string")fail(code);
  const clean=value.trim();
  if(!clean||clean.length>max)fail(code);
  return clean;
}
function integer(value,code){if(!Number.isSafeInteger(value))fail(code);return value}

function decodeBase64Url(value,code){
  if(typeof value!=="string"||!value||!/^[A-Za-z0-9_-]+$/.test(value))fail(code);
  const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);
  try{
    const binary=atob(padded),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return bytes;
  }catch{fail(code)}
}

function parsePart(value,code){
  try{
    const parsed=JSON.parse(decoder.decode(decodeBase64Url(value,code)));
    if(!plain(parsed))fail(code);
    return parsed;
  }catch(error){
    if(error instanceof ExternalIssuerReceiptError)throw error;
    fail(code);
  }
}

async function sha256Hex(value){
  const bytes=typeof value==="string"?encoder.encode(value):value;
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  return Array.from(digest,byte=>byte.toString(16).padStart(2,"0")).join("");
}

function validateTrustEntry(entry){
  exactKeys(entry,TRUST_KEYS,"TRUST_CONFIGURATION_INVALID");
  const issuer=bounded(entry.issuer,500,"TRUST_CONFIGURATION_INVALID");
  const audience=bounded(entry.audience,500,"TRUST_CONFIGURATION_INVALID");
  const verifierIdentity=bounded(entry.verifier_identity,500,"TRUST_CONFIGURATION_INVALID");
  const kid=bounded(entry.kid,200,"TRUST_CONFIGURATION_INVALID");
  if(entry.alg!=="ES256")fail("TRUST_CONFIGURATION_INVALID");
  exactKeys(entry.jwk,JWK_KEYS,"TRUST_CONFIGURATION_INVALID");
  if(entry.jwk.d!==undefined||entry.jwk.k!==undefined)fail("TRUST_CONFIGURATION_INVALID");
  if(entry.jwk.kty!=="EC"||entry.jwk.crv!=="P-256")fail("TRUST_CONFIGURATION_INVALID");
  bounded(entry.jwk.x,200,"TRUST_CONFIGURATION_INVALID");
  bounded(entry.jwk.y,200,"TRUST_CONFIGURATION_INVALID");
  if(entry.jwk.alg!==undefined&&entry.jwk.alg!=="ES256")fail("TRUST_CONFIGURATION_INVALID");
  if(entry.jwk.kid!==undefined&&entry.jwk.kid!==kid)fail("TRUST_CONFIGURATION_INVALID");
  if(entry.jwk.use!==undefined&&entry.jwk.use!=="sig")fail("TRUST_CONFIGURATION_INVALID");
  if(entry.jwk.ext!==undefined&&entry.jwk.ext!==true)fail("TRUST_CONFIGURATION_INVALID");
  if(entry.jwk.key_ops!==undefined&&
     (!Array.isArray(entry.jwk.key_ops)||!entry.jwk.key_ops.includes("verify")||entry.jwk.key_ops.includes("sign")))
    fail("TRUST_CONFIGURATION_INVALID");
  return Object.freeze({issuer,audience,verifierIdentity,kid,alg:"ES256",jwk:{...entry.jwk}});
}

export function parseTrustedExternalIssuerKeys(raw){
  let value=raw;
  if(typeof raw==="string"){
    if(raw.length>65536)fail("TRUST_CONFIGURATION_INVALID");
    try{value=JSON.parse(raw)}catch{fail("TRUST_CONFIGURATION_INVALID")}
  }
  if(!Array.isArray(value)||value.length<1||value.length>32)fail("TRUST_CONFIGURATION_INVALID");
  const entries=value.map(validateTrustEntry),seen=new Set();
  for(const entry of entries){
    const identity=`${entry.issuer}\u0000${entry.audience}\u0000${entry.kid}`;
    if(seen.has(identity))fail("TRUST_CONFIGURATION_INVALID");
    seen.add(identity);
  }
  return Object.freeze(entries);
}

function validatePayload(payload,trust,now,clockSkewSeconds){
  exactKeys(payload,PAYLOAD_KEYS,"RECEIPT_CLAIMS_INVALID");
  if(payload.iss!==trust.issuer||payload.aud!==trust.audience)fail("RECEIPT_TRUST_MISMATCH");
  const iat=integer(payload.iat,"RECEIPT_TIME_INVALID");
  const nbf=integer(payload.nbf,"RECEIPT_TIME_INVALID");
  const exp=integer(payload.exp,"RECEIPT_TIME_INVALID");
  const externallyVerifiedAt=integer(payload.externally_verified_at,"RECEIPT_TIME_INVALID");
  if(exp<=iat||exp-iat>300||iat>now+clockSkewSeconds||nbf>now+clockSkewSeconds||
     exp<now-clockSkewSeconds||externallyVerifiedAt>iat+clockSkewSeconds)
    fail("RECEIPT_TIME_INVALID");

  const sequenceNo=integer(payload.sequence_no,"RECEIPT_CHAIN_INVALID");
  if(sequenceNo<1||!EVENTS.has(payload.event_kind))fail("RECEIPT_CHAIN_INVALID");
  const previous=payload.previous_receipt_sha256;
  if(sequenceNo===1){
    if(payload.event_kind!=="verified"||previous!==null)fail("RECEIPT_CHAIN_INVALID");
  }else if(typeof previous!=="string"||!SHA256.test(previous))fail("RECEIPT_CHAIN_INVALID");

  if(typeof payload.evidence_id!=="string"||!UUID.test(payload.evidence_id))fail("RECEIPT_CLAIMS_INVALID");
  if(!METHODS.has(payload.verification_method))fail("RECEIPT_CLAIMS_INVALID");
  for(const key of ["document_sha256","source_reference_sha256","proof_reference_sha256"])
    if(typeof payload[key]!=="string"||!SHA256.test(payload[key]))fail("RECEIPT_CLAIMS_INVALID");

  return Object.freeze({
    contractVersion:EXTERNAL_ISSUER_RECEIPT_CONTRACT,
    evidenceId:payload.evidence_id,
    eventKind:payload.event_kind,
    sequenceNo,
    previousReceiptSha256:previous,
    issuerIdentity:bounded(payload.issuer_identity,500,"RECEIPT_CLAIMS_INVALID"),
    independentVerifierIdentity:trust.verifierIdentity,
    verifierKeyId:trust.kid,
    signingAlgorithm:"ES256",
    verificationMethod:payload.verification_method,
    externalEventId:bounded(payload.jti,500,"RECEIPT_CLAIMS_INVALID"),
    documentSha256:payload.document_sha256,
    sourceReferenceSha256:payload.source_reference_sha256,
    proofReferenceSha256:payload.proof_reference_sha256,
    assertionIssuedAt:iat,
    assertionExpiresAt:exp,
    externallyVerifiedAt
  });
}

export async function verifyExternalIssuerReceiptJws(compactJws,{trustedKeys,nowEpochSeconds,clockSkewSeconds=30}={}){
  if(typeof compactJws!=="string"||compactJws.length<20||compactJws.length>16384)
    fail("RECEIPT_FORMAT_INVALID");
  if(!Number.isSafeInteger(clockSkewSeconds)||clockSkewSeconds<0||clockSkewSeconds>120)
    fail("RECEIPT_TIME_INVALID");
  const parts=compactJws.split(".");
  if(parts.length!==3)fail("RECEIPT_FORMAT_INVALID");
  const [encodedHeader,encodedPayload,encodedSignature]=parts;
  const header=parsePart(encodedHeader,"RECEIPT_HEADER_INVALID");
  exactKeys(header,HEADER_KEYS,"RECEIPT_HEADER_INVALID");
  if(header.alg!=="ES256"||header.typ!=="NEXA-EXTERNAL-ISSUER-RECEIPT+JWT")
    fail("RECEIPT_HEADER_INVALID");
  const kid=bounded(header.kid,200,"RECEIPT_HEADER_INVALID");
  const payload=parsePart(encodedPayload,"RECEIPT_CLAIMS_INVALID");
  const trust=parseTrustedExternalIssuerKeys(trustedKeys).find(entry=>
    entry.issuer===payload.iss&&entry.audience===payload.aud&&entry.kid===kid&&entry.alg===header.alg);
  if(!trust)fail("RECEIPT_TRUST_MISMATCH");

  let key;
  try{
    key=await crypto.subtle.importKey("jwk",trust.jwk,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
  }catch{fail("TRUST_CONFIGURATION_INVALID")}
  const signature=decodeBase64Url(encodedSignature,"RECEIPT_SIGNATURE_INVALID");
  let valid=false;
  try{
    valid=await crypto.subtle.verify(
      {name:"ECDSA",hash:"SHA-256"},key,signature,encoder.encode(`${encodedHeader}.${encodedPayload}`)
    );
  }catch{valid=false}
  if(!valid)fail("RECEIPT_SIGNATURE_INVALID");

  const now=nowEpochSeconds===undefined?Math.floor(Date.now()/1000):integer(nowEpochSeconds,"RECEIPT_TIME_INVALID");
  const receipt=validatePayload(payload,trust,now,clockSkewSeconds);
  return Object.freeze({
    ...receipt,
    signedPayloadSha256:await sha256Hex(decodeBase64Url(encodedPayload,"RECEIPT_CLAIMS_INVALID")),
    compactJwsSha256:await sha256Hex(compactJws)
  });
}

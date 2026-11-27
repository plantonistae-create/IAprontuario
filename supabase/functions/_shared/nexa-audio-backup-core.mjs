// V5.23 CANDIDATE (NOT DEPLOYED). Envelope codec + trusted backup service, taken verbatim from the lab-validated V5.13 modules (labs/nexa-audio-backup/*.NOT-DEPLOYED.mjs).
// Trusted caller MUST establish identity, active clinical access and source authorization independently (see nexa-audio-backup-handler.mjs).
import { Buffer } from 'node:buffer';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Error(code)};
function binding(scope){
 const {ownerId,encounterId,sessionId,sequence,sourceVersion}=scope||{};
 if(![ownerId,encounterId,sessionId].every(x=>typeof x==='string'&&uuid.test(x))||!Number.isSafeInteger(sequence)||sequence<0||sequence>7200||!Number.isSafeInteger(sourceVersion)||sourceVersion<1)fail('INVALID_BACKUP_SCOPE');
 return JSON.stringify(['nexa-backup-v1',ownerId,encounterId,sessionId,sequence,sourceVersion]);
}
function encrypt(key,bytes,aad){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(aad));
 const ciphertext=Buffer.concat([c.update(bytes),c.final()]);
 return {iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
function decrypt(key,record,aad){
 const d=createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));d.setAAD(Buffer.from(aad));d.setAuthTag(Buffer.from(record.tag,'base64'));
 return Buffer.concat([d.update(Buffer.from(record.ciphertext,'base64')),d.final()]);
}
// Trusted caller MUST establish identity, active clinical access and source ownership independently.
// The custody adapter must use an external KMS, not a key from a browser or a password.
export function createEnvelopeCodec({custody}){
 if(typeof custody?.wrap!=='function'||typeof custody?.unwrap!=='function')fail('CUSTODY_REQUIRED');
 return Object.freeze({
  async seal(scope,bytes){
   const aad=binding(scope);
   if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>32*1024*1024)fail('INVALID_CHUNK');
   const key=randomBytes(32);
   try{
    const encrypted=encrypt(key,bytes,aad);
    const wrapped=await custody.wrap({aad,key});
    if(!wrapped||typeof wrapped.keyId!=='string'||!wrapped.keyId||typeof wrapped.blob!=='string'||!wrapped.blob)fail('CUSTODY_WRAP_FAILED');
    return {schema:'nexa-backup-v1',...encrypted,wrapped,sha256:hash(bytes),size:bytes.length};
   }finally{key.fill(0)}
  },
  async open(scope,record){
   const aad=binding(scope);
   if(record?.schema!=='nexa-backup-v1'||!Number.isSafeInteger(record.size)||record.size<1||record.size>32*1024*1024||typeof record.ciphertext!=='string'||record.ciphertext.length>Math.ceil(record.size/3)*4||typeof record.sha256!=='string'||!/^[a-f0-9]{64}$/.test(record.sha256))fail('INVALID_ENVELOPE');
   const key=await custody.unwrap({aad,wrapped:record.wrapped});
   if(!Buffer.isBuffer(key)||key.length!==32)fail('CUSTODY_UNWRAP_FAILED');
   try{
    const bytes=decrypt(key,record,aad);
    if(bytes.length!==record.size||hash(bytes)!==record.sha256)fail('BACKUP_READBACK_MISMATCH');
    return bytes;
   }finally{key.fill(0)}
  }
 });
}

// ---- service ----
const digest=hash;
const idRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function createBackupService({authenticate,authorizeSource,codec,store}){
 if(![authenticate,authorizeSource,codec?.seal,codec?.open,store?.read,store?.insertIfAbsent].every(f=>typeof f==='function'))fail('BACKUP_TRUSTED_ADAPTERS_REQUIRED');
 async function authorize(credential,request){
  const actor=await authenticate(credential);
  if(!actor||typeof actor.ownerId!=='string'||!idRe.test(actor.ownerId)||actor.activeClinicalAccess!==true)fail('BACKUP_ACCESS_DENIED');
  const {encounterId,sessionId,sequence,sourceVersion}=request||{};
  if(![encounterId,sessionId].every(x=>typeof x==='string'&&idRe.test(x))||!Number.isSafeInteger(sequence)||sequence<0||sequence>7200||!Number.isSafeInteger(sourceVersion)||sourceVersion<1)fail('BACKUP_REQUEST_INVALID');
  const scope={ownerId:actor.ownerId,encounterId,sessionId,sequence,sourceVersion};
  if(await authorizeSource({actor,scope,purpose:'clinical_backup'})!==true)fail('BACKUP_ACCESS_DENIED');
  return scope;
 }
 const key=s=>JSON.stringify([s.ownerId,s.encounterId,s.sessionId,s.sequence,s.sourceVersion]);
 async function reauthorize(credential,request,scope){if(key(await authorize(credential,request))!==key(scope))fail('BACKUP_IDENTITY_CHANGED')}
 return Object.freeze({
  async upload(credential,request,bytes){
   const scope=await authorize(credential,request);
   if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>32*1024*1024)fail('INVALID_CHUNK');
   const copy=Buffer.from(bytes),expected=digest(copy),k=key(scope);
   let prior=await store.read(k),inserted=false;
   if(!prior){
    const sealed=await codec.seal(scope,copy);
    await reauthorize(credential,request,scope);
    inserted=await store.insertIfAbsent(k,sealed);
    prior=await store.read(k);
   }
   if(!prior)fail('BACKUP_READBACK_MISSING');
   const restored=await codec.open(scope,prior);
   if(digest(restored)!==expected)fail('BACKUP_SEQUENCE_CONFLICT');
   await reauthorize(credential,request,scope);
   return {readback:true,duplicate:!inserted,sha256:expected,sourceVersion:scope.sourceVersion,trainingAuthorized:false};
  },
  async recover(credential,request){
   const scope=await authorize(credential,request),record=await store.read(key(scope));
   if(!record)fail('BACKUP_NOT_FOUND');
   const bytes=await codec.open(scope,record);
   await reauthorize(credential,request,scope);
   return bytes;
  }
 });
}

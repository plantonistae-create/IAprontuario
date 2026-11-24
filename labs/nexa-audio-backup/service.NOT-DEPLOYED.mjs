// LAB candidate: trusted server adapters only; not an HTTP endpoint or an authorization source.
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function fail(code){throw Error(code)}
export function createBackupService({authenticate,authorizeSource,codec,store}){
 if(![authenticate,authorizeSource,codec?.seal,codec?.open,store?.read,store?.insertIfAbsent].every(f=>typeof f==='function'))fail('BACKUP_TRUSTED_ADAPTERS_REQUIRED');
 async function authorize(credential,request){
  const actor=await authenticate(credential);
  if(!actor||typeof actor.ownerId!=='string'||!id.test(actor.ownerId)||actor.activeClinicalAccess!==true)fail('BACKUP_ACCESS_DENIED');
  const {encounterId,sessionId,sequence,sourceVersion}=request||{};
  if(![encounterId,sessionId].every(x=>typeof x==='string'&&id.test(x))||!Number.isSafeInteger(sequence)||sequence<0||sequence>7200||!Number.isSafeInteger(sourceVersion)||sourceVersion<1)fail('BACKUP_REQUEST_INVALID');
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

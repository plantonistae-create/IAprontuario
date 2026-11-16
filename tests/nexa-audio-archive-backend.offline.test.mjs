import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ARCHIVE_BUCKET,MAX_AUDIO_BYTES,ArchiveError,archivePaths,executeAudioArchive,parseArchiveRequest} from '../supabase/functions/_shared/nexa-audio-archive-contract.mjs';

const doctor='11111111-1111-4111-8111-111111111111';
const doctorB='22222222-2222-4222-8222-222222222222';
const encounter='33333333-3333-4333-8333-333333333333';
const grantId='44444444-4444-4444-8444-444444444444';
const action='55555555-5555-4555-8555-555555555555';
const bytes=Buffer.from('synthetic-audio-only');
const digest=createHash('sha256').update(bytes).digest('hex');
const request={action:'prepare',encounter_id:encounter,retention_grant_id:grantId,
  client_action_id:action,sha256:digest,size_bytes:bytes.length,mime_type:'audio/webm'};
const hashBlob=async blob=>({sha256:createHash('sha256').update(blob).digest('hex'),size_bytes:blob.length});
const rights={active:true,owner_user_id:doctor,encounter_id:encounter,grant_id:grantId,
  purpose:'clinical_audio_retention',server_verified:true};
function fixture(){
  const objects=new Map();let uploadCalls=0;
  const storage={
    async list(dir){return [...objects.keys()].filter(k=>k.startsWith(dir+'/')).map(k=>({name:k.slice(dir.length+1)}));},
    async createSignedUploadUrl(path){uploadCalls++;return{token:'synthetic-signature-for-test'};},
    async download(path){return objects.get(path)??null;},
    async createSignedDownloadUrl(path,ttl){return{url:'https://storage.invalid/signed/'+path,ttl};}
  };
  const call=async(extra={})=>executeAudioArchive({actor:doctor,
    source:{user_id:doctor,encounter_id:encounter},grant:rights,bucket:{id:ARCHIVE_BUCKET,public:false,file_size_limit:MAX_AUDIO_BYTES,allowed_mime_types:['audio/webm','audio/ogg','audio/mp4','audio/wav','audio/x-wav']},
    storage,hashBlob,...extra,request:{...request,...(extra.request||{})}});
  return {call,objects,get uploadCalls(){return uploadCalls;}};
}
async function rejected(promise,code){
  await assert.rejects(promise,error=>error instanceof ArchiveError&&error.code===code);
}
test('prepares a private, consent-gated upload without falsely claiming archive',async()=>{
 const f=fixture(),r=await f.call();assert.equal(r.status,200);assert.equal(r.body.archived,false);
 assert.equal(r.body.consent_for_training,false);assert.equal(f.objects.size,0);
 assert.equal(r.body.method,'signed_upload');assert.equal(r.body.max_bytes,MAX_AUDIO_BYTES);
 assert.match(r.body.upload_path,/^11111111-.*\.webm$/);
});
test('confirms persisted bytes by independent server-side readback and stable retry',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 const r=await f.call({request:{action:'confirm'}});assert.equal(r.body.archived,true);
 assert.equal(r.body.sha256,digest);assert.equal(r.body.server_readback_verified,true);
 const retry=await f.call({request:{action:'confirm'}});assert.deepEqual(r.body,retry.body);
 assert.equal(f.uploadCalls,1);
});
test('retrieval rechecks owner, grant, checksum and gives short-lived signed link',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 const r=await f.call({request:{action:'retrieve'}});assert.equal(r.body.expires_in_seconds,60);
 assert.equal(r.body.training_approved,false);assert.match(r.body.signed_url,/storage.invalid/);
});
test('missing, revoked, wrong-purpose or unverified grant cannot upload',async()=>{
 const f=fixture();
 for(const g of [null,{...rights,active:false},{...rights,purpose:'audio_transcription'},{...rights,server_verified:false}]){
  await rejected(f.call({grant:g}),'RETENTION_GRANT_NOT_VERIFIED');
 }assert.equal(f.uploadCalls,0);
});
test('different doctor or forged source cannot access same encounter',async()=>{
 const f=fixture();
 await rejected(f.call({actor:doctorB}),'SOURCE_NOT_OWNED_OR_UNAVAILABLE');
 await rejected(f.call({source:{user_id:doctorB,encounter_id:encounter}}),'SOURCE_NOT_OWNED_OR_UNAVAILABLE');
});
test('no public or misconfigured storage bucket',async()=>{
 const f=fixture();await rejected(f.call({bucket:{id:ARCHIVE_BUCKET,public:true}}),'PRIVATE_BUCKET_NOT_PROVEN');
 await rejected(f.call({bucket:null}),'PRIVATE_BUCKET_NOT_PROVEN');
});
test('rejects forged digest, size, MIME and unsafe identifiers',()=>{
 assert.throws(()=>parseArchiveRequest({...request,sha256:'a'.repeat(63)}),/INVALID_SHA256/);
 assert.throws(()=>parseArchiveRequest({...request,size_bytes:-1}),/INVALID_AUDIO_SIZE/);
 assert.throws(()=>parseArchiveRequest({...request,mime_type:'application/json'}),/INVALID_AUDIO_TYPE/);
 assert.throws(()=>parseArchiveRequest({...request,encounter_id:'../other'}),/INVALID_IDENTIFIER/);
});
test('no confirmation before upload and never confirm corrupt bytes',async()=>{
 const f=fixture();await rejected(f.call({request:{action:'confirm'}}),'AUDIO_NOT_UPLOADED');
 const p=await f.call();f.objects.set(p.body.upload_path,Buffer.from('corrupt'));
 await rejected(f.call({request:{action:'confirm'}}),'AUDIO_INTEGRITY_MISMATCH');
});
test('same action ID cannot be repurposed to a different object',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 const wrong=createHash('sha256').update('different').digest('hex');
 await rejected(f.call({request:{sha256:wrong}}),'ACTION_ID_CONFLICT');
});
test('duplicate action race is fail-closed after both files land',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 f.objects.set(p.body.upload_path.replace(digest,'a'.repeat(64)),bytes);
 await rejected(f.call({request:{action:'confirm'}}),'ACTION_ID_CONFLICT');
});
test('storage errors propagate as fail-closed, not success',async()=>{
 const f=fixture();await rejected(f.call({storage:{list:async()=>null}}),'STORAGE_LIST_UNAVAILABLE');
});
test('signed uploads are denied unless the bucket constrains MIME and size',async()=>{
 const f=fixture();
 const base={id:ARCHIVE_BUCKET,public:false,file_size_limit:MAX_AUDIO_BYTES,
   allowed_mime_types:['audio/webm']};
 for(const b of [{...base,allowed_mime_types:null},{...base,allowed_mime_types:[]},
    {...base,allowed_mime_types:['image/png']},{...base,file_size_limit:null},
    {...base,file_size_limit:MAX_AUDIO_BYTES+1}]){
   await rejected(f.call({bucket:b}),'BUCKET_RESTRICTIONS_NOT_PROVEN');
 }
 assert.equal(f.uploadCalls,0);
});
test('audio exceeding the bucket-specific cap is rejected before issuing token',async()=>{
 const f=fixture();
 await rejected(f.call({bucket:{id:ARCHIVE_BUCKET,public:false,
   allowed_mime_types:['audio/webm'],file_size_limit:bytes.length-1}}),
   'AUDIO_TOO_LARGE_FOR_BUCKET');
 assert.equal(f.uploadCalls,0);
});

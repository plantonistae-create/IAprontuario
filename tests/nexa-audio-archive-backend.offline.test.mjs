import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  purpose:'clinical_audio_retention',server_verified:true,revoked_at:null,
  policy_version:'clinical-audio-v1',expires_at:'2099-01-01T00:00:00.000Z'};
function fixture(){
  const objects=new Map(),receipts=new Map();
  const receiptStore={
    async commitVerified(fields){
      const existing=receipts.get(fields.client_action_id);
      if(existing)return existing;
      const committed={...fields,receipt_id:'66666666-6666-4666-8666-666666666666',
        purpose:'clinical_audio_retention',committed_at:'2026-11-16T14:00:00.000Z'};
      receipts.set(fields.client_action_id,committed);return committed;
    },
    async readCommitted(fields){return receipts.get(fields.client_action_id)||null}
  };
  const storage={
    async list(dir){return [...objects.keys()].filter(k=>k.startsWith(dir+'/')).map(k=>({name:k.slice(dir.length+1)}));},
    async download(path){return objects.get(path)??null;},
    async createSignedDownloadUrl(path,ttl){return{url:'https://storage.invalid/signed/'+path,ttl};}
  };
  const call=async(extra={})=>executeAudioArchive({actor:doctor,
    source:{user_id:doctor,encounter_id:encounter},grant:rights,bucket:{id:ARCHIVE_BUCKET,public:false,file_size_limit:MAX_AUDIO_BYTES,allowed_mime_types:['audio/webm','audio/ogg','audio/mp4','audio/wav','audio/x-wav']},
    storage,hashBlob,receiptStore,...extra,request:{...request,...(extra.request||{})}});
  return {call,objects,receipts,receiptStore};
}
async function rejected(promise,code){
  await assert.rejects(promise,error=>error instanceof ArchiveError&&error.code===code);
}
test('prepares a private, consent-gated upload without falsely claiming archive',async()=>{
 const f=fixture(),r=await f.call();assert.equal(r.status,200);assert.equal(r.body.archived,false);
 assert.equal(r.body.consent_for_training,false);assert.equal(f.objects.size,0);
 assert.equal(r.body.method,'authenticated_direct_upload');
 assert.equal(r.body.max_bytes,MAX_AUDIO_BYTES);
 assert.equal(r.body.upload_pending,true);
 assert.equal(r.body.requires_owner_rls,true);
 assert.equal(r.body.upsert,false);
 assert.equal(Object.hasOwn(r.body,'token'),false,'no signed upload token may escape');
 assert.match(r.body.upload_path,/^11111111-.*\.webm$/);
});
test('confirms persisted bytes by independent server-side readback and stable retry',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 const r=await f.call({request:{action:'confirm'}});assert.equal(r.body.archived,true);
 assert.equal(r.body.sha256,digest);assert.equal(r.body.server_readback_verified,true);
 const retry=await f.call({request:{action:'confirm'}});assert.deepEqual(r.body,retry.body);
 assert.equal(Object.hasOwn(r.body,'token'),false);
});
test('retrieval rechecks owner, grant and checksum without reusable signed links',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 await f.call({request:{action:'confirm'}});
 const r=await f.call({request:{action:'retrieve'}});
 assert.equal(r.body.method,'authenticated_stream');
 assert.equal(r.body.training_approved,false);
 assert.equal('signed_url' in r.body,false);
 assert.equal('expires_in_seconds' in r.body,false);
 assert.deepEqual(r.audio,bytes);
});
test('missing, revoked, wrong-purpose or unverified grant cannot upload',async()=>{
 const f=fixture();
 for(const g of [null,{...rights,active:false},{...rights,purpose:'audio_transcription'},{...rights,server_verified:false}]){
  await rejected(f.call({grant:g}),'RETENTION_GRANT_NOT_VERIFIED');
 }
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
});
test('audio exceeding the bucket-specific cap is rejected before issuing token',async()=>{
 const f=fixture();
 await rejected(f.call({bucket:{id:ARCHIVE_BUCKET,public:false,
   allowed_mime_types:['audio/webm'],file_size_limit:bytes.length-1}}),
   'AUDIO_TOO_LARGE_FOR_BUCKET');
});

test('active-looking but revoked retention grant cannot prepare, confirm or retrieve',async()=>{
 const f=fixture(),p=await f.call();
 f.objects.set(p.body.upload_path,bytes);
 for(const operation of ['prepare','confirm','retrieve']){
  await rejected(f.call({request:{action:operation},
    grant:{...rights,revoked_at:'2026-11-16T10:00:00.000Z'}}),
    'RETENTION_GRANT_NOT_VERIFIED');
 }
});
test('expired or unversioned grant is denied before any storage action',async()=>{
 const f=fixture();
 for(const grant of [
   {...rights,expires_at:'2020-01-01T00:00:00.000Z'},
   {...rights,expires_at:null},
   {...rights,policy_version:''},
   {...rights,revoked_at:undefined}
 ]){
   await rejected(f.call({grant}),'RETENTION_GRANT_NOT_VERIFIED');
 }
 assert.equal(f.objects.size,0);
});
test('prepare never mints a long-lived signed upload URL',async()=>{
 const f=fixture(),resp=await f.call();
 assert.equal(resp.body.method,'authenticated_direct_upload');
 assert.equal(resp.body.requires_owner_rls,true);
 assert.equal(resp.body.upload_pending,true);
 assert.equal('token' in resp.body,false);
 assert.equal('signed_url' in resp.body,false);
});

test('backend never signs a download URL; streaming checks authority again',()=>{
 const handler=fs.readFileSync(new URL('../supabase/functions/nexa-audio-archive/index.ts',import.meta.url),'utf8');
 assert.equal(handler.includes('createSignedUrl('),false);
 assert.equal(handler.includes('createSignedDownloadUrl('),false);
 assert.match(handler,/if\(cmd\.action==="retrieve"\)/);
 const part=handler.split('if(cmd.action==="retrieve")')[1];
 assert.match(part,/nexa_audio_retention_authority/,'latest grant must be rechecked after blob readback');
 assert.match(part,/latest\.revoked_at!==null/,'re-check revocation before responding');
 assert.match(part,/new Response\(result\.audio/,'return verified bytes in the authenticated response');
 assert.match(part,/Access-Control-Expose-Headers/);
});
test('raw audio is never included in the JSON confirmation receipt',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 const r=await f.call({request:{action:'confirm'}});
 assert.equal(r.body.archived,true);
 assert.equal('audio' in r,false);
 assert.equal('signed_url' in r.body,false);
});

test('audio readback without persisted receipt cannot claim archived',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 await rejected(f.call({request:{action:'confirm'},receiptStore:{
   commitVerified:async()=>null,readCommitted:async()=>null
 }}),'DURABLE_RECEIPT_NOT_CONFIRMED');
 assert.equal(f.receipts.size,0);
});
test('a missing receipt store fails closed after checksum verification',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 await rejected(f.call({request:{action:'confirm'},receiptStore:null}),
   'DURABLE_RECEIPT_STORE_UNAVAILABLE');
});
test('receipt idempotency returns the same durable id for unchanged audio',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 const first=await f.call({request:{action:'confirm'}});
 const retry=await f.call({request:{action:'confirm'}});
 assert.equal(first.body.receipt_id,retry.body.receipt_id);
 assert.equal(first.body.durable_receipt_verified,true);
 assert.equal(f.receipts.size,1);
});
test('stored receipt must match hash, owner, action, grant, version and file size',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 const receipt=await f.call({request:{action:'confirm'}});
 const saved=f.receipts.get(action);
 assert.equal(saved.receipt_id,receipt.body.receipt_id);
 for(const broken of [
   {...saved,sha256:'a'.repeat(64)},{...saved,owner_user_id:doctorB},
   {...saved,client_action_id:doctorB},{...saved,retention_grant_id:doctorB},
   {...saved,policy_version:'unapproved'},{...saved,size_bytes:bytes.length+1},
   {...saved,object_path:'other-blob'},{...saved,receipt_id:'not-a-uuid'}
 ]){
   f.receipts.set(action,broken);
   await rejected(f.call({request:{action:'retrieve'}}),'DURABLE_RECEIPT_NOT_FOUND');
 }
});
test('retrieve requires receipt committed after confirmed byte readback',async()=>{
 const f=fixture(),p=await f.call();f.objects.set(p.body.upload_path,bytes);
 await rejected(f.call({request:{action:'retrieve'}}),'DURABLE_RECEIPT_NOT_FOUND');
 await f.call({request:{action:'confirm'}});
 const ok=await f.call({request:{action:'retrieve'}});
 assert.deepEqual(ok.audio,bytes);
});
test('no receipt commit occurs when the storage bytes fail integrity check',async()=>{
 const f=fixture(),p=await f.call();
 f.objects.set(p.body.upload_path,Buffer.from('tampered'));
 await rejected(f.call({request:{action:'confirm'}}),'AUDIO_INTEGRITY_MISMATCH');
 assert.equal(f.receipts.size,0);
});
test('only the backend is permitted to create committed archive receipts',()=>{
 const handler=fs.readFileSync(new URL('../supabase/functions/nexa-audio-archive/index.ts',import.meta.url),'utf8');
 assert.match(handler,/admin\.rpc\("nexa_audio_commit_verified_receipt"/);
 assert.match(handler,/DURABLE_RECEIPT_COMMIT_FAILED/);
 assert.match(handler,/readCommitted/);
});

test('unapplied SQL candidate has balanced bodies, intact regex and one transaction',()=>{
 const sql=fs.readFileSync(new URL('../supabase/functions/nexa-audio-archive/retention-storage.CANDIDATE-NOT-APPLIED.sql',import.meta.url),'utf8');
 assert.equal((sql.match(/^begin;$/gm)||[]).length,1);
 assert.equal((sql.match(/^commit;$/gm)||[]).length,1);
 assert.equal((sql.match(/^\s*as \$\$\s*$/gm)||[]).length,4);
 assert.equal((sql.match(/^\s*\$\$;\s*$/gm)||[]).length,4);
 assert.equal((sql.match(/^\s*insert into storage\.buckets\b/gm)||[]).length,1);
 assert.equal((sql.match(/^create table if not exists public\.nexa_audio_archive_receipts\b/gm)||[]).length,1);
 assert.ok(sql.includes("sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$')"));
 assert.ok(sql.includes("policy_version text not null check (policy_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$')"));
 assert.ok(sql.includes("p_sha256 !~ '^[a-f0-9]{64}$'"));
 assert.ok(sql.includes('grant select, update on public.nexa_audio_retention_grants to service_role;'));
 assert.match(sql,/for share;/);
 assert.ok(sql.includes('REVIEW CANDIDATE, NOT APPLIED'));
});

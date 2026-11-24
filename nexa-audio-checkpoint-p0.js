/* NEXA P0 G1 — encrypted, owner-scoped browser audio checkpoints.
 * Draft only. DOES NOT transmit audio, grant consent, or authorize AI egress.
 * AES-GCM key is non-extractable but persisted in this browser's IndexedDB;
 * same-origin code and device loss remain risks. A server backup is separate.
 */
(()=>{
'use strict';
if(window.nexaAudioCheckpointP0)return;
const NAME='nexa-audio-checkpoint-p0',VERSION=1;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const valid=(v,label)=>{if(typeof v!=='string'||!UUID.test(v))throw Error('AUDIO_'+label+'_INVALID');return v};
const scope=({ownerId,encounterId,sessionId})=>({
  ownerId:valid(ownerId,'OWNER'),encounterId:valid(encounterId,'ENCOUNTER'),
  sessionId:valid(sessionId,'SESSION')
});
const digest=b=>crypto.subtle.digest('SHA-256',b).then(h=>
  Array.from(new Uint8Array(h),n=>n.toString(16).padStart(2,'0')).join(''));
const bufferToHex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const txDone=t=>new Promise((ok,bad)=>{
  t.oncomplete=()=>ok();t.onerror=()=>bad(t.error||Error('AUDIO_IDB_FAILED'));
  t.onabort=()=>bad(t.error||Error('AUDIO_IDB_ABORT'));
});
const req=r=>new Promise((ok,bad)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error||Error('AUDIO_IDB_REQUEST_FAILED'))});
let opened;
function db(){
 if(!opened)opened=new Promise((resolve,reject)=>{
   if(!globalThis.crypto?.subtle||!globalThis.indexedDB){reject(Error('AUDIO_SECURE_STORAGE_UNAVAILABLE'));return}
   const r=indexedDB.open(NAME,VERSION);
   r.onupgradeneeded=()=>{
     const d=r.result;
     if(!d.objectStoreNames.contains('keys'))d.createObjectStore('keys',{keyPath:'ownerId'});
     if(!d.objectStoreNames.contains('sessions')){
       const s=d.createObjectStore('sessions',{keyPath:'sessionId'});
       s.createIndex('by_owner','ownerId',{unique:false});
     }
     if(!d.objectStoreNames.contains('chunks')){
       const c=d.createObjectStore('chunks',{keyPath:'id'});
       c.createIndex('by_session','sessionId',{unique:false});
     }
   };
   r.onsuccess=()=>resolve(r.result);
   r.onerror=()=>reject(r.error||Error('AUDIO_DB_OPEN_FAILED'));
   r.onblocked=()=>reject(Error('AUDIO_DB_BLOCKED'));
 }).catch(error=>{opened=null;throw error});
 return opened;
}
async function read(table,id){const d=await db(),t=d.transaction(table,'readonly');return req(t.objectStore(table).get(id))}
async function add(table,row){
 const d=await db(),t=d.transaction(table,'readwrite'),done=txDone(t);
 t.objectStore(table).add(row);await done;
}
async function put(table,row){
 const d=await db(),t=d.transaction(table,'readwrite'),done=txDone(t);
 t.objectStore(table).put(row);await done;
}
async function ownerKey(ownerId,{create=false}={}){
 const stored=await read('keys',ownerId);if(stored?.key)return stored.key;
 if(!create)throw Error('AUDIO_KEY_MISSING');
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 try{await add('keys',{ownerId,key})}catch(e){
  if(e?.name!=='ConstraintError')throw e;
 }
 const saved=await read('keys',ownerId);
 if(!saved?.key)throw Error('AUDIO_KEY_NOT_PERSISTED');
 return saved.key;
}
const aad=(identity,seq,mime)=>new TextEncoder().encode(
  [identity.ownerId,identity.encounterId,identity.sessionId,String(seq),mime].join('|'));
async function begin(args){
 const i=scope(args);
 const prior=await read('sessions',i.sessionId);
 if(prior){
  if(prior.ownerId!==i.ownerId||prior.encounterId!==i.encounterId)
    throw Error('AUDIO_SESSION_OWNER_MISMATCH');
  if(prior.finalized)throw Error('AUDIO_SESSION_ALREADY_FINALIZED');
  if(prior.mime!==String(args.mime||'audio/webm'))throw Error('AUDIO_SESSION_MIME_MISMATCH');
  await ownerKey(i.ownerId);
  return {sessionId:i.sessionId,existing:true};
 }
 await ownerKey(i.ownerId,{create:true});
 await add('sessions',{...i,mime:String(args.mime||'audio/webm'),
  createdAt:new Date().toISOString(),finalized:false});
 return {sessionId:i.sessionId,existing:false};
}
async function verifyChunk(i,c,seq,mime,key){
 if(!c||c.sessionId!==i.sessionId||c.seq!==seq||c.ownerId!==i.ownerId||c.mime!==mime)
   throw Error('AUDIO_CHUNK_GAP_OR_SCOPE_MISMATCH');
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:c.iv,
   additionalData:aad(i,seq,mime)},key,c.ciphertext);
 if(await digest(bytes)!==c.sha256)throw Error('AUDIO_CHECKPOINT_INTEGRITY_FAILED');
 return bytes;
}
async function append(args){
 const i=scope(args),seq=args.sequence;
 if(!Number.isSafeInteger(seq)||seq<0||seq>7200)throw Error('AUDIO_SEQUENCE_INVALID');
 if(!(args.blob instanceof Blob)||args.blob.size===0||args.blob.size>32*1024*1024)
   throw Error('AUDIO_CHUNK_INVALID');
 const s=await read('sessions',i.sessionId);
 if(!s||s.ownerId!==i.ownerId||s.encounterId!==i.encounterId||s.finalized)
   throw Error('AUDIO_ACTIVE_SESSION_REQUIRED');
 const id=i.sessionId+':'+String(seq).padStart(6,'0');
 const data=await args.blob.arrayBuffer(),hash=await digest(data);
 const existing=await read('chunks',id);
 if(existing){
   if(existing.ownerId===i.ownerId&&existing.sha256===hash){
     await verifyChunk(i,existing,seq,s.mime,await ownerKey(i.ownerId));
     return {sequence:seq,readback:true,duplicate:true};
   }
   throw Error('AUDIO_SEQUENCE_CONFLICT');
 }
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(i,seq,s.mime)},
   await ownerKey(i.ownerId),data);
 await add('chunks',{id,sessionId:i.sessionId,ownerId:i.ownerId,seq,
  mime:s.mime,iv,ciphertext,sha256:hash});
 const saved=await read('chunks',id);
 if(!saved||saved.ownerId!==i.ownerId||saved.sha256!==hash)
   throw Error('AUDIO_CHECKPOINT_READBACK_FAILED');
 await verifyChunk(i,saved,seq,s.mime,await ownerKey(i.ownerId));
 return {sequence:seq,sha256:hash,readback:true};
}
async function getChunks(sessionId){
 const d=await db(),t=d.transaction('chunks','readonly');
 return req(t.objectStore('chunks').index('by_session').getAll(sessionId));
}
async function recover(args){
 const i=scope(args),s=await read('sessions',i.sessionId);
 if(!s||s.ownerId!==i.ownerId||s.encounterId!==i.encounterId)
   throw Error('AUDIO_SESSION_NOT_OWNED');
 const chunks=(await getChunks(i.sessionId)).sort((a,b)=>a.seq-b.seq);
 if(!chunks.length)throw Error('AUDIO_NO_DURABLE_CHUNKS');
 if(s.finalized&&(!Number.isSafeInteger(s.chunkCount)||s.chunkCount!==chunks.length))
   throw Error('AUDIO_FINALIZED_CHUNK_COUNT_MISMATCH');
 const key=await ownerKey(i.ownerId),buffers=[];
 for(let n=0;n<chunks.length;n++){
  buffers.push(await verifyChunk(i,chunks[n],n,s.mime,key));
 }
 return {blob:new Blob(buffers,{type:s.mime}),chunks:chunks.length,
  finalized:s.finalized===true,ownerId:i.ownerId,encounterId:i.encounterId,
  sessionId:i.sessionId};
}
async function finalize(args){
 const i=scope(args),expected=args.expectedChunkCount;
 if(!Number.isSafeInteger(expected)||expected<1||expected>7201)throw Error('AUDIO_EXPECTED_CHUNK_COUNT_REQUIRED');
 const s=await read('sessions',i.sessionId);
 if(!s||s.ownerId!==i.ownerId||s.encounterId!==i.encounterId)
   throw Error('AUDIO_SESSION_NOT_OWNED');
 const recovered=await recover(i);
 if(recovered.chunks!==expected)throw Error('AUDIO_EXPECTED_CHUNK_COUNT_MISMATCH');
 if(s.finalized)return {sessionId:i.sessionId,chunks:expected,readback:true,duplicate:true};
 await put('sessions',{...s,finalized:true,finalizedAt:new Date().toISOString(),
  chunkCount:recovered.chunks});
 const saved=await read('sessions',i.sessionId);
 if(!saved?.finalized||saved.chunkCount!==recovered.chunks)
  throw Error('AUDIO_FINALIZATION_READBACK_FAILED');
 return {sessionId:i.sessionId,chunks:recovered.chunks,readback:true};
}
async function listOwned(ownerId){
 valid(ownerId,'OWNER');
 const d=await db(),t=d.transaction('sessions','readonly');
 const rows=await req(t.objectStore('sessions').index('by_owner').getAll(ownerId));
 return rows.map(x=>({encounterId:x.encounterId,sessionId:x.sessionId,
  createdAt:x.createdAt,finalized:x.finalized,chunkCount:x.chunkCount||null}))
  .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
window.nexaAudioCheckpointP0=Object.freeze({begin,append,recover,finalize,listOwned,
  mode:'encrypted_indexeddb_local_only',remoteBackupConfirmed:false,
  clinicalReleaseVerified:false});
})();

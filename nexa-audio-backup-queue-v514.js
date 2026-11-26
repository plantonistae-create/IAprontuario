/* NEXA V5.14 (LAB-VALIDATED, NOT DEPLOYED) — persistent, resumable remote-backup queue for encrypted audio checkpoints.
 * It never deletes or alters the local checkpoint, never blocks recording, and never claims "remote" before a server readback equals the local bytes.
 * Indicator states: local_only | uploading | retry | verified | needs_attention. Remote backup is clinical backup, NOT AI egress and NOT training. */
(()=>{
'use strict';
if(window.nexaAudioBackupQueueV514)return;
const DB='nexa-audio-backup-queue-v514',STORE='jobs',UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let cfg=null,pumping=null,timer=null,opened=null;
const TEXT={local_only:'Salvo só neste aparelho — backup remoto ainda não confirmado',uploading:'Enviando backup remoto… (o áudio continua protegido neste aparelho)',
 retry:'Sem confirmação do backup remoto — nova tentativa automática. Áudio protegido neste aparelho',verified:'Backup remoto verificado ✓ (conferido byte a byte)',
 needs_attention:'ATENÇÃO: backup remoto não concluído. Áudio ainda protegido neste aparelho'};
function db(){return opened||(opened=new Promise((res,rej)=>{const r=indexedDB.open(DB,1);
 r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'sessionId'}).createIndex('by_owner','ownerId')};
 r.onsuccess=()=>res(r.result);r.onerror=()=>{opened=null;rej(r.error)}}))}
const tx=async(mode,fn)=>{const d=await db(),t=d.transaction(STORE,mode);let out;const done=new Promise((ok,bad)=>{t.oncomplete=()=>ok(out);t.onabort=t.onerror=()=>bad(t.error||new Error('QUEUE_IDB_FAILED'))});out=await fn(t.objectStore(STORE));return done};
const req=r=>new Promise((ok,bad)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});
const get=id=>tx('readonly',s=>req(s.get(id))),put=j=>tx('readwrite',s=>{s.put(j)});
const all=()=>tx('readonly',s=>req(s.getAll()));
function emit(job){
 const state=job?.state||'local_only';
 try{window.dispatchEvent(new CustomEvent('nexa:audio-backup-state',{detail:{sessionId:job?.sessionId,encounterId:job?.encounterId,state,text:TEXT[state],digest:job?.digest||null}}))}catch{}
 const el=document.getElementById('nexaBackupBadge');if(el){el.dataset.state=state;el.textContent=TEXT[state]}
}
function configure(c){
 if(c===null){cfg=null;clearTimeout(timer);return}
 if(!c||typeof c.sync!=='function'||typeof c.recoverLocal!=='function'||typeof c.register!=='function')throw new Error('BACKUP_QUEUE_CONFIG_INVALID');
 cfg=c;
}
async function enqueue({ownerId,encounterId,sessionId,sourceVersion=1}){
 for(const v of [ownerId,encounterId,sessionId])if(typeof v!=='string'||!UUID.test(v))throw new Error('BACKUP_QUEUE_SCOPE_INVALID');
 const prior=await get(sessionId);
 if(prior&&prior.ownerId===ownerId&&prior.encounterId===encounterId){emit(prior);schedule(0);return prior}
 if(prior)throw new Error('BACKUP_QUEUE_OWNER_MISMATCH');
 const job={sessionId,ownerId,encounterId,sourceVersion,state:cfg?'uploading':'local_only',attempts:0,nextAttemptAt:0,createdAt:Date.now(),lastError:null};
 await put(job);emit(job);schedule(0);return job;
}
async function step(job){
 if(cfg.owner&&cfg.owner()!==job.ownerId)return job;               // another physician is signed in: this job is untouched, never uploaded under a different identity
 const scope={ownerId:job.ownerId,encounterId:job.encounterId,sessionId:job.sessionId,sourceVersion:job.sourceVersion};
 job={...job,state:'uploading',attempts:job.attempts+1};await put(job);emit(job);
 const reg=await cfg.register(scope);                                // server registers the backup source ONLY under a live server grant
 if(!reg||reg.registered!==true)throw new Error('BACKUP_SOURCE_NOT_REGISTERED');
 let result;
 if(typeof cfg.syncChunks==='function'&&typeof cfg.localChunks==='function'){
  const local=await cfg.localChunks(scope);                          // verified chunks with the SAME boundaries as the live uploads
  result=await cfg.syncChunks(scope,local.buffers,normalizeMime(local.mime));       // idempotent PUTs, finalize, readback, byte comparison
 }else{
  const local=await cfg.recoverLocal(scope);                         // decrypts + verifies every local chunk; never modifies it
  result=await cfg.sync(scope,local.blob);                           // PUT chunks, finalize, readback, byte comparison (throws on any mismatch)
 }
 if(!result||result.readback!==true)throw new Error('BACKUP_READBACK_FAILED');
 job={...job,state:'verified',verifiedAt:Date.now(),digest:result.manifest?.digest||null,lastError:null,nextAttemptAt:0};await put(job);emit(job);
 return job;
}
// WebKit reports e.g. 'audio/webm; codecs=opus' / 'audio/mp4; codecs=mp4a.40.2' (with a space); the server contract only accepts the compact form.
const normalizeMime=m=>String(m||'').replace(/\s+/g,'').toLowerCase();
const registered=new Set();
// Best-effort upload of ONE chunk while the physician is still recording. It never throws, never blocks the recorder, never marks anything verified:
// the finalize-time job re-sends everything idempotently and is the only thing that can produce the 'verified' state.
async function streamChunk({ownerId,encounterId,sessionId,sourceVersion=1,sequence,bytes}){
 try{
  if(!cfg||typeof cfg.putChunk!=='function'||(cfg.owner&&cfg.owner()!==ownerId))return false;
  const scope={ownerId,encounterId,sessionId,sourceVersion};
  if(!registered.has(sessionId)){const reg=await cfg.register(scope);if(!reg||reg.registered!==true)return false;registered.add(sessionId)}
  await cfg.putChunk(scope,sequence,bytes);return true;
 }catch{registered.delete(sessionId);return false}
}
async function pump(){
 if(pumping)return pumping;
 pumping=(async()=>{
  if(!cfg)return;
  let jobs=await all();let soonest=null;
  for(let job of jobs){
   if(job.state==='verified')continue;
   if(cfg.owner&&cfg.owner()!==job.ownerId)continue;
   if(job.nextAttemptAt>Date.now()){soonest=Math.min(soonest??Infinity,job.nextAttemptAt);continue}
   try{await step(job)}
   catch(e){
    const attempts=(await get(job.sessionId))?.attempts||job.attempts;
    const failed={...(await get(job.sessionId)||job),attempts,lastError:String(e&&e.message||e).replace(/[^A-Z0-9_ a-z.-]/g,'').slice(0,80),
     state:attempts>=8?'needs_attention':'retry',nextAttemptAt:Date.now()+Math.min(30000,1000*2**Math.min(attempts,5))};
    await put(failed);emit(failed);soonest=Math.min(soonest??Infinity,failed.nextAttemptAt);
   }
  }
  if(soonest!==null)schedule(Math.max(200,soonest-Date.now()));
 })().finally(()=>{pumping=null});
 return pumping;
}
function schedule(ms){clearTimeout(timer);timer=setTimeout(()=>{pump().catch(()=>{})},ms)}
window.addEventListener('online',()=>schedule(0));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(0)});
async function resume(){schedule(0);return all()}                    // call at startup: restores pending jobs after a reload/crash
async function snapshot(){return(await all()).map(j=>({sessionId:j.sessionId,encounterId:j.encounterId,ownerId:j.ownerId,sourceVersion:j.sourceVersion,state:j.state,attempts:j.attempts,lastError:j.lastError,verifiedAt:j.verifiedAt||null,digest:j.digest||null}))}   // V5.24: retention needs owner, verification time and the verified digest
window.nexaAudioBackupQueueV514=Object.freeze({configure,enqueue,streamChunk,pump,resume,snapshot,TEXT,mode:'lab_validated_not_deployed'});
})();

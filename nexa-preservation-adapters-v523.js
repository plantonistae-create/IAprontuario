/* NEXA V5.23 (CANDIDATE, NOT DEPLOYED) — production adapters that connect the (already lab-validated) remote-backup queue and versioned-capture queue to Supabase.
 * OFF unless APP_CONFIG.remotePreservation===true AND the server-issued assistance authority is configured: without a live server grant nothing is sent, and everything stays
 * safely on this device (local encrypted vault + local queues). Backup = clinical preservation, NOT AI egress, NOT audit, NOT training.
 *  - backup transport: HTTPS to the `audio-backup` Edge function (Supabase JWT); chunks are sent in the SAME boundaries as the local vault, finalized, read back and compared byte for byte.
 *  - capture transport: the four public.nexa_capture_* RPCs under the physician's own JWT (owner = auth.uid() on the server; the client never names an owner).
 * Nothing here deletes or alters local data. */
(()=>{
'use strict';
if(window.nexaPreservationAdaptersV523)return;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,HEX=/^[0-9a-f]{64}$/,MAX_CHUNK=32*1024*1024,MAX_COUNT=7201,TIMEOUT=20000;
const MIME=/^audio\/(?:webm|mp4|ogg|wav)(?:;codecs=[a-z0-9.,-]{1,32})?$/;
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const sha=async b=>hex(await crypto.subtle.digest('SHA-256',b));
const normMime=m=>String(m||'').replace(/\s+/g,'').toLowerCase();   // WebKit reports 'audio/webm; codecs=opus'; the server contract only accepts the compact form
function baseUrl(supabaseUrl,path,allowLoopbackHttp){
  const u=new URL(path,supabaseUrl),loop=['127.0.0.1','localhost','[::1]'].includes(u.hostname);
  if(u.username||u.password||u.search||u.hash||(u.protocol!=='https:'&&!(allowLoopbackHttp&&loop&&u.protocol==='http:')))throw new Error('PRESERVATION_ENDPOINT_INVALID');
  return u;
}
function backup({sb,supabaseUrl,anonKey,authority,vault,path='/functions/v1/audio-backup/',allowLoopbackHttp=false,fetchImpl=(...a)=>fetch(...a),owner}){
  if(!sb?.auth?.getSession||!authority?.transport||!vault?.chunkBuffers||typeof owner!=='function')throw new Error('PRESERVATION_BACKUP_CONFIG_INVALID');
  const base=baseUrl(supabaseUrl,path,allowLoopbackHttp);
  const token=async()=>{const s=(await sb.auth.getSession())?.data?.session?.access_token;if(!s)throw new Error('PRESERVATION_NO_SESSION');return s};
  const call=async(scope,route,{seq,method='GET',body,expect='json'}={})=>{
    if(![scope?.ownerId,scope?.encounterId,scope?.sessionId].every(x=>typeof x==='string'&&UUID.test(x))||!Number.isSafeInteger(scope.sourceVersion)||scope.sourceVersion<1)throw new Error('PRESERVATION_SCOPE_REQUIRED');
    if(owner()!==scope.ownerId)throw new Error('PRESERVATION_OWNER_CHANGED');   // another physician is signed in: never upload under a different identity
    const url=new URL(route,base);url.searchParams.set('encounter',scope.encounterId);url.searchParams.set('session',scope.sessionId);url.searchParams.set('revision',String(scope.sourceVersion));
    if(seq!==undefined)url.searchParams.set('seq',String(seq));    // NOTE: no owner/purpose parameter exists: identity and purpose are decided server-side
    const r=await fetchImpl(url,{method,body,redirect:'error',cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer '+await token(),apikey:anonKey,'x-nexa-encounter-id':scope.encounterId},signal:AbortSignal.timeout(TIMEOUT)});
    if(!r.ok)throw new Error('PRESERVATION_HTTP_'+r.status);
    return expect==='json'?r.json():r.arrayBuffer();
  };
  const putChunk=async(scope,seq,bytes)=>{
    if(!Number.isSafeInteger(seq)||seq<0||seq>7200||!(bytes instanceof ArrayBuffer||ArrayBuffer.isView(bytes))||bytes.byteLength<1||bytes.byteLength>MAX_CHUNK)throw new Error('PRESERVATION_CHUNK_INVALID');
    const rc=await call(scope,'chunks',{seq,method:'PUT',body:bytes});
    if(rc.readback!==true||rc.trainingAuthorized!==false||rc.sourceVersion!==scope.sourceVersion||rc.sha256!==await sha(bytes))throw new Error('PRESERVATION_RECEIPT_MISMATCH');
    return rc;
  };
  return {
    owner,
    // The source is "registered" ONLY if the server issues a live clinical_backup grant (which itself requires a live assistance grant).
    register:async scope=>{const g=await authority.transport().grant(scope.encounterId,'clinical_backup');return{registered:g?.authorized===true,reason:g?.reason||null}},
    putChunk,
    localChunks:scope=>vault.chunkBuffers({ownerId:scope.ownerId,encounterId:scope.encounterId,sessionId:scope.sessionId}),
    // V5.24: fresh server-side confirmation used by retention BEFORE any local purge: the stored manifest must still exist and carry exactly the digest recorded at verification.
    // V5.25 multi-device: the signed-in physician's own finalized remote backups (metadata only). Never trusts a row that is not shaped like one.
    async listRemote(){
      const url=new URL('sessions',base);
      const r=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer '+await token(),apikey:anonKey},signal:AbortSignal.timeout(TIMEOUT)});
      if(!r.ok)throw new Error('PRESERVATION_HTTP_'+r.status);
      const j=await r.json();
      if(j.trainingAuthorized!==false||String(j.ownerId||'').toLowerCase()!==String(owner()||'').toLowerCase()||!Array.isArray(j.sessions))throw new Error('PRESERVATION_LIST_MISMATCH');
      return j.sessions.filter(x=>x&&UUID.test(String(x.encounter_id))&&UUID.test(String(x.session_id))&&Number.isSafeInteger(x.source_version)&&x.source_version>=1&&MIME.test(String(x.mime))&&Number.isSafeInteger(x.chunk_count)&&x.chunk_count>=1&&x.chunk_count<=MAX_COUNT&&HEX.test(String(x.digest))&&Number.isFinite(Date.parse(x.committed_at)))
        .map(x=>({encounter_id:String(x.encounter_id).toLowerCase(),session_id:String(x.session_id).toLowerCase(),source_version:x.source_version,mime:x.mime,chunk_count:x.chunk_count,total_bytes:Number(x.total_bytes)||0,digest:x.digest,committed_at:x.committed_at}));
    },
    async confirmRemote(scope,digest){const m=await call(scope,'manifest');return HEX.test(String(digest))&&m.digest===digest&&m.trainingAuthorized===false&&Number.isSafeInteger(m.chunk_count)&&m.chunk_count>=1},
    // V5.24: restore a (possibly locally purged) session from the server, verified chunk by chunk against its manifest.
    async recover(scope){
      const m=await call(scope,'manifest');
      if(!HEX.test(String(m.digest))||m.trainingAuthorized!==false||!Array.isArray(m.chunks)||m.chunks.length!==m.chunk_count||!MIME.test(String(m.mime))||m.chunk_count<1||m.chunk_count>MAX_COUNT)throw new Error('PRESERVATION_MANIFEST_MISMATCH');
      const canonical=m.chunks.map(c=>[c.sequence,c.sha256,c.size].join(':')).join(',');
      if(m.digest!==await sha(new TextEncoder().encode(canonical))||!m.chunks.every((c,i)=>c.sequence===i&&HEX.test(c.sha256)))throw new Error('PRESERVATION_MANIFEST_MISMATCH');
      const parts=[];for(let i=0;i<m.chunks.length;i++){const b=await call(scope,'chunks',{seq:i,expect:'bytes'});if(b.byteLength!==m.chunks[i].size||await sha(b)!==m.chunks[i].sha256)throw new Error('PRESERVATION_READBACK_MISMATCH');parts.push(b)}
      return{blob:new Blob(parts,{type:m.mime}),manifest:{digest:m.digest,chunks:m.chunks.length}};
    },
    async syncChunks(scope,buffers,mime){
      mime=normMime(mime);
      if(!Array.isArray(buffers)||!buffers.length||buffers.length>MAX_COUNT||!MIME.test(mime))throw new Error('PRESERVATION_AUDIO_INVALID');
      const local=[];
      for(let i=0;i<buffers.length;i++){await putChunk(scope,i,buffers[i]);local.push({sequence:i,sha256:await sha(buffers[i]),size:buffers[i].byteLength})}   // idempotent: a replay returns the same receipt
      const fin=await call(scope,'manifest',{method:'POST',body:JSON.stringify({chunkCount:buffers.length,mime})});
      const m=await call(scope,'manifest');
      const canonical=local.map(c=>[c.sequence,c.sha256,c.size].join(':')).join(',');
      if(!HEX.test(String(m.digest))||m.trainingAuthorized!==false||m.chunk_count!==buffers.length||m.mime!==mime||m.chunks?.length!==buffers.length||fin.digest!==m.digest||m.digest!==await sha(new TextEncoder().encode(canonical))
         ||!m.chunks.every((c,i)=>c.sequence===i&&c.sha256===local[i].sha256&&c.size===local[i].size))throw new Error('PRESERVATION_MANIFEST_MISMATCH');
      for(let i=0;i<buffers.length;i++){   // byte-for-byte readback of what the server actually stored (decrypted server side), compared with the local bytes
        const back=await call(scope,'chunks',{seq:i,expect:'bytes'});
        if(back.byteLength!==local[i].size||await sha(back)!==local[i].sha256)throw new Error('PRESERVATION_READBACK_MISMATCH');
      }
      return{readback:true,manifest:{digest:m.digest}};
    },
  };
}
function capture({sb}){
  if(!sb?.rpc)throw new Error('PRESERVATION_CAPTURE_CONFIG_INVALID');
  const rpc=async(name,args)=>{const r=await sb.rpc(name,args);if(r.error)throw new Error('CAPTURE_RPC_'+String(r.error.code||'ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,20));return r.data};
  return{
    append:async(e,k,p,s)=>{const d=await rpc('nexa_capture_append',{p_encounter:e,p_kind:k,p_payload:p,p_expected_seq:s});return Array.isArray(d)?d[0]:d},
    readChain:async e=>{const d=await rpc('nexa_capture_read_chain',{p_encounter:e});return Array.isArray(d)?d:[]},
    verifyChain:async e=>{const d=await rpc('nexa_capture_verify_chain',{p_encounter:e});return Array.isArray(d)?d[0]:d},
  };
}
let current=null;   // the active backup config (retention re-confirmation and restore go through it)
/** Wires the existing queues. Returns {started,reason}. Never throws into the clinical UI. */
function start({sb,supabaseUrl,anonKey,flags,owner,allowLoopbackHttp=false,fetchImpl}){
  try{
    if(!flags||flags.remotePreservation!==true)return{started:false,reason:'FLAG_OFF'};
    if(flags.assistAuthority!==true)return{started:false,reason:'AUTHORITY_REQUIRED'};   // without server grants every remote call would be denied: stay local
    const authority=window.nexaAssistAuthorityV514,vault=window.nexaAudioCheckpointP0,queue=window.nexaAudioBackupQueueV514,cap=window.nexaCaptureV516;
    if(!authority||!vault||!queue||!cap)return{started:false,reason:'MODULES_MISSING'};
    current=backup({sb,supabaseUrl,anonKey,authority,vault,owner,allowLoopbackHttp,fetchImpl});queue.configure(current);
    cap.configure({transport:capture({sb}),owner});
    void queue.resume();void cap.resume();
    return{started:true,reason:null};
  }catch(e){return{started:false,reason:String(e&&e.message||e).replace(/[^A-Z0-9_]/g,'').slice(0,60)||'ERROR'}}
}
window.nexaPreservationAdaptersV523=Object.freeze({backup,capture,start,confirmRemote:(scope,digest)=>current?current.confirmRemote(scope,digest):Promise.resolve(false),recoverRemote:scope=>current?current.recover(scope):Promise.reject(new Error('PRESERVATION_NOT_STARTED')),listRemote:()=>current?current.listRemote():Promise.resolve([]),mode:'candidate_not_deployed',trainingAuthorized:false,externalAiAuthorized:false});
})();

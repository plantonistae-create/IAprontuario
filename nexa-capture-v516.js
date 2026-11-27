/* NEXA V5.16 (LAB-VALIDATED, NOT DEPLOYED) — versioned capture of the assistance record: audio references, original transcript, structured/corrected fields, Radar,
 * physician edits and provenance, appended to a server-side hash chain (see labs/nexa-v515/capture.lab.sql).
 * PRESERVATION ONLY: nothing here exports, trains, audits or authorizes anything; the server answers training_authorized:false on every record.
 * Never blocks the clinical UI: record() only writes to a local persistent queue; sending is best-effort, ordered, resumable after reload/crash,
 * and 'synced' is shown only after a server readback (chain verified AND the last records equal what was sent). */
(()=>{
'use strict';
if(window.nexaCaptureV516)return;
const DB='nexa-capture-queue-v516',STORE='events',UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS=['audio_ref','transcript_provisional','transcript_final','transcript_corrected','clinical_fields','radar','physician_edit','provenance'];
const TEXT={local_only:'Registro versionado: guardado só neste aparelho',sending:'Registro versionado: enviando…',retry:'Registro versionado: sem confirmação do servidor — nova tentativa automática',synced:'Registro versionado: confirmado no servidor ✓',attention:'ATENÇÃO: registro versionado não confirmado'};
let cfg=null,opened=null,pumping=null,timer=null,dirty=false;
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const sha=async t=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)));
function stable(v){if(Array.isArray(v))return'['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v)}
const same=(a,b)=>stable(a)===stable(b);
function db(){return opened||(opened=new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});s.createIndex('by_enc','key')};r.onsuccess=()=>res(r.result);r.onerror=()=>{opened=null;rej(r.error)}}))}
const tx=async(mode,fn)=>{const d=await db(),t=d.transaction(STORE,mode);let out;const done=new Promise((ok,bad)=>{t.oncomplete=()=>ok(out);t.onabort=t.onerror=()=>bad(t.error||new Error('CAPTURE_IDB_FAILED'))});out=await fn(t.objectStore(STORE));return done};
const rq=r=>new Promise((ok,bad)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});
const all=()=>tx('readonly',s=>rq(s.getAll()));
function badge(state){const el=document.getElementById('nexaCaptureBadge');if(el){el.hidden=false;el.dataset.state=state;el.textContent=TEXT[state]}try{window.dispatchEvent(new CustomEvent('nexa:capture-state',{detail:{state,text:TEXT[state]}}))}catch{}}
function configure(c){if(c===null){cfg=null;clearTimeout(timer);return}
 if(!c||['append','readChain','verifyChain'].some(k=>typeof c.transport?.[k]!=='function')||typeof c.owner!=='function')throw new Error('CAPTURE_CONFIG_INVALID');cfg=c}
// Local, ordered, durable BEFORE any network attempt. Never throws into the caller's UI path.
async function record(kind,payload,{encounterId}={}){
 try{
  if(!KINDS.includes(kind)||!payload||typeof payload!=='object'||Array.isArray(payload)||!UUID.test(String(encounterId||'')))return false;
  const owner=cfg?cfg.owner():null;if(!owner||!UUID.test(String(owner)))return false;                        // no authenticated owner => nothing is queued under a guessed identity
  const body=JSON.stringify(payload);if(body.length>200000)return false;
  const ev={key:owner+'|'+encounterId.toLowerCase(),ownerId:owner,encounterId:encounterId.toLowerCase(),kind,payload:JSON.parse(body),queuedAt:Date.now(),attempts:0};
  await tx('readwrite',s=>{s.add(ev)});dirty=true;badge(cfg?'sending':'local_only');schedule(0);return true;
 }catch{return false}
}
async function nextSeq(enc){const chain=await cfg.transport.readChain(enc);return {chain,next:chain.length+1}}
async function sendOne(ev){
 let {chain,next}=await nextSeq(ev.encounterId);
 // Idempotent resume: if this exact record is already the next-to-last... find it anywhere at/after the queue's own position (same kind + deep-equal payload)
 const already=chain.find(r=>r.kind===ev.kind&&same(r.payload,ev.payload)&&r.seq>=(ev.minSeq||1));
 if(already)return already;
 const res=await cfg.transport.append(ev.encounterId,ev.kind,ev.payload,next);
 if(res&&res.appended===true)return {seq:res.seq,record_digest:res.record_digest,kind:ev.kind,payload:ev.payload};
 if(res&&res.reason==='SEQUENCE_CONFLICT'&&Number.isSafeInteger(res.next_seq)){const again=await cfg.transport.append(ev.encounterId,ev.kind,ev.payload,res.next_seq);if(again&&again.appended===true)return {seq:again.seq,record_digest:again.record_digest,kind:ev.kind,payload:ev.payload}}
 throw new Error('CAPTURE_APPEND_REFUSED_'+String(res&&res.reason||'UNKNOWN').replace(/[^A-Z_]/g,'').slice(0,40));
}
async function readback(enc,sent){   // 'synced' only if the server's verified chain actually contains what we sent
 const v=await cfg.transport.verifyChain(enc);if(!v||v.valid!==true)throw new Error('CAPTURE_CHAIN_INVALID');
 const chain=await cfg.transport.readChain(enc);
 for(const s of sent){const r=chain.find(x=>x.seq===s.seq);if(!r||r.kind!==s.kind||!same(r.payload,s.payload)||r.record_digest!==s.record_digest)throw new Error('CAPTURE_READBACK_MISMATCH')}
 return v;
}
async function pump(){
 if(pumping){dirty=true;return pumping}                 // a record queued while a pass is running is picked up by the loop below, never left behind
 pumping=(async()=>{ do{dirty=false;await pass()}while(dirty); })().finally(()=>{pumping=null});
 return pumping;
}
async function pass(){
 {
  if(!cfg)return;const owner=cfg.owner();if(!owner)return;
  const events=(await all()).filter(e=>e.ownerId===owner).sort((a,b)=>a.id-b.id);if(!events.length){badge('synced');return}
  const byEnc=new Map();for(const e of events){(byEnc.get(e.encounterId)||byEnc.set(e.encounterId,[]).get(e.encounterId)).push(e)}
  let failed=false;
  for(const [enc,list] of byEnc){
   const sent=[];
   for(const ev of list){
    try{badge('sending');sent.push({...await sendOne(ev),id:ev.id})}
    catch(e){failed=true;const attempts=ev.attempts+1;await tx('readwrite',s=>{s.put({...ev,attempts,lastError:String(e.message||e).replace(/[^A-Za-z0-9_ .-]/g,'').slice(0,60)})});badge(attempts>=8?'attention':'retry');break}
   }
   if(sent.length){try{await readback(enc,sent);await tx('readwrite',s=>{for(const x of sent)s.delete(x.id)})}catch(e){failed=true;badge('retry')}}
  }
  if(failed)schedule(Math.min(30000,2000)); else if(!dirty)badge('synced');
 }
}
function schedule(ms){clearTimeout(timer);timer=setTimeout(()=>{pump().catch(()=>{})},ms)}
window.addEventListener('online',()=>schedule(0));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(0)});
const resume=async()=>{schedule(0);return(await all()).length};
const pending=async()=>(await all()).map(e=>({kind:e.kind,encounterId:e.encounterId,attempts:e.attempts,lastError:e.lastError||null}));
const digestFields=async f=>sha(stable(f));
const configured=()=>!!cfg;
window.nexaCaptureV516=Object.freeze({configure,configured,record,pump,resume,pending,digestFields,KINDS,TEXT,mode:'lab_validated_not_deployed',trainingAuthorized:false});
})();

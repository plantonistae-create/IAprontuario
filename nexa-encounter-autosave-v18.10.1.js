/* NEXA v18.10.1 — persistent encounter autosave · offline-first */
(()=>{
'use strict';
if(window.__NEXA_ENCOUNTER_AUTOSAVE_V18_10_1__)return;
window.__NEXA_ENCOUNTER_AUTOSAVE_V18_10_1__=true;

const DB='nexa-encounter-autosave-v18101',STORE='encounters',ACTIVE='nexa-active-encounter-v18101';
const ARCHIVE_DB='nexa-encounter-conflict-archive-v1',ARCHIVE_STORE='snapshots';
const RESET='#resetBtn,#nexaRadarResetBtn,#nfClear,#nfTopClear,#nexaNewCaseBtn,#nexaTopReset';
const NAV='[data-go],[data-mobile-stage],[data-desk],#navAuditBtn,#navProtocolsBtn,#navAdminBtn,#coreAdminBtn,#nexaHomeNav';
const START='#recBtn,#nfStart';
const uuid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clone=x=>{try{return structuredClone(x)}catch{return JSON.parse(JSON.stringify(x))}};
const nowIso=()=>new Date().toISOString();
let storeAdapter=null,archiveAdapter=null,persistTimer=null,persistMaxTimer=null,flushPromise=null,retryTimer=null,pendingNew=false,currentId='';
let localPersistQueue=Promise.resolve();
let activeOwnerId=null,ownerSwitchRequiresExplicitEncounter=false;
const editedAfterReconciliation=new Set();
function serializeLocal(fn){const p=localPersistQueue.then(fn,fn);localPersistQueue=p.catch(()=>{});return p}
const syncInflight=new Map();
function sameLocalRevision(current,expected){
 return !!current&&current.owner_user_id===expected.owner_user_id&&current.encounter_id===expected.encounter_id&&
   Number(current.local_revision||0)===Number(expected.local_revision||0)&&
   current.last_client_saved_at===expected.last_client_saved_at&&current.sync_state===expected.sync_state;
}
async function putSyncResultIfCurrent(original,result){return store.comparePut(original,result)}

/* An in-flight save may succeed while the clinician enters newer data.
   Propagate only the server version from OUR confirmed write, not old fields. */
async function carryForwardOwnAck(original,remoteVersion){
 if(!Number.isInteger(remoteVersion)||remoteVersion<0)return false;
 for(let retry=0;retry<3;retry++){
  const latest=await store.get(original.encounter_id);
  if(!latest||latest.owner_user_id!==original.owner_user_id||
     latest.sync_state!=='pending'||['audited','discarded'].includes(latest.encounter_state)||
     Number(latest.local_revision||0)<=Number(original.local_revision||0)||
     Number(latest.sync_version||0)!==Number(original.sync_version||0))return false;
  const updated={...latest,sync_version:remoteVersion,server_updated_at:nowIso(),next_attempt_at:null};
  if(await store.comparePut(latest,updated))return true;
 }
 return false;
}


function client(){try{return window.nexaClinicalSupabase18101||null}catch{return null}}
function prof(){try{return window.nexaClinicalRuntime18121?.getProfile?.()||window.currentProf||(typeof currentProf!=='undefined'?currentProf:null)}catch{return window.currentProf||null}}
function owner(){return String(prof()?.id||'')}
function activeKey(userId=owner()){return `${ACTIVE}:${userId||'anon'}`}
function isUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''))}
function readSessionId(){try{return sessionStorage.getItem(activeKey())||''}catch{return''}}
function legacyHistoryId(){try{return typeof activeHistoryId!=='undefined'?String(activeHistoryId||''):''}catch{return''}}
function setLegacyHistoryId(id){try{if(typeof activeHistoryId!=='undefined')activeHistoryId=id}catch{}}
function ensureOwnerScope(){
 const userId=owner();
 if(activeOwnerId===null){activeOwnerId=userId;return false}
 if(activeOwnerId===userId)return false;
 // An in-tab account switch must never reuse a previous physician's global
 // encounter ID, form reconciliation flags or deferred autosave timers.
 activeOwnerId=userId;currentId='';
 window.__NEXA_ACTIVE_ENCOUNTER_ID__='';
 window.__NEXA_ACTIVE_HISTORY_ID__='';
 window.nexaActiveHistoryId='';
 setLegacyHistoryId('');
 if(document.documentElement?.dataset)delete document.documentElement.dataset.nexaEncounterId;
 editedAfterReconciliation.clear();
 cancelScheduledPersist();
 ownerSwitchRequiresExplicitEncounter=true;
 return true;
}
function assertOwnerStill(expected){
 if(!expected||owner()!==expected){
   ensureOwnerScope(); // Clear any stale global encounter pointer for the new owner.
   throw new Error('OWNER_CHANGED_DURING_CHECKPOINT');
 }
}
function setActiveId(id){
 ensureOwnerScope();
 id=String(id||'').trim();currentId=id;
 try{id?sessionStorage.setItem(activeKey(),id):sessionStorage.removeItem(activeKey())}catch{}
 window.__NEXA_ACTIVE_ENCOUNTER_ID__=id;window.__NEXA_ACTIVE_HISTORY_ID__=id;window.nexaActiveHistoryId=id;
 if(document.documentElement?.dataset){if(id)document.documentElement.dataset.nexaEncounterId=id;else delete document.documentElement.dataset.nexaEncounterId}
 if(id)setLegacyHistoryId(id);
 return id;
}
function currentEncounterId(){
 ensureOwnerScope();
 // Require explicit new encounter or owner-verified recovery after switching
 // accounts; an old visible form must not be saved under a different doctor.
 if(ownerSwitchRequiresExplicitEncounter)return '';
 const candidates=[currentId,readSessionId(),window.__NEXA_ACTIVE_ENCOUNTER_ID__,legacyHistoryId()];
 const id=candidates.map(x=>String(x||'').trim()).find(isUuid)||'';
 if(id&&id!==currentId)setActiveId(id);
 return id;
}
function rotateEncounter(){setActiveId('');return''}

function collectFields(){
 let out={};
 try{out=clone(window.nexaClinicalBridge18101?.collect?.()||window.collect?.()||{})}catch{}
 document.querySelectorAll?.('.field[data-key]').forEach?.(field=>{
   const key=field.dataset?.key;if(!key)return;
   const input=field.querySelector?.('textarea')||field.querySelector?.('input,select');if(input&&typeof input.value==='string')out[key]=input.value;
 });
 const extra={
   exames_sugeridos:document.getElementById?.('suggestedExams')?.value,
   prescricao:document.getElementById?.('suggestedPrescription')?.value,
   conduta:document.getElementById?.('conductRecordText')?.value
 };
 for(const[k,v]of Object.entries(extra))if(typeof v==='string'&&v.trim())out[k]=v;
 const clean={};for(const[k,v]of Object.entries(out||{}))if(typeof v==='string')clean[k]=v;
 return clean;
}
function meaningful(fields){return Object.values(fields||{}).some(v=>String(v||'').trim())}
function eligible(fields){
 const core=['queixa_principal','hda','exame_fisico','hipotese_diagnostica','conduta'].map(k=>String(fields?.[k]||'').trim());
 const n=core.filter(v=>v.length>=5).length;
 return core[1].length>=20||(core[0].length>=5&&n>=2)||n>=3;
}
function sessionState(){try{return String(window.nexaClinicalBridge18101?.state?.()||'idle')}catch{return'idle'}}
function processingMeta(reason){
 let bridge={};try{bridge=window.nexaClinicalBridge18101?.meta?.()||{}}catch{}
 let base={};try{base=clone(bridge.lastProcessedMeta||window.lastProcessedMeta||{})}catch{}
 let hypothesis={};try{hypothesis=clone(bridge.hypothesisReview||{})}catch{}
 let alternatives=[];try{alternatives=clone(bridge.alternatives||[])}catch{}
 let discarded=[];try{discarded=clone(bridge.discarded||[])}catch{}
 let plan={};try{plan=clone(bridge.clinicalPlan||{})}catch{}
 let radar={};try{radar=clone(window.nexaRadar?.snapshot?.()||{})}catch{}
 let destination={};try{destination=clone(window.nexaDestinationFlow18915?.state||{})}catch{}
 return {...base,encounter_autosave:{version:'18.10.1',reason,state:sessionState(),saved_at:nowIso(),radar,hypothesisReview:hypothesis,alternatives,discarded,clinicalPlan:plan,destination}};
}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){const s=db.createObjectStore(STORE,{keyPath:'encounter_id'});s.createIndex('owner_user_id','owner_user_id',{unique:false});s.createIndex('sync_state','sync_state',{unique:false})}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('ENCOUNTER_IDB_OPEN_FAILED'))})}
async function idbGet(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
async function idbPut(item){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(clone(item));tx.oncomplete=()=>{db.close();resolve(clone(item))};tx.onerror=()=>{db.close();reject(tx.error||new Error('ENCOUNTER_IDB_WRITE_FAILED'))}})}
async function idbComparePut(expected,item){
 const db=await openDb();return new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite'),table=tx.objectStore(STORE),req=table.get(expected.encounter_id);
   let accepted=false;
   req.onsuccess=()=>{if(sameLocalRevision(req.result,expected)){table.put(clone(item));accepted=true}};
   tx.oncomplete=()=>{db.close();resolve(accepted)};
   tx.onabort=()=>{db.close();reject(tx.error||new Error('ENCOUNTER_COMPARE_WRITE_FAILED'))};
   tx.onerror=()=>{db.close()};
 });
}
async function archiveConflictCopies(local,remote,choice){
 if(archiveAdapter)return archiveAdapter(clone(local),clone(remote),choice);
 const db=await new Promise((resolve,reject)=>{
   const req=indexedDB.open(ARCHIVE_DB,1);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(ARCHIVE_STORE))req.result.createObjectStore(ARCHIVE_STORE,{keyPath:'backup_id'})};
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('CONFLICT_ARCHIVE_OPEN_FAILED'));
 });
 return new Promise((resolve,reject)=>{
   const tx=db.transaction(ARCHIVE_STORE,'readwrite');
   tx.objectStore(ARCHIVE_STORE).put({
     backup_id:uuid(),owner_user_id:local.owner_user_id,encounter_id:local.encounter_id,
     archived_at:nowIso(),choice,local:clone(local),server:clone(remote)
   });
   tx.oncomplete=()=>{db.close();resolve(true)};
   tx.onabort=()=>{db.close();reject(tx.error||new Error('CONFLICT_ARCHIVE_WRITE_FAILED'))};
   tx.onerror=()=>{db.close()};
 });
}
async function idbAll(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
const store={
 get:id=>storeAdapter?.get?storeAdapter.get(id):idbGet(id),
 put:item=>storeAdapter?.put?storeAdapter.put(clone(item)):idbPut(item),
 all:()=>storeAdapter?.all?storeAdapter.all():idbAll(),
 comparePut:async(expected,item)=>{
   if(storeAdapter?.comparePut)return storeAdapter.comparePut(clone(expected),clone(item));
   if(storeAdapter?.put){const latest=await store.get(expected.encounter_id);if(!sameLocalRevision(latest,expected))return false;await store.put(item);return true}
   return idbComparePut(expected,item);
 }
};

function isAuthFailure(error){
 const code=String(error?.code||''),status=Number(error?.status||error?.statusCode||0),msg=String(error?.message||'');
 return status===401||code==='PGRST301'||/JWT.*(?:expired|invalid)|invalid.*JWT|token.*expired|unauthorized|not authenticated/i.test(msg);
}
async function withSessionRetry(c,expectedOwner,operation){
 try{return await operation()}catch(error){
  if(!isAuthFailure(error))throw error;
  const renewed=await c?.auth?.refreshSession?.();
  if(renewed?.error||!renewed?.data?.session?.access_token||
     String(renewed.data.session.user?.id||'')!==String(expectedOwner))
    throw new Error('AUTH_RELOGIN_REQUIRED');
  return await operation(); // Same owner and CAS version. No privilege changes.
 }
}
function backoff(attempt){return Math.min(300000,3000*Math.pow(2,Math.max(0,attempt-1)))}
function due(item){return !item?.next_attempt_at||new Date(item.next_attempt_at).getTime()<=Date.now()}
async function buildLocal(reason='autosave',forcedId='',capturedFields=null,expectedOwner=owner()){
 assertOwnerStill(expectedOwner);
 const userId=expectedOwner;
 let id=String(forcedId||currentEncounterId()||'').trim();if(!isUuid(id))id=uuid();setActiveId(id);
 const previous=await store.get(id);
 assertOwnerStill(expectedOwner); // IndexedDB may have yielded during account change.
 if(previous&&previous.owner_user_id!==userId)throw new Error('ENCOUNTER_OWNER_MISMATCH');
 const fields=capturedFields===null?collectFields():clone(capturedFields);
 // A terminal or server-locked snapshot must remain byte-for-byte immutable
 // in IndexedDB as well as remotely. The prior implementation regenerated
 // it from the visible form and silently changed local clinical history.
 if(previous&&(['audited','discarded'].includes(previous.encounter_state)||
     previous.sync_state==='locked')){
  const stored=previous.fields||{},keys=Object.keys(stored);
  const unchanged=Object.keys(fields).length===keys.length&&
   keys.every(k=>Object.prototype.hasOwnProperty.call(fields,k)&&fields[k]===stored[k]);
  if(!unchanged)throw new Error('LOCKED_ENCOUNTER_IMMUTABLE');
  return previous;
 }
 const ready=eligible(fields),ts=nowIso();
 const needsReview=!!previous?.requires_form_refresh&&JSON.stringify(fields)!==JSON.stringify(previous.fields||{});
 const remainsConflict=previous?.sync_state==='conflict'||needsReview;
 const terminal=['audited','discarded'].includes(previous?.encounter_state);
 const wasReady=previous?.encounter_state==='ready_for_audit';
 const state=terminal?previous.encounter_state:(wasReady||ready)?'ready_for_audit':'draft';
 const rec={
   encounter_id:id,owner_user_id:userId,fields,encounter_state:state,
   protocol_usage:clone(window.__NEXA_PROTOCOL_USAGE__||previous?.protocol_usage||[]),
   audit_priority:Number(previous?.audit_priority||0),
   audit_ready_at:state==='ready_for_audit'?(previous?.audit_ready_at||ts):null,
   consent_recorded_at:previous?.consent_recorded_at||(()=>{try{return lastProcessedMeta?.consentRecordedAt||null}catch{return null}})(),
   processing_meta:processingMeta(reason),
   created_at:previous?.created_at||ts,last_client_saved_at:ts,
   sync_state:(terminal||previous?.sync_state==='locked')?'locked':remainsConflict?'conflict':'pending',requires_form_refresh:needsReview,attempt_count:Number(previous?.attempt_count||0),
   next_attempt_at:null,last_error:null,server_updated_at:previous?.server_updated_at||null,
   sync_version:Number(previous?.sync_version||0),local_revision:Number(previous?.local_revision||0)+1,legacy_status:previous?.legacy_status||'draft'
 };
 return rec;
}
function remotePayload(rec){return{
 id:rec.encounter_id,encounter_id:rec.encounter_id,user_id:rec.owner_user_id,
 fields:rec.fields||{},status:rec.legacy_status||'draft',encounter_state:rec.encounter_state,
 protocol_usage:Array.isArray(rec.protocol_usage)?rec.protocol_usage:[],
 audit_priority:Number(rec.audit_priority||0),audit_ready_at:rec.audit_ready_at||null,
 consent_recorded_at:rec.consent_recorded_at||null,last_client_saved_at:rec.last_client_saved_at||nowIso(),
 processing_meta:rec.processing_meta||{},created_at:rec.created_at||nowIso()
}}
async function syncOne(rec){
 if(rec?.encounter_id&&syncInflight.has(rec.encounter_id))return syncInflight.get(rec.encounter_id);
 const task=(async()=>{
 if(!rec||rec.owner_user_id!==owner())return{skipped:true};
 if(rec.sync_state==='conflict')return{sent:false,conflict:true,item:rec};
 if(['audited','discarded'].includes(rec.encounter_state)||rec.sync_state==='locked')return{locked:true,item:rec};
 // A blank new encounter is a local placeholder, not a server-side consultation.
 if(rec.encounter_state==='draft'&&!meaningful(rec.fields)&&!rec.audit_ready_at)return{sent:false,empty:true,item:rec};
 const c=client();if(!c)return{sent:false,error:'NO_CLIENT'};
 const attempt=Number(rec.attempt_count||0)+1;
 try{
   // One authenticated compare-and-swap attempt, with one JWT renewal on 401.
   const columns='id,encounter_id,encounter_state,audit_priority,audit_ready_at,updated_at,sync_version,status';
   const payload=remotePayload(rec),expected=Number(rec.sync_version||0);
   const performWrite=async()=>{
    const table=c.from('consultation_history');
    let data=null,error=null;
    if(expected>0){
     const update=await table.update(payload).eq('id',rec.encounter_id).eq('user_id',rec.owner_user_id).eq('sync_version',expected).select(columns).maybeSingle();
     data=update.data;error=update.error;
    }else{
     const found=await table.select('sync_version').eq('id',rec.encounter_id).eq('user_id',rec.owner_user_id).maybeSingle();
     if(found.error)throw found.error;
     if(found.data){
      const update=await c.from('consultation_history').update(payload).eq('id',rec.encounter_id).eq('user_id',rec.owner_user_id).eq('sync_version',expected).select(columns).maybeSingle();
      data=update.data;error=update.error;
     }else{
      const insert=await c.from('consultation_history').insert(payload).select(columns).single();
      data=insert.data;error=insert.error;
      if(error?.code==='23505'){error=null;data=null}
     }
    }
    if(error)throw error;
    return data;
   };
   const data=await withSessionRetry(c,rec.owner_user_id,performWrite);
   if(!data){
     const current=await withSessionRetry(c,rec.owner_user_id,async()=>{
      const result=await c.from('consultation_history').select('sync_version,encounter_state').eq('id',rec.encounter_id).eq('user_id',rec.owner_user_id).maybeSingle();
      if(result.error)throw result.error;
      return result.data;
     });
     if(current){
       const conflict={...rec,sync_state:'conflict',last_error:'SERVER_VERSION_CONFLICT',next_attempt_at:null};
       if(!(await putSyncResultIfCurrent(rec,conflict)))return{sent:false,stale:true};
       window.dispatchEvent(new CustomEvent('nexa:encounter-sync-conflict',{detail:{encounter_id:rec.encounter_id}}));
       return{sent:false,conflict:true,item:conflict};
     }
     throw new Error('SYNC_ROW_NOT_WRITABLE');
   }
   const remoteState=data?.encounter_state||rec.encounter_state;
   const terminal=['audited','discarded'].includes(remoteState);
   const saved={...rec,sync_state:terminal?'locked':'synced',attempt_count:attempt,next_attempt_at:null,last_error:null,server_updated_at:data?.updated_at||nowIso(),sync_version:Number(data?.sync_version||rec.sync_version||0),legacy_status:data?.status||rec.legacy_status||'draft',encounter_state:remoteState,audit_ready_at:data?.audit_ready_at||rec.audit_ready_at};
   if(!(await putSyncResultIfCurrent(rec,saved))){
   if(!terminal)await carryForwardOwnAck(rec,Number(data?.sync_version));
   return{sent:false,stale:true};
  }window.dispatchEvent(new CustomEvent(terminal?'nexa:encounter-locked':'nexa:encounter-synced',{detail:{encounter_id:rec.encounter_id,state:saved.encounter_state}}));return{sent:!terminal,locked:terminal,item:saved};
 }catch(error){
   try{
     const {data:remote}=await c.from('consultation_history').select('id,encounter_id,encounter_state,updated_at,sync_version,status').eq('id',rec.encounter_id).eq('user_id',rec.owner_user_id).maybeSingle();
     if(remote&&['audited','discarded'].includes(remote.encounter_state)){
       const locked={...rec,sync_state:'locked',encounter_state:remote.encounter_state,attempt_count:attempt,next_attempt_at:null,last_error:null,server_updated_at:remote.updated_at||rec.server_updated_at||null,sync_version:Number(remote.sync_version||rec.sync_version||0),legacy_status:remote.status||rec.legacy_status||'draft'};
       if(!(await putSyncResultIfCurrent(rec,locked)))return{sent:false,stale:true};window.dispatchEvent(new CustomEvent('nexa:encounter-locked',{detail:{encounter_id:rec.encounter_id,state:locked.encounter_state}}));return{sent:false,locked:true,item:locked};
     }
   }catch{}
   const saved={...rec,sync_state:'pending',attempt_count:attempt,last_error:String(error?.message||error||'SYNC_FAILED'),next_attempt_at:new Date(Date.now()+backoff(attempt)).toISOString()};
   if(!(await putSyncResultIfCurrent(rec,saved)))return{sent:false,stale:true};window.dispatchEvent(new CustomEvent('nexa:encounter-sync-failed',{detail:{encounter_id:rec.encounter_id,error:saved.last_error}}));return{sent:false,error:saved.last_error,item:saved};
 }
})();
 if(rec?.encounter_id)syncInflight.set(rec.encounter_id,task);
 try{return await task}finally{
  if(rec?.encounter_id&&syncInflight.get(rec.encounter_id)===task){
    syncInflight.delete(rec.encounter_id);
    // A newer local draft may have arrived while the request was in flight.
    // Retry only that pending draft; never overwrite it with the older response.
    try{
      const latest=await store.get(rec.encounter_id);
      if(latest?.owner_user_id===owner()&&latest.sync_state==='pending'&&Number(latest.local_revision||0)!==Number(rec.local_revision||0)&&navigator.onLine!==false){
        setTimeout(()=>void syncOne(latest),0);
      }
    }catch{console.warn('NEXA pending encounter retry deferred')}
  }
}
}
async function preserve(reason='autosave',{sync=true}={}){
 const capturedOwner=owner();
 ensureOwnerScope();
 if(ownerSwitchRequiresExplicitEncounter)throw new Error('OWNER_SWITCH_REQUIRES_NEW_OR_RECOVERED_ENCOUNTER');
 // A manual/navigation/reset save consumes the pending debounce and max-wait.
 // Capturing here must precede any asynchronous IndexedDB work.
 cancelScheduledPersist();
 // Capture before queued IndexedDB work: Reset/pagehide may clear the visible form.
 const existingId=currentEncounterId(),fields=collectFields();
 return serializeLocal(async()=>{
 if(owner()!==capturedOwner)throw new Error('OWNER_CHANGED_DURING_CHECKPOINT');
 const passiveWithoutEncounter=new Set(['before_reset','navigation','logout','pagehide','beforeunload','hidden','offline']);
 if(!existingId&&!meaningful(fields)&&passiveWithoutEncounter.has(reason))return null;
 // After choosing server/merge the old on-screen form must be refreshed. Browser
 // pagehide, navigation and timers must not recreate a conflict with stale
 // screen values unless an intentional clinical input was made afterwards.
 const previous=existingId?await store.get(existingId):null;
 assertOwnerStill(capturedOwner);
 if(previous?.requires_form_refresh&&!editedAfterReconciliation.has(existingId)&&!['input','change'].includes(reason))return previous;
 const rec=await buildLocal(reason,existingId,fields,capturedOwner);if(!rec)return null;
 assertOwnerStill(capturedOwner);
 // A no-op checkpoint for an unchanged locked note is not a new write or ACK.
 if(['audited','discarded'].includes(rec.encounter_state)||
    rec.sync_state==='locked')return rec;
 await store.put(rec);
 assertOwnerStill(capturedOwner);
 editedAfterReconciliation.delete(rec.encounter_id);
 window.dispatchEvent(new CustomEvent('nexa:encounter-local-saved',{detail:{encounter_id:rec.encounter_id,state:rec.encounter_state,reason}}));
 if(rec.sync_state==='conflict')window.dispatchEvent(new CustomEvent('nexa:encounter-sync-conflict',{detail:{encounter_id:rec.encounter_id}}));
 if(sync&&rec.sync_state!=='conflict'&&navigator.onLine!==false)void syncOne(rec);
 return rec;
})}
async function startNew(reason='new_encounter'){
 ensureOwnerScope();
 const userId=owner(),capturedFields=collectFields();
 // A second physician must never inherit note text left in the first
 // physician's form. Require the form to be cleared before opening a draft.
 if(ownerSwitchRequiresExplicitEncounter&&meaningful(capturedFields))
   throw new Error('OWNER_SWITCH_REQUIRES_CLEAR_FORM');
 // The canonical reset creates a new ID only after clearing the visible form.
 // If clearing failed, never copy the previous patient's text into a fresh ID.
 if(reason==='after_reset'&&meaningful(capturedFields))
   throw new Error('NEW_ENCOUNTER_REQUIRES_EMPTY_FORM');
 return serializeLocal(async()=>{
 if(!userId||owner()!==userId)return null;
 const priorId=currentEncounterId();
 if(priorId){
  const prior=await store.get(priorId);
  assertOwnerStill(userId);
  if(prior&&prior.owner_user_id!==userId)
   throw new Error('ENCOUNTER_OWNER_MISMATCH');
  // An active prior consultation (including an ordinary draft) cannot be
 // duplicated as a new encounter merely by generating another UUID.
 if(meaningful(capturedFields)&&priorId){
  if(!prior)throw new Error('ACTIVE_ENCOUNTER_NOT_RECOVERED');
  if(['audited','discarded'].includes(prior.encounter_state)||
     prior.sync_state==='locked')
   throw new Error('LOCKED_ENCOUNTER_REQUIRES_EMPTY_FORM');
  throw new Error('NEW_ENCOUNTER_REQUIRES_EMPTY_FORM');
 }
 }
 const id=uuid();setActiveId(id);
 const rec=await buildLocal(reason,id,capturedFields,userId);if(!rec)return null;
 assertOwnerStill(userId);
 await store.put(rec);
 assertOwnerStill(userId);
 ownerSwitchRequiresExplicitEncounter=false;
 if(navigator.onLine!==false)void syncOne(rec);
 window.dispatchEvent(new CustomEvent('nexa:encounter-started',{detail:{encounter_id:id}}));return rec;
})}
async function adoptExisting(rowOrId){
 ensureOwnerScope();
 const userId=owner(),id=String(typeof rowOrId==='object'?(rowOrId?.encounter_id||rowOrId?.id):rowOrId||'').trim();
 if(!userId||!isUuid(id))return null;
 const row=typeof rowOrId==='object'?rowOrId:{};
 const rowOwner=String(row.owner_user_id||row.user_id||'');
 if(rowOwner&&rowOwner!==userId)throw new Error('ENCOUNTER_OWNER_MISMATCH');
 const existing=await store.get(id);
 assertOwnerStill(userId);
 if(existing&&existing.owner_user_id!==userId)throw new Error('ENCOUNTER_OWNER_MISMATCH');
 let selected=existing;
 const remoteVersion=Number(row.sync_version),localVersion=Number(existing?.sync_version||0);
 // A pending or conflicted local draft always wins. Conversely, a strictly
 // newer, authenticated server revision must not be masked by an old local
 // record that has already been fully synchronized.
 const newerSyncedRemote=!!existing&&existing.sync_state==='synced'&&
   rowOwner===userId&&row.fields&&typeof row.fields==='object'&&!Array.isArray(row.fields)&&
   Number.isInteger(remoteVersion)&&remoteVersion>localVersion;
 if(newerSyncedRemote){
   const hydrated={...existing,
     fields:clone(row.fields),
     processing_meta:row.processing_meta&&typeof row.processing_meta==='object'
       ?clone(row.processing_meta):existing.processing_meta,
     protocol_usage:Array.isArray(row.protocol_usage)?clone(row.protocol_usage):existing.protocol_usage,
     encounter_state:row.encounter_state||existing.encounter_state,
     legacy_status:row.status||existing.legacy_status,
     audit_priority:row.audit_priority===undefined?existing.audit_priority:Number(row.audit_priority||0),
     audit_ready_at:Object.prototype.hasOwnProperty.call(row,'audit_ready_at')?row.audit_ready_at:existing.audit_ready_at,
     consent_recorded_at:Object.prototype.hasOwnProperty.call(row,'consent_recorded_at')?row.consent_recorded_at:existing.consent_recorded_at,
     server_updated_at:row.updated_at||existing.server_updated_at,
     last_client_saved_at:row.last_client_saved_at||row.updated_at||existing.last_client_saved_at,
     sync_version:remoteVersion,local_revision:Number(existing.local_revision||0)+1,
     sync_state:'synced',attempt_count:0,next_attempt_at:null,last_error:null,requires_form_refresh:false
   };
   // A newer local edit may arrive while the remote copy is being adopted.
   // Never overwrite it; use the record currently persisted by IndexedDB.
   const updated=await store.comparePut(existing,hydrated);
   assertOwnerStill(userId);
   selected=updated?hydrated:await store.get(id);
   assertOwnerStill(userId);
   if(!selected||selected.owner_user_id!==userId)throw new Error('ENCOUNTER_OWNER_MISMATCH');
 }
 // Only an owner-verified, committed local record may become active.
 setActiveId(id);
 if(selected){ownerSwitchRequiresExplicitEncounter=false;return selected}
 window.__NEXA_PROTOCOL_USAGE__=Array.isArray(row.protocol_usage)?clone(row.protocol_usage):[];const rec={encounter_id:id,owner_user_id:userId,fields:clone(row.fields||{}),encounter_state:row.encounter_state||'draft',protocol_usage:clone(window.__NEXA_PROTOCOL_USAGE__),audit_priority:Number(row.audit_priority||0),audit_ready_at:row.audit_ready_at||null,consent_recorded_at:row.consent_recorded_at||null,processing_meta:clone(row.processing_meta||{}),created_at:row.created_at||nowIso(),last_client_saved_at:row.updated_at||nowIso(),sync_state:'synced',attempt_count:0,next_attempt_at:null,last_error:null,server_updated_at:row.updated_at||null,sync_version:Number(row.sync_version||0),local_revision:0,legacy_status:row.status||'draft'};
 await store.put(rec);
 assertOwnerStill(userId);
 ownerSwitchRequiresExplicitEncounter=false;return rec;
}
async function prioritize(){
 const userId=owner();ensureOwnerScope();
 if(ownerSwitchRequiresExplicitEncounter)throw new Error('OWNER_SWITCH_REQUIRES_NEW_OR_RECOVERED_ENCOUNTER');
 return serializeLocal(async()=>{
 assertOwnerStill(userId);
 const rec=await buildLocal('manual_priority','',null,userId);
 if(!rec)return null;
 if(['audited','discarded'].includes(rec.encounter_state)||['conflict','locked'].includes(rec.sync_state))return rec;
 rec.audit_priority=Math.max(1,Number(rec.audit_priority||0));
 assertOwnerStill(userId);
 await store.put(rec);assertOwnerStill(userId);
 if(navigator.onLine!==false)void syncOne(rec);
 return rec;
 })}
async function reviewConflict(id){
 const local=await store.get(id);
 if(!local||local.owner_user_id!==owner()||local.sync_state!=='conflict')throw new Error('CONFLICT_NOT_AVAILABLE');
 const c=client();if(!c)throw new Error('OFFLINE_REVIEW_UNAVAILABLE');
 const {data,error}=await c.from('consultation_history')
   .select('id,user_id,fields,status,encounter_state,protocol_usage,audit_priority,audit_ready_at,updated_at,sync_version')
   .eq('id',id).eq('user_id',local.owner_user_id).maybeSingle();
 if(error)throw new Error('CONFLICT_REMOTE_READ_FAILED');
 if(!data)throw new Error('CONFLICT_REMOTE_NOT_FOUND');
 return{local:clone(local),remote:clone(data)};
}
function reconcileFields(local,remote,mode,decisions){
 if(mode==='local')return clone(local);
 if(mode==='server')return clone(remote);
 if(mode!=='merge'||!decisions||typeof decisions!=='object')throw new Error('INVALID_RESOLUTION_MODE');
 const out={};const keys=new Set([...Object.keys(local||{}),...Object.keys(remote||{})]);
 for(const key of keys){
   const lv=typeof local?.[key]==='string'?local[key]:'';
   const rv=typeof remote?.[key]==='string'?remote[key]:'';
   if(lv===rv){if(lv!==''||Object.prototype.hasOwnProperty.call(local||{},key)||Object.prototype.hasOwnProperty.call(remote||{},key))out[key]=lv;continue}
   const pick=decisions[key];
   if(!pick||!['local','server','manual'].includes(pick.source))throw new Error('FIELD_DECISION_REQUIRED');
   if(pick.source==='manual'&&typeof pick.value!=='string')throw new Error('INVALID_FIELD_VALUE');
   out[key]=pick.source==='local'?lv:pick.source==='server'?rv:pick.value;
 }
 return out;
}
async function resolveConflict({id,expectedVersion,localRevision,localSavedAt,mode,decisions}){
 const initial=await store.get(id);
 if(!initial||initial.owner_user_id!==owner()||initial.sync_state!=='conflict')throw new Error('CONFLICT_NOT_AVAILABLE');
 if(Number(initial.local_revision||0)!==Number(localRevision||0)||initial.last_client_saved_at!==localSavedAt)throw new Error('LOCAL_CHANGED_REVIEW_AGAIN');
 if(syncInflight.has(id))await syncInflight.get(id);
 const current=await store.get(id);
 if(!sameLocalRevision(current,initial))throw new Error('LOCAL_CHANGED_REVIEW_AGAIN');
 const c=client();if(!c||navigator.onLine===false)throw new Error('OFFLINE_RESOLUTION_UNAVAILABLE');
 const remoteResult=await reviewConflict(id);
 const remote=remoteResult.remote;
 if(Number(remote.sync_version||0)!==Number(expectedVersion))throw new Error('REMOTE_CHANGED_REVIEW_AGAIN');
 const fields=reconcileFields(current.fields||{},remote.fields||{},mode,decisions);
 // A durable backup of BOTH copies must exist before any resolution mutates them.
 await archiveConflictCopies(current,remote,mode);
 if(mode==='server'){
   const verify=await reviewConflict(id);
   if(Number(verify.remote.sync_version||0)!==Number(expectedVersion))throw new Error('REMOTE_CHANGED_REVIEW_AGAIN');
   const saved={...current,fields:clone(remote.fields||{}),encounter_state:remote.encounter_state,
     audit_priority:Number(remote.audit_priority||0),audit_ready_at:remote.audit_ready_at||null,
     protocol_usage:clone(remote.protocol_usage||[]),legacy_status:remote.status||'draft',
     sync_version:Number(remote.sync_version||0),server_updated_at:remote.updated_at||null,
     sync_state:['audited','discarded'].includes(remote.encounter_state)?'locked':'synced',
     requires_form_refresh:true,next_attempt_at:null,last_error:null};
   if(!(await store.comparePut(current,saved)))throw new Error('LOCAL_CHANGED_REVIEW_AGAIN');
   editedAfterReconciliation.delete(id);
   window.dispatchEvent(new CustomEvent('nexa:encounter-conflict-resolved',{detail:{encounter_id:id,choice:'server'}}));
   return{resolved:true,item:saved};
 }
 if(['audited','discarded'].includes(remote.encounter_state))throw new Error('SERVER_RECORD_LOCKED');
 const {data,error}=await c.from('consultation_history')
   .update({fields,last_client_saved_at:nowIso()})
   .eq('id',id).eq('user_id',current.owner_user_id)
   .eq('sync_version',Number(expectedVersion))
   .select('id,encounter_state,sync_version,updated_at,status,audit_priority,audit_ready_at').maybeSingle();
 if(error)throw new Error('CONFLICT_RESOLUTION_WRITE_FAILED');
 if(!data)throw new Error('REMOTE_CHANGED_REVIEW_AGAIN');
 const saved={...current,fields:clone(fields),sync_state:'synced',requires_form_refresh:mode==='merge',last_error:null,next_attempt_at:null,
   sync_version:Number(data.sync_version||0),server_updated_at:data.updated_at||nowIso(),
   encounter_state:data.encounter_state||current.encounter_state,legacy_status:data.status||current.legacy_status,
   audit_priority:Number(data.audit_priority||current.audit_priority||0),audit_ready_at:data.audit_ready_at||current.audit_ready_at};
 // A local edit made during the remote write stays untouched and requires a new review.
 if(!(await store.comparePut(current,saved)))throw new Error('LOCAL_CHANGED_REVIEW_AGAIN');
 editedAfterReconciliation.delete(id);
 window.dispatchEvent(new CustomEvent('nexa:encounter-conflict-resolved',{detail:{encounter_id:id,choice:mode}}));
 return{resolved:true,item:saved};
}
function cancelScheduledPersist(){
 clearTimeout(persistTimer);clearTimeout(persistMaxTimer);
 persistTimer=null;persistMaxTimer=null;
}
function reportLocalSaveFailure(reason){
 // Deferred IndexedDB writes previously rejected without any visible alert.
 // Never include patient fields or storage exception text in the event.
 console.warn('[NEXA] Local clinical checkpoint not confirmed',String(reason||'autosave'));
 window.dispatchEvent(new CustomEvent('nexa:encounter-local-save-failed',{
   detail:{reason:String(reason||'autosave'),code:'LOCAL_CHECKPOINT_FAILED'}
 }));
}
function preserveDeferred(reason,options){
 void preserve(reason,options).catch(()=>reportLocalSaveFailure(reason));
}
function schedulePersist(reason='input'){
 // Trailing 350 ms debounce and 5 s maximum wait preserve the same cadence.
 // Every delayed failure must alert the physician instead of rejecting silently.
 clearTimeout(persistTimer);
 persistTimer=setTimeout(()=>preserveDeferred(reason),350);
 if(persistMaxTimer===null)persistMaxTimer=setTimeout(()=>preserveDeferred('input_max_wait'),5000);
}
function scheduleRetry(items){clearTimeout(retryTimer);retryTimer=null;const pending=items.filter(x=>x.owner_user_id===owner()&&!['synced','locked','conflict'].includes(x.sync_state)&&x.next_attempt_at);if(!pending.length)return;const at=Math.min(...pending.map(x=>new Date(x.next_attempt_at).getTime()).filter(Number.isFinite));retryTimer=setTimeout(()=>void flush('retry'),Math.max(500,Math.min(300000,at-Date.now())))}
async function flush(reason='manual'){
 if(flushPromise)return flushPromise;flushPromise=(async()=>{const userId=owner();if(!userId)return{sent:0,pending:0,reason:'no_owner'};let items=await store.all(),sent=0;for(const rec of items.filter(x=>x.owner_user_id===userId&&!['synced','locked','conflict'].includes(x.sync_state)&&due(x))){const r=await syncOne(rec);if(r.sent)sent++}items=await store.all();scheduleRetry(items);return{sent,pending:items.filter(x=>x.owner_user_id===userId&&!['synced','locked','conflict'].includes(x.sync_state)).length,reason}})().finally(()=>{flushPromise=null});return flushPromise;
}
function isClinicalEdit(event){
 const target=event?.target;
 if(!target?.matches?.('textarea,input,select'))return false;
 // The conflict dialog itself contains radio buttons, textareas and a final
 // confirmation checkbox. None of those are clinical-form edits. Previously
 // they triggered autosave, incremented local_revision during review and made
 // all resolution actions fail with LOCAL_CHANGED_REVIEW_AGAIN.
 if(target.closest?.('#nexa-c-overlay,#nexa-c-banner,#nexa-c-status'))return false;
 return true;
}
function bind(){
 document.addEventListener('input',e=>{if(isClinicalEdit(e)){const id=currentEncounterId();if(id)editedAfterReconciliation.add(id);schedulePersist('input')}},true);
 document.addEventListener('change',e=>{if(isClinicalEdit(e)){const id=currentEncounterId();if(id)editedAfterReconciliation.add(id);schedulePersist('change')}},true);
 document.addEventListener('click',e=>{
   if(e.target?.closest?.('#nexa-c-overlay,#nexa-c-banner,#nexa-c-status'))return;
   if(e.target?.closest?.(START)){if(!currentEncounterId())void startNew('recording_start').catch(()=>reportLocalSaveFailure('recording_start'));else preserveDeferred('recording_start');return}
   if(e.target?.closest?.(RESET)){if(window.nexaAuditOutbox18919?.beforeReset)return;pendingNew=true;preserveDeferred('before_reset');return}
   if(e.target?.closest?.('#logoutBtn')){preserveDeferred('logout');return}
   if(e.target?.closest?.(NAV))preserveDeferred('navigation');
 },true);
 window.addEventListener('nexa:consultation-reset',()=>{if(!pendingNew)return;pendingNew=false;rotateEncounter();setTimeout(()=>void startNew('after_reset').catch(()=>reportLocalSaveFailure('after_reset')),0)});
 addEventListener('pagehide',()=>{preserveDeferred('pagehide',{sync:false})});
 addEventListener('beforeunload',()=>{preserveDeferred('beforeunload',{sync:false})});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)preserveDeferred('hidden',{sync:false});else void flush('visible')});
 addEventListener('online',()=>void flush('online'));
 addEventListener('offline',()=>preserveDeferred('offline',{sync:false}));
 addEventListener('focus',()=>void flush('focus'));
 addEventListener('nexa:encounter-flush-request',()=>void flush('event'));
 addEventListener('nexa:encounter-priority-request',()=>void prioritize().catch(()=>reportLocalSaveFailure('manual_priority')));
 setTimeout(()=>void flush('startup'),800);
}
bind();

window.nexaEncounterAutosave18101={DB,STORE,currentEncounterId,setActiveId,rotateEncounter,startNew,adoptExisting,preserve,prioritize,flush,syncOne,buildLocal,eligible,meaningful,collectFields,get:store.get,put:store.put,all:store.all,reviewConflict,resolveConflict,reconcileFields,setStoreAdapter:a=>{storeAdapter=a||null},setArchiveAdapter:a=>{archiveAdapter=a||null}};
})();

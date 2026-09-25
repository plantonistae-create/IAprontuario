/* NEXA v18.10.1 — persistent encounter autosave · offline-first */
(()=>{
'use strict';
if(window.__NEXA_ENCOUNTER_AUTOSAVE_V18_10_1__)return;
window.__NEXA_ENCOUNTER_AUTOSAVE_V18_10_1__=true;

const DB='nexa-encounter-autosave-v18101',STORE='encounters',ACTIVE='nexa-active-encounter-v18101';
const RESET='#resetBtn,#nexaRadarResetBtn,#nfClear,#nfTopClear,#nexaNewCaseBtn,#nexaTopReset';
const NAV='[data-go],[data-mobile-stage],[data-desk],#navAuditBtn,#navProtocolsBtn,#navAdminBtn,#coreAdminBtn,#nexaHomeNav';
const START='#recBtn,#nfStart';
const uuid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clone=x=>{try{return structuredClone(x)}catch{return JSON.parse(JSON.stringify(x))}};
const nowIso=()=>new Date().toISOString();
let storeAdapter=null,persistTimer=null,flushPromise=null,retryTimer=null,pendingNew=false,currentId='';

function client(){try{return window.nexaClinicalSupabase18101||null}catch{return null}}
function prof(){try{return typeof currentProf!=='undefined'?currentProf:null}catch{return null}}
function owner(){return String(prof()?.id||'')}
function activeKey(userId=owner()){return `${ACTIVE}:${userId||'anon'}`}
function isUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''))}
function readSessionId(){try{return sessionStorage.getItem(activeKey())||''}catch{return''}}
function legacyHistoryId(){try{return typeof activeHistoryId!=='undefined'?String(activeHistoryId||''):''}catch{return''}}
function setLegacyHistoryId(id){try{if(typeof activeHistoryId!=='undefined')activeHistoryId=id}catch{}}
function setActiveId(id){
 id=String(id||'').trim();currentId=id;
 try{id?sessionStorage.setItem(activeKey(),id):sessionStorage.removeItem(activeKey())}catch{}
 window.__NEXA_ACTIVE_ENCOUNTER_ID__=id;window.__NEXA_ACTIVE_HISTORY_ID__=id;window.nexaActiveHistoryId=id;
 if(document.documentElement?.dataset){if(id)document.documentElement.dataset.nexaEncounterId=id;else delete document.documentElement.dataset.nexaEncounterId}
 if(id)setLegacyHistoryId(id);
 return id;
}
function currentEncounterId(){
 const candidates=[currentId,window.__NEXA_ACTIVE_ENCOUNTER_ID__,readSessionId(),legacyHistoryId()];
 const id=candidates.map(x=>String(x||'').trim()).find(isUuid)||'';
 if(id&&id!==currentId)setActiveId(id);
 return id;
}
function rotateEncounter(){setActiveId('');return''}

function collectFields(){
 let out={};
 try{if(typeof collect==='function')out=clone(collect()||{})}catch{}
 document.querySelectorAll?.('.field[data-key]').forEach?.(field=>{
   const key=field.dataset?.key;if(!key)return;
   const input=field.querySelector?.('textarea,input,select');if(input&&typeof input.value==='string')out[key]=input.value;
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
function sessionState(){try{return typeof nexaSessionState!=='undefined'?String(nexaSessionState||'idle'):'idle'}catch{return'idle'}}
function processingMeta(reason){
 let base={};try{base=clone(typeof lastProcessedMeta!=='undefined'&&lastProcessedMeta?lastProcessedMeta:{})}catch{}
 let hypothesis={};try{hypothesis=clone(typeof hypothesisReview!=='undefined'&&hypothesisReview?hypothesisReview:{})}catch{}
 let alternatives=[];try{alternatives=clone(typeof nexaAlternativeHypotheses!=='undefined'?nexaAlternativeHypotheses:[])}catch{}
 let discarded=[];try{discarded=clone(typeof nexaDiscardedHypotheses!=='undefined'?nexaDiscardedHypotheses:[])}catch{}
 let plan={};try{plan=clone(typeof clinicalPlanCache!=='undefined'&&clinicalPlanCache?clinicalPlanCache:{})}catch{}
 let radar={};try{radar=clone(window.nexaRadar?.snapshot?.()||{})}catch{}
 let destination={};try{destination=clone(window.nexaDestinationFlow18915?.state||{})}catch{}
 return {...base,encounter_autosave:{version:'18.10.1',reason,state:sessionState(),saved_at:nowIso(),radar,hypothesisReview:hypothesis,alternatives,discarded,clinicalPlan:plan,destination}};
}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){const s=db.createObjectStore(STORE,{keyPath:'encounter_id'});s.createIndex('owner_user_id','owner_user_id',{unique:false});s.createIndex('sync_state','sync_state',{unique:false})}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('ENCOUNTER_IDB_OPEN_FAILED'))})}
async function idbGet(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
async function idbPut(item){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(clone(item));tx.oncomplete=()=>{db.close();resolve(clone(item))};tx.onerror=()=>{db.close();reject(tx.error||new Error('ENCOUNTER_IDB_WRITE_FAILED'))}})}
async function idbAll(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
const store={get:id=>storeAdapter?.get?storeAdapter.get(id):idbGet(id),put:item=>storeAdapter?.put?storeAdapter.put(clone(item)):idbPut(item),all:()=>storeAdapter?.all?storeAdapter.all():idbAll()};

function backoff(attempt){return Math.min(300000,3000*Math.pow(2,Math.max(0,attempt-1)))}
function due(item){return !item?.next_attempt_at||new Date(item.next_attempt_at).getTime()<=Date.now()}
async function buildLocal(reason='autosave',forcedId=''){
 const userId=owner();if(!userId)return null;
 let id=String(forcedId||currentEncounterId()||'').trim();if(!isUuid(id))id=uuid();setActiveId(id);
 const previous=await store.get(id),fields=collectFields(),ready=eligible(fields),ts=nowIso();
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
   sync_state:'pending',attempt_count:Number(previous?.attempt_count||0),
   next_attempt_at:null,last_error:null,server_updated_at:previous?.server_updated_at||null,
   sync_version:Number(previous?.sync_version||0),legacy_status:previous?.legacy_status||'draft'
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
 if(!rec||rec.owner_user_id!==owner())return{skipped:true};
 if(['audited','discarded'].includes(rec.encounter_state)||rec.sync_state==='locked')return{locked:true,item:rec};
 const c=client();if(!c)return{sent:false,error:'NO_CLIENT'};
 const attempt=Number(rec.attempt_count||0)+1;
 try{
   const q=c.from('consultation_history').upsert(remotePayload(rec),{onConflict:'id'}).select('id,encounter_id,encounter_state,audit_priority,audit_ready_at,updated_at,sync_version,status').single();
   const {data,error}=await q;if(error)throw error;
   const remoteState=data?.encounter_state||rec.encounter_state;
   const terminal=['audited','discarded'].includes(remoteState);
   const saved={...rec,sync_state:terminal?'locked':'synced',attempt_count:attempt,next_attempt_at:null,last_error:null,server_updated_at:data?.updated_at||nowIso(),sync_version:Number(data?.sync_version||rec.sync_version||0),legacy_status:data?.status||rec.legacy_status||'draft',encounter_state:remoteState,audit_ready_at:data?.audit_ready_at||rec.audit_ready_at};
   await store.put(saved);window.dispatchEvent(new CustomEvent(terminal?'nexa:encounter-locked':'nexa:encounter-synced',{detail:{encounter_id:rec.encounter_id,state:saved.encounter_state}}));return{sent:!terminal,locked:terminal,item:saved};
 }catch(error){
   try{
     const {data:remote}=await c.from('consultation_history').select('id,encounter_id,encounter_state,updated_at,sync_version,status').eq('id',rec.encounter_id).eq('user_id',rec.owner_user_id).maybeSingle();
     if(remote&&['audited','discarded'].includes(remote.encounter_state)){
       const locked={...rec,sync_state:'locked',encounter_state:remote.encounter_state,attempt_count:attempt,next_attempt_at:null,last_error:null,server_updated_at:remote.updated_at||rec.server_updated_at||null,sync_version:Number(remote.sync_version||rec.sync_version||0),legacy_status:remote.status||rec.legacy_status||'draft'};
       await store.put(locked);window.dispatchEvent(new CustomEvent('nexa:encounter-locked',{detail:{encounter_id:rec.encounter_id,state:locked.encounter_state}}));return{sent:false,locked:true,item:locked};
     }
   }catch{}
   const saved={...rec,sync_state:'pending',attempt_count:attempt,last_error:String(error?.message||error||'SYNC_FAILED'),next_attempt_at:new Date(Date.now()+backoff(attempt)).toISOString()};
   await store.put(saved);window.dispatchEvent(new CustomEvent('nexa:encounter-sync-failed',{detail:{encounter_id:rec.encounter_id,error:saved.last_error}}));return{sent:false,error:saved.last_error,item:saved};
 }
}
async function preserve(reason='autosave',{sync=true}={}){
 const existingId=currentEncounterId(),fields=collectFields();
 const passiveWithoutEncounter=new Set(['before_reset','navigation','logout','pagehide','beforeunload','hidden','offline']);
 if(!existingId&&!meaningful(fields)&&passiveWithoutEncounter.has(reason))return null;
 const rec=await buildLocal(reason);if(!rec)return null;await store.put(rec);
 window.dispatchEvent(new CustomEvent('nexa:encounter-local-saved',{detail:{encounter_id:rec.encounter_id,state:rec.encounter_state,reason}}));
 if(sync&&navigator.onLine!==false)void syncOne(rec);
 return rec;
}
async function startNew(reason='new_encounter'){
 const userId=owner();if(!userId)return null;const id=uuid();setActiveId(id);
 const rec=await buildLocal(reason,id);if(!rec)return null;await store.put(rec);
 if(navigator.onLine!==false)void syncOne(rec);
 window.dispatchEvent(new CustomEvent('nexa:encounter-started',{detail:{encounter_id:id}}));return rec;
}
async function adoptExisting(rowOrId){
 const id=String(typeof rowOrId==='object'?(rowOrId?.encounter_id||rowOrId?.id):rowOrId||'').trim();
 if(!isUuid(id))return null;setActiveId(id);
 const existing=await store.get(id);if(existing)return existing;
 const userId=owner();if(!userId)return null;
 const row=typeof rowOrId==='object'?rowOrId:{};
 window.__NEXA_PROTOCOL_USAGE__=Array.isArray(row.protocol_usage)?clone(row.protocol_usage):[];const rec={encounter_id:id,owner_user_id:userId,fields:clone(row.fields||{}),encounter_state:row.encounter_state||'draft',protocol_usage:clone(window.__NEXA_PROTOCOL_USAGE__),audit_priority:Number(row.audit_priority||0),audit_ready_at:row.audit_ready_at||null,consent_recorded_at:row.consent_recorded_at||null,processing_meta:clone(row.processing_meta||{}),created_at:row.created_at||nowIso(),last_client_saved_at:row.updated_at||nowIso(),sync_state:'synced',attempt_count:0,next_attempt_at:null,last_error:null,server_updated_at:row.updated_at||null,sync_version:Number(row.sync_version||0),legacy_status:row.status||'draft'};
 await store.put(rec);return rec;
}
async function prioritize(){
 const rec=await buildLocal('manual_priority');if(!rec)return null;if(['audited','discarded'].includes(rec.encounter_state))return rec;rec.audit_priority=Math.max(1,Number(rec.audit_priority||0));await store.put(rec);if(navigator.onLine!==false)void syncOne(rec);return rec;
}
function schedulePersist(reason='input'){clearTimeout(persistTimer);persistTimer=setTimeout(()=>void preserve(reason),350)}
function scheduleRetry(items){clearTimeout(retryTimer);retryTimer=null;const pending=items.filter(x=>x.owner_user_id===owner()&&!['synced','locked'].includes(x.sync_state)&&x.next_attempt_at);if(!pending.length)return;const at=Math.min(...pending.map(x=>new Date(x.next_attempt_at).getTime()).filter(Number.isFinite));retryTimer=setTimeout(()=>void flush('retry'),Math.max(500,Math.min(300000,at-Date.now())))}
async function flush(reason='manual'){
 if(flushPromise)return flushPromise;flushPromise=(async()=>{const userId=owner();if(!userId)return{sent:0,pending:0,reason:'no_owner'};let items=await store.all(),sent=0;for(const rec of items.filter(x=>x.owner_user_id===userId&&!['synced','locked'].includes(x.sync_state)&&due(x))){const r=await syncOne(rec);if(r.sent)sent++}items=await store.all();scheduleRetry(items);return{sent,pending:items.filter(x=>x.owner_user_id===userId&&!['synced','locked'].includes(x.sync_state)).length,reason}})().finally(()=>{flushPromise=null});return flushPromise;
}
function bind(){
 document.addEventListener('input',e=>{if(e.target?.matches?.('textarea,input,select'))schedulePersist('input')},true);
 document.addEventListener('change',e=>{if(e.target?.matches?.('textarea,input,select'))schedulePersist('change')},true);
 document.addEventListener('click',e=>{
   if(e.target?.closest?.(START)){if(!currentEncounterId())void startNew('recording_start');else void preserve('recording_start');return}
   if(e.target?.closest?.(RESET)){pendingNew=true;void preserve('before_reset');return}
   if(e.target?.closest?.('#logoutBtn')){void preserve('logout');return}
   if(e.target?.closest?.(NAV))void preserve('navigation');
 },true);
 window.addEventListener('nexa:consultation-reset',()=>{if(!pendingNew)return;pendingNew=false;rotateEncounter();setTimeout(()=>void startNew('after_reset'),0)});
 addEventListener('pagehide',()=>{void preserve('pagehide')});
 addEventListener('beforeunload',()=>{void preserve('beforeunload',{sync:false})});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void preserve('hidden');else void flush('visible')});
 addEventListener('online',()=>void flush('online'));
 addEventListener('offline',()=>void preserve('offline',{sync:false}));
 addEventListener('focus',()=>void flush('focus'));
 addEventListener('nexa:encounter-flush-request',()=>void flush('event'));
 addEventListener('nexa:encounter-priority-request',()=>void prioritize());
 setTimeout(()=>void flush('startup'),800);
}
bind();

window.nexaEncounterAutosave18101={DB,STORE,currentEncounterId,setActiveId,rotateEncounter,startNew,adoptExisting,preserve,prioritize,flush,syncOne,buildLocal,eligible,meaningful,collectFields,get:store.get,put:store.put,all:store.all,setStoreAdapter:a=>{storeAdapter=a||null}};
})();

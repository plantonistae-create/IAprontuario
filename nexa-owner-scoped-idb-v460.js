/* NEXA V4.60 — non-destructive owner-scoped clinical buffer migration.
 * Version 2 retains the original encounters store read-only as a fallback.
 * No clinical records leave this device. No server/network calls.
 */
(()=>{
'use strict';
if(window.nexaOwnerScopedIDB460)return;
const DB='nexa-encounter-autosave-v18101', VERSION=2;
const LEGACY='encounters',STORE='encounters_owner_v2';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const valid=s=>typeof s==='string'&&UUID.test(s);
const key=(owner,id)=>{
 if(!valid(owner)||!valid(id))throw new Error('OWNER_SCOPED_KEY_INVALID');
 return [owner,id];
};
const verify=(record,owner)=>{
 if(!record||!valid(record.owner_user_id)||!valid(record.encounter_id)||
    record.owner_user_id!==owner)throw new Error('OWNER_SCOPED_RECORD_INVALID');
 return record;
};
function open(){return new Promise((resolve,reject)=>{
 let settled=false,blocked=false;
 const rejectOnce=e=>{if(!settled){settled=true;reject(e)}};
 const req=indexedDB.open(DB,VERSION);
 req.onblocked=()=>{blocked=true;rejectOnce(new Error('OWNER_SCOPED_UPGRADE_BLOCKED'));};
 req.onerror=()=>rejectOnce(new Error('OWNER_SCOPED_OPEN_FAILED'));
 req.onupgradeneeded=()=>{
  const db=req.result,tx=req.transaction;
  if(blocked){tx.abort();return;}
  try{
   if(!db.objectStoreNames.contains(STORE)){
    const s=db.createObjectStore(STORE,{keyPath:['owner_user_id','encounter_id']});
    s.createIndex('owner_user_id','owner_user_id',{unique:false});
   }else{
    const existing=tx.objectStore(STORE);
    if(JSON.stringify(existing.keyPath)!==JSON.stringify(['owner_user_id','encounter_id'])||
       !existing.indexNames.contains('owner_user_id'))throw new Error('OWNER_SCOPED_SCHEMA_CONFLICT');
   }
   // Retain the V1 store intact. Any invalid row aborts the *entire* upgrade.
   // No partial upgrade or data removal can commit.
   if(db.objectStoreNames.contains(LEGACY)){
    const src=tx.objectStore(LEGACY),dest=tx.objectStore(STORE);
    const cursor=src.openCursor();
    cursor.onsuccess=()=>{
     const c=cursor.result;if(!c)return;
     const item=c.value;
     if(!item||!valid(item.owner_user_id)||!valid(item.encounter_id)||
        c.primaryKey!==item.encounter_id){tx.abort();return;}
     dest.add(item); // A duplicate key aborts, never silently overwrites.
     c.continue();
    };
    cursor.onerror=()=>tx.abort();
   }
  }catch{tx.abort();}
 };
 req.onsuccess=()=>{
  const db=req.result;
  if(!db.objectStoreNames.contains(STORE)){
   db.close();rejectOnce(new Error('OWNER_SCOPED_STORE_MISSING'));return;
  }
  const tx=db.transaction(STORE,'readonly'),s=tx.objectStore(STORE);
  if(JSON.stringify(s.keyPath)!==JSON.stringify(['owner_user_id','encounter_id'])||
      !s.indexNames.contains('owner_user_id')){
   db.close();rejectOnce(new Error('OWNER_SCOPED_SCHEMA_CONFLICT'));return;
  }
  db.onversionchange=()=>db.close();
  if(settled){db.close();return;}
  settled=true;resolve(db);
 };
});}
async function get(id,owner){const k=key(owner,id),db=await open();return new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(k);
 let result=null;
 req.onsuccess=()=>{result=req.result||null;};
 tx.oncomplete=()=>{db.close();resolve(result?verify(result,owner):null);};
 tx.onerror=()=>{db.close();reject(new Error('OWNER_SCOPED_READ_FAILED'));};
 tx.onabort=()=>{db.close();reject(new Error('OWNER_SCOPED_READ_ABORTED'));};
});}
async function put(item,owner){verify(item,owner);const db=await open();return new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,'readwrite');
 tx.objectStore(STORE).put(structuredClone(item));
 tx.oncomplete=()=>{db.close();resolve(structuredClone(item));};
 tx.onerror=()=>{db.close();reject(new Error('OWNER_SCOPED_WRITE_FAILED'));};
 tx.onabort=()=>{db.close();reject(new Error('OWNER_SCOPED_WRITE_ABORTED'));};
});}
async function all(owner){key(owner,'00000000-0000-4000-8000-000000000001');const db=await open();return new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).index('owner_user_id').getAll(owner);
 let rows=[];
 req.onsuccess=()=>{rows=req.result||[];};
 tx.oncomplete=()=>{db.close();try{rows.forEach(r=>verify(r,owner));resolve(rows);}catch(e){reject(e)}};
 tx.onerror=()=>{db.close();reject(new Error('OWNER_SCOPED_LIST_FAILED'));};
 tx.onabort=()=>{db.close();reject(new Error('OWNER_SCOPED_LIST_ABORTED'));};
});}
async function comparePut(expected,item,owner,match){
 verify(expected,owner);verify(item,owner);
 if(expected.encounter_id!==item.encounter_id||typeof match!=='function')
  throw new Error('OWNER_SCOPED_CAS_INVALID');
 const k=key(owner,expected.encounter_id),db=await open();return new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,'readwrite'),s=tx.objectStore(STORE),req=s.get(k);
 let accepted=false;
 req.onsuccess=()=>{
  if(req.result&&verify(req.result,owner)&&match(req.result,expected)){
   s.put(structuredClone(item));accepted=true;
  }
 };
 tx.oncomplete=()=>{db.close();resolve(accepted);};
 tx.onerror=()=>{db.close();reject(new Error('OWNER_SCOPED_CAS_FAILED'));};
 tx.onabort=()=>{db.close();reject(new Error('OWNER_SCOPED_CAS_ABORTED'));};
});}
window.nexaOwnerScopedIDB460=Object.freeze({DB,STORE,LEGACY,VERSION,open,get,put,all,comparePut});
})();

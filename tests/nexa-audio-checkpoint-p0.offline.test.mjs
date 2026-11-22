import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

const js=readFileSync(new URL('../nexa-audio-checkpoint-p0.js',import.meta.url),'utf8');
const owner='11111111-1111-4111-8111-111111111111';
const encounter='22222222-2222-4222-8222-222222222222';
const session='33333333-3333-4333-8333-333333333333';

function fakeIDB(){
 const maps=new Map(), indexes=new Map();
 const db={
  objectStoreNames:{contains:n=>maps.has(n)},
  createObjectStore(name){
   maps.set(name,new Map());const ix=new Map();indexes.set(name,ix);
   return {createIndex:(index,field)=>ix.set(index,field)};
  },
  transaction(name){
   const tx={
    oncomplete:null,onerror:null,onabort:null,
    objectStore(table){
     const store=maps.get(table);
     const issue=op=>{
       const r={result:undefined,error:undefined,onsuccess:null,onerror:null};
       setImmediate(()=>{
         try{r.result=op();r.onsuccess?.({target:r});}
         catch(e){r.error=e;r.onerror?.({target:r});tx.onerror?.({target:tx});return;}
         queueMicrotask(()=>tx.oncomplete?.({target:tx}));
       });return r;
     };
     return {
       get:key=>issue(()=>store.get(key)),
       add:row=>issue(()=>{
         const key=row[table==='keys'?'ownerId':table==='sessions'?'sessionId':'id'];
         if(store.has(key)){const e=Error('duplicate');e.name='ConstraintError';throw e;}
         store.set(key,structuredClone(row));return key;
       }),
       put:row=>issue(()=>{
         const key=row[table==='keys'?'ownerId':table==='sessions'?'sessionId':'id'];
         store.set(key,structuredClone(row));return key;
       }),
       index:indexName=>({
         getAll:value=>issue(()=>[...store.values()]
           .filter(item=>item[indexes.get(table).get(indexName)]===value).map(structuredClone))
       })
     };
    }
   };return tx;
  }
 };
 return {storage:maps,api:{open(name,version){
   const r={result:db,onsuccess:null,onerror:null,onupgradeneeded:null};
   queueMicrotask(()=>{r.onupgradeneeded?.({target:r});r.onsuccess?.({target:r})});
   return r;
 }}};
}
function browser(idb=fakeIDB(),secure=true){
 const window={};
 const scope={window,indexedDB:idb.api,crypto:secure?webcrypto:undefined,
  TextEncoder,Blob,Date,Uint8Array,ArrayBuffer,Promise,Error,Number,Map,Object,
  String,Array,Boolean,structuredClone,console,setImmediate};
 scope.globalThis=scope;
 vm.runInNewContext(js,scope,{timeout:3000});
 return {vault:window.nexaAudioCheckpointP0,idb};
}
const input={ownerId:owner,encounterId:encounter,sessionId:session};
const wav=t=>new Blob([t],{type:'audio/webm'});

test('fails closed without WebCrypto/secure IndexedDB',async()=>{
 const {vault}=browser(fakeIDB(),false);
 await assert.rejects(vault.begin({...input,mime:'audio/webm'}),/AUDIO_SECURE_STORAGE_UNAVAILABLE/);
});
test('encrypted audio survives reload and decrypts after authenticated owner readback',async()=>{
 const idb=fakeIDB(),first=browser(idb).vault;
 await first.begin({...input,mime:'audio/webm'});
 await first.append({...input,sequence:0,blob:wav('AUDIO_ONE')});
 await first.append({...input,sequence:1,blob:wav('AUDIO_TWO')});
 assert.equal((await first.finalize(input)).readback,true);
 const saved=idb.storage.get('chunks').get(session+':000000');
 assert(!String(saved.ciphertext).includes('AUDIO_ONE'));
 const reopened=browser(idb).vault;
 const record=await reopened.recover(input);
 assert.equal(record.finalized,true);
 assert.equal(record.chunks,2);
 assert.equal(await record.blob.text(),'AUDIO_ONEAUDIO_TWO');
 assert.equal((await reopened.listOwned(owner)).length,1);
});
test('unfinished recording recovers available chunks but is flagged partial',async()=>{
 const {vault}=browser();
 await vault.begin({...input,mime:'audio/webm'});
 await vault.append({...input,sequence:0,blob:wav('CHUNK')});
 const record=await vault.recover(input);
 assert.equal(record.finalized,false);
 assert.equal(await record.blob.text(),'CHUNK');
});
test('cross-owner access and missing chunk are rejected',async()=>{
 const {vault,idb}=browser();
 await vault.begin({...input,mime:'audio/webm'});
 await vault.append({...input,sequence:0,blob:wav('A')});
 await vault.append({...input,sequence:1,blob:wav('B')});
 await assert.rejects(vault.recover({...input,ownerId:'44444444-4444-4444-8444-444444444444'}),/AUDIO_SESSION_NOT_OWNED/);
 idb.storage.get('chunks').delete(session+':000000');
 await assert.rejects(vault.recover(input),/AUDIO_CHUNK_GAP_OR_SCOPE_MISMATCH/);
});
test('ciphertext tampering, conflicting seq and browser data loss are fail-closed',async()=>{
 const idb=fakeIDB(),{vault}=browser(idb);
 await vault.begin({...input,mime:'audio/webm'});
 await vault.append({...input,sequence:0,blob:wav('HELLO')});
 await assert.rejects(vault.append({...input,sequence:0,blob:wav('DIFFERENT')}),/AUDIO_SEQUENCE_CONFLICT/);
 const saved=idb.storage.get('chunks').get(session+':000000');
 saved.ciphertext=new Uint8Array(saved.ciphertext.byteLength);
 await assert.rejects(vault.recover(input));
 const empty=browser(fakeIDB()).vault;
 await assert.rejects(empty.recover(input),/AUDIO_SESSION_NOT_OWNED/);
});
test('PR integration does not confuse local checkpoint with remote sync or Gate C',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert(html.includes('nexa-audio-checkpoint-p0.js?v='));
 assert(html.includes('checkpointVault.finalize(checkpoint)'));
 assert(html.includes('mediaRecorder.start(10000)'));
 assert(html.includes('nexaP0PreparePersistedSourceBeforeAudio(startEpoch)'));
 assert(html.includes('return false; // Hard STOP independent of server response and client claims.'));
 assert(!js.includes('SUPABASE_SERVICE_ROLE_KEY'));
 assert(!js.includes('fetch('));
});

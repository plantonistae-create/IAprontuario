import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code=readFileSync(new URL('../nexa-history-multidevice-v438.js',import.meta.url),'utf8');
const loader=readFileSync(new URL('../nexa-hotfix.js',import.meta.url),'utf8');
const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const ENCOUNTER='33333333-3333-4333-8333-333333333333';
const OTHER_ENCOUNTER='44444444-4444-4444-8444-444444444444';
const TIME='2026-11-20T12:00:00Z';
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const meta=(o={})=>({record_id:ENCOUNTER,encounter_id:ENCOUNTER,created_at:TIME,
 updated_at:TIME,sync_version:1,status:'draft',encounter_state:'draft',...o});
const full=(m=meta(),o={})=>({
 id:m.record_id,encounter_id:m.encounter_id,user_id:OWNER,
 status:m.status,encounter_state:m.encounter_state,
 created_at:m.created_at,updated_at:m.updated_at,sync_version:m.sync_version,
 fields:{hda:'SYNTHETIC_NOT_A_REAL_PATIENT'},
 processing_meta:{radar:{questions:[]}},protocol_usage:[],consent_recorded_at:null,...o
});
const PAGE=(rows=[meta()],o={})=>({
 schema_version:'nexa-clinical-history-list-v1',scope:'authenticated_owner_only',
 content_included:false,audio_included:false,training_approved:false,
 items:rows,has_more:false,next_cursor:null,...o
});
const UUID=n=>'33333333-3333-4333-8333-'+String(n).padStart(12,'0');
function harness({owner=OWNER,active='',local=null,serverRows,form={},state='idle',
 audioActive=false,fetchFail=false,slot=true,authInvalid=false,rpcError=null,onReadback}={}){
 const database=serverRows||[full()];
 let requests=0,adoptions=0,restoreCalls=0,authenticated=0,rpcCalls=0,authChange=null;
 let activeId=active,currentOwner=owner,sessionState=state,formFields={...form},localRec=local;
 let inertOnRestore=null;
 const queryLog=[],status={textContent:''},preview={hidden:true,textContent:''};
 const doc={body:{inert:false},readyState:'loading',addEventListener(){},
  getElementById(id){return id==='nexa438Status'?status:id==='nexa438Preview'?preview:null;}};
 const auto={currentEncounterId(){return activeId;},
  get:async()=>localRec,
  collectFields(){return {...formFields};},
  preserve:async()=>({sync_state:'pending'}),
  adoptExisting:async data=>{
   adoptions++;return {owner_user_id:currentOwner,sync_state:'synced',
    encounter_id:data.encounter_id,sync_version:data.sync_version,fields:data.fields};
  }
 };
 function from(table){
  assert.equal(table,'consultation_history');
  const q={selected:'',filters:[],orders:[],limitNum:null,cursor:null,
   select(v){q.selected=v;return q;},
   eq(k,v){q.filters.push([k,v]);return q;},
   order(k,{ascending}={}){q.orders.push([k,ascending]);return q;},
   limit(v){q.limitNum=v;return q;},
   or(v){q.cursor=v;return q;},
   async maybeSingle(){
    requests++;queryLog.push({type:'readback',selected:q.selected,filters:clone(q.filters)});
    onReadback?.({switchOwner:x=>{currentOwner=x;},setForm:x=>{formFields={...x};},
     setState:x=>{sessionState=x;},setRemote:x=>{database.splice(0,database.length,...x);}});
    if(fetchFail)return {data:null,error:{message:'SYNTHETIC_OFFLINE'}};
    const matching=database.filter(r=>q.filters.every(([k,v])=>r[k]===v));
    return {data:matching.length===1?clone(matching[0]):null,error:matching.length>1?{code:'PGRST116'}:null};
   },
   then(resolve,reject){
    requests++;queryLog.push({type:'list',selected:q.selected,filters:clone(q.filters),
     orders:clone(q.orders),limit:q.limitNum,cursor:q.cursor});
    const output=()=>{
     if(fetchFail)return {data:null,error:{message:'SYNTHETIC_OFFLINE'}};
     let rows=database.filter(r=>q.filters.every(([k,v])=>r[k]===v));
     rows.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
     if(q.cursor){
      const m=q.cursor.match(/^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/);
      assert.ok(m,'must use stable keyset predicate');
      rows=rows.filter(r=>r.created_at<m[1]||(r.created_at===m[2]&&r.id<m[3]));
     }
     rows=rows.slice(0,q.limitNum);
     const columns=q.selected.split(',');
     return {data:rows.map(r=>Object.fromEntries(columns.map(k=>[k,clone(r[k])]))),error:null};
    };
    return Promise.resolve().then(output).then(resolve,reject);
   }
  };
  return q;
 }
 const win={nexaEncounterAutosave18101:auto,
  nexaClinicalBridge18101:{state:()=>sessionState},
  nexaClinicalRuntime18121:{getProfile:()=>({id:currentOwner})},
  nexaClinicalSupabase18101:{
   auth:{
    getSession:async()=>({data:{session:{user:{id:currentOwner},access_token:'SYNTHETIC_LOCAL_ONLY'}},error:null}),
    getUser:async()=>{authenticated++;return authInvalid?{data:{user:null},error:{code:'401'}}:{data:{user:{id:currentOwner}},error:null};},
    onAuthStateChange:cb=>{authChange=cb;return {data:{subscription:{unsubscribe(){}}}}}
   },
   rpc:async name=>{rpcCalls++;assert.equal(name,'has_active_clinical_access');return {data:slot,error:rpcError};},
   from
  },
  nexaRecoverSavedEncounter:async data=>{
   restoreCalls++;inertOnRestore=doc.body.inert;
   if(audioActive)return false;
   const result=await auto.adoptExisting(data);
   activeId=data.encounter_id;localRec={...result,local_revision:1};
   return true;
  }
 };
 const ctx={window:win,document:doc,Date,MutationObserver:undefined,setTimeout:()=>{},console};
 vm.runInNewContext(code,ctx,{filename:'nexa-history-multidevice-v438.js'});
 return {api:win.nexaMultideviceHistoryV438,win,doc,status,preview,database,queryLog,
  get requests(){return requests;},get adoptions(){return adoptions;},
  get restoreCalls(){return restoreCalls;},get rpcCalls(){return rpcCalls;},
  get authCount(){return authenticated;},get authChange(){return authChange;},
  get inertOnRestore(){return inertOnRestore;},
  setForm:x=>{formFields={...x};},
  switchOwner:x=>{currentOwner=x;},
  setState:x=>{sessionState=x;}
 };
}
test('loader registers owner-only history after existing history and before recovery',()=>{
 const old=loader.indexOf('./nexa-history-style-audit-v18.9.7.js');
 const current=loader.indexOf('./nexa-history-multidevice-v438.js');
 const recovery=loader.indexOf('./nexa-history-recovery-v1.js');
 assert.ok(old>=0&&current>old&&recovery>current);
 assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE_KEY|submit-audit-case|audit-backfill|api\.openai\.com/);
 assert.doesNotMatch(code,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
 assert.doesNotMatch(code,/functions\/v1\/nexa-clinical-text-readback/);
});
test('no automatic server queries when module loads',()=>{
 const h=harness();assert.equal(h.requests,0);assert.equal(h.rpcCalls,0);
});
test('metadata validator rejects PHI or altered owner flags',()=>{
 const h=harness();
 assert.equal(h.api.validatePage(PAGE([meta({record_id:'Legacy_2026'})])).rows[0].record_id,'Legacy_2026');
 assert.throws(()=>h.api.validatePage(PAGE([{...meta(),fields:{hda:'SYNTHETIC_PRIVATE'}}])));
 assert.throws(()=>h.api.validatePage(PAGE([meta()],{training_approved:true})));
});
test('metadata validator rejects duplicates, malformed IDs, cursors and versions',()=>{
 const h=harness();
 for(const bad of [{record_id:'bad.dot'},{encounter_id:null},{sync_version:'1'}])
  assert.throws(()=>h.api.validatePage(PAGE([meta(bad)])));
 assert.throws(()=>h.api.validatePage(PAGE([meta(),meta()])));
 assert.throws(()=>h.api.validatePage(PAGE([meta()],{has_more:true,next_cursor:null})));
});
test('only metadata selected during listing; no clinical field in result',async()=>{
 const h=harness(),result=await h.api.request({action:'list',limit:20},OWNER);
 assert.equal(result.items.length,1);
 assert.equal(h.requests,1);assert.equal(h.rpcCalls,1);assert.equal(h.authCount,1);
 assert.equal(result.items[0].record_id,ENCOUNTER);
 assert.equal(result.content_included,false);
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_NOT_A_REAL_PATIENT|fields/);
 const q=h.queryLog[0];assert.equal(q.type,'list');
 assert.equal(q.filters.find(([k])=>k==='user_id')[1],OWNER);
 assert.doesNotMatch(q.selected,/fields|processing_meta|protocol_usage/);
});
test('new login with same physician retrieves server record (synthetic A→B)',async()=>{
 const shared=[full()];
 const a=harness({serverRows:shared}),b=harness({serverRows:shared});
 await a.api.loadPage(true);await b.api.loadPage(true);
 await b.api.openItem(meta());
 assert.equal(b.adoptions,1);assert.equal(a.adoptions,0);
 assert.match(b.status.textContent,/identidade e versão/);
 assert.equal(b.inertOnRestore,true);assert.equal(b.doc.body.inert,false);
});
test('unrelated doctor receives no A rows and cannot read A record',async()=>{
 const h=harness({owner:OTHER,serverRows:[full()]});
 const listed=await h.api.request({action:'list',limit:20},OTHER);
 assert.equal(listed.items.length,0);
 const body={record_id:ENCOUNTER,encounter_id:ENCOUNTER,expected_sync_version:1,
  expected_updated_at:TIME,expected_status:'draft',expected_encounter_state:'draft'};
 await assert.rejects(h.api.request(body,OTHER),/DIRECT_READBACK_VERSION_CHANGED_OR_DENIED/);
 assert.ok(h.queryLog.every(q=>q.filters.some(([k,v])=>k==='user_id'&&v===OTHER)));
});
test('JWT validation is mandatory before any list or readback',async()=>{
 const h=harness({authInvalid:true});
 await assert.rejects(h.api.request({action:'list',limit:20},OWNER),/AUTH_REQUIRED/);
 assert.equal(h.requests,0);
});
test('clinical slot false denies metadata and clinical fields',async()=>{
 const h=harness({slot:false});
 await assert.rejects(h.api.request({action:'list',limit:20},OWNER),/CLINICAL_ACCESS_REQUIRED/);
 assert.equal(h.requests,0);
});
test('RPC error or malformed value fails closed without table access',async()=>{
 for(const opts of [{slot:'true'},{slot:1},{slot:null},{slot:true,rpcError:{message:'SYNTHETIC'}}]){
  const h=harness(opts);
  await assert.rejects(h.api.request({action:'list',limit:20},OWNER),/CLINICAL_ACCESS_UNAVAILABLE/);
  assert.equal(h.requests,0);
 }
});
test('owner mismatch before request is refused before RPC and SQL',async()=>{
 const h=harness();await assert.rejects(h.api.request({action:'list',limit:20},OTHER),/AUTH_REQUIRED/);
 assert.equal(h.requests,0);assert.equal(h.rpcCalls,0);
});
test('keyset pagination over twenty old records preserves timestamp ties',async()=>{
 const rows=Array.from({length:27},(_,i)=>full(meta({
  record_id:UUID(i+1),encounter_id:UUID(i+1),
  created_at:i<25?TIME:'2026-11-19T12:00:00Z',
  updated_at:i<25?TIME:'2026-11-19T12:00:00Z'
 })));
 const h=harness({serverRows:rows});
 const first=h.api.validatePage(await h.api.request({action:'list',limit:20},OWNER));
 assert.equal(first.rows.length,20);assert.equal(first.has_more,true);
 const second=h.api.validatePage(await h.api.request({action:'list',limit:20,cursor:first.next_cursor},OWNER));
 assert.equal(second.rows.length,7);assert.equal(second.has_more,false);
 assert.equal(new Set([...first.rows,...second.rows].map(x=>x.record_id)).size,27);
 assert.ok(h.queryLog[1].cursor?.includes('id.lt.'));
});
test('cursor text injection is refused before issuing query',async()=>{
 const h=harness();
 await assert.rejects(h.api.request({action:'list',limit:20,cursor:{created_at:TIME+',id.gt.0',id:ENCOUNTER}},OWNER),/HISTORY_CURSOR_INVALID/);
 assert.equal(h.requests,0);
});
test('direct readback is owner, ID, timestamp, status and version filtered',async()=>{
 const h=harness();const body={record_id:ENCOUNTER,encounter_id:ENCOUNTER,expected_sync_version:1,
  expected_updated_at:TIME,expected_status:'draft',expected_encounter_state:'draft'};
 const raw=await h.api.request(body,OWNER);
 assert.equal(h.api.validateDirectReadback(raw,meta(),OWNER).fields.hda,'SYNTHETIC_NOT_A_REAL_PATIENT');
 const q=h.queryLog[0];assert.equal(q.type,'readback');assert.match(q.selected,/fields/);
 for(const k of ['user_id','id','encounter_id','sync_version','updated_at','status','encounter_state'])
  assert.ok(q.filters.some(([name])=>name===k));
});
test('stale version or changed timestamp blocks reopening',async()=>{
 const database=[full()];const h=harness({serverRows:database,onReadback:({setRemote})=>
  setRemote([{...full(),sync_version:2}])});
 await h.api.loadPage(true);await h.api.openItem(meta());
 assert.equal(h.adoptions,0);assert.match(h.status.textContent,/DIRECT_READBACK_VERSION_CHANGED_OR_DENIED/);
});
test('server row with incorrect owner is rejected even if mock ignores filters',()=>{
 const h=harness();
 assert.throws(()=>h.api.validateDirectReadback({row:full(meta(),{user_id:OTHER})},meta(),OWNER),/DIRECT_READBACK_NOT_VERIFIED/);
 assert.throws(()=>h.api.validateDirectReadback({row:full(meta(),{updated_at:'2026-11-21T12:00:00Z'})},meta(),OWNER),/DIRECT_READBACK_NOT_VERIFIED/);
});
test('pending local draft never overwritten',async()=>{
 const h=harness({local:{owner_user_id:OWNER,sync_state:'pending',sync_version:1}});
 await h.api.loadPage(true);await h.api.openItem(meta());
 assert.equal(h.adoptions,0);assert.equal(h.requests,1);
 assert.match(h.status.textContent,/LOCAL_DRAFT_OR_CONFLICT_PROTECTED/);
});
test('local conflict never overwritten',async()=>{
 const h=harness({local:{owner_user_id:OWNER,sync_state:'conflict',sync_version:1}});
 await h.api.loadPage(true);await h.api.openItem(meta());
 assert.equal(h.adoptions,0);assert.match(h.status.textContent,/LOCAL_DRAFT_OR_CONFLICT_PROTECTED/);
});
test('active different encounter blocks switching',async()=>{
 const h=harness({active:OTHER_ENCOUNTER});
 await h.api.loadPage(true);await h.api.openItem(meta());
 assert.equal(h.adoptions,0);assert.match(h.status.textContent,/ACTIVE_ENCOUNTER_CHECKPOINT_REQUIRED/);
});
test('unsaved clinical form blocks readback before PHI fetch',async()=>{
 const h=harness({form:{hda:'SYNTHETIC_UNSAVED'}});
 await h.api.loadPage(true);await h.api.openItem(meta());
 assert.equal(h.adoptions,0);assert.equal(h.requests,1);
 assert.match(h.status.textContent,/UNSAVED_FORM_PROTECTED/);
});
test('active recording blocks remote readback',async()=>{
 const h=harness({state:'recording'});
 await h.api.loadPage(true);await h.api.openItem(meta());
 assert.equal(h.adoptions,0);assert.match(h.status.textContent,/ACTIVE_CLINICAL_SESSION_PROTECTED/);
});
test('live audio buffer refuses recovery after readback, preserving form',async()=>{
 const h=harness({audioActive:true});
 await h.api.loadPage(true);await h.api.openItem(meta());
 assert.equal(h.restoreCalls,1);assert.equal(h.adoptions,0);
 assert.equal(h.doc.body.inert,false);assert.match(h.status.textContent,/AUDIO_OR_RECOVERY_BLOCKED/);
});
test('legacy text PK uses read-only preview without renumbering',async()=>{
 const m=meta({record_id:'Legacy_2026'}),h=harness({serverRows:[full(m)]});
 await h.api.loadPage(true);await h.api.openItem(m);
 assert.equal(h.adoptions,0);assert.equal(h.preview.hidden,false);
 assert.match(h.status.textContent,/Registro legado/);
});
test('owner switch during direct readback fails closed',async()=>{
 const h=harness({onReadback:ctl=>ctl.switchOwner(OTHER)});
 await h.api.loadPage(true);await h.api.openItem(meta());
 assert.equal(h.adoptions,0);assert.match(h.status.textContent,/OWNER_CHANGED|CLINICAL_FORM_CHANGED/);
});
test('form changed while awaiting direct readback fails closed',async()=>{
 const h=harness({onReadback:ctl=>ctl.setForm({hda:'SYNTHETIC_CHANGED_DURING_FETCH'})});
 await h.api.loadPage(true);await h.api.openItem(meta());
 assert.equal(h.adoptions,0);assert.match(h.status.textContent,/CLINICAL_FORM_CHANGED_DURING_READBACK/);
});
test('session sign-out wipes preview and previous owner data',async()=>{
 const m=meta({record_id:'Legacy_2026'}),h=harness({serverRows:[full(m)]});
 await h.api.loadPage(true);await h.api.openItem(m);
 assert.equal(h.preview.hidden,false);
 h.authChange('SIGNED_OUT',null);
 assert.equal(h.preview.hidden,true);assert.equal(h.preview.textContent,'');
});
test('network outage fails visibly without modifying the form',async()=>{
 const h=harness({fetchFail:true});
 await h.api.loadPage(true);
 assert.equal(h.adoptions,0);
 assert.match(h.status.textContent,/REMOTE_HISTORY_QUERY_FAILED/);
});
test('no trusted clinical bridge means no recovery',async()=>{
 const h=harness();delete h.win.nexaClinicalBridge18101;
 await h.api.loadPage(true);await h.api.openItem(meta());
 assert.equal(h.adoptions,0);assert.match(h.status.textContent,/CLINICAL_FORM_GUARD_UNAVAILABLE/);
});

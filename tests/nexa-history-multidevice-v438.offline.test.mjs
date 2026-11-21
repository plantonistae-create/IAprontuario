import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';

const code=readFileSync(new URL('../nexa-history-multidevice-v438.js',import.meta.url),'utf8');
const loader=readFileSync(new URL('../nexa-hotfix.js',import.meta.url),'utf8');
const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const ENCOUNTER='33333333-3333-4333-8333-333333333333';
const OTHER_ENCOUNTER='44444444-4444-4444-8444-444444444444';
const time='2026-11-20T12:00:00Z';
const row=(overrides={})=>({record_id:ENCOUNTER,encounter_id:ENCOUNTER,created_at:time,updated_at:time,sync_version:1,status:'draft',encounter_state:'draft',...overrides});
const page=(rows=[row()],overrides={})=>({schema_version:'nexa-clinical-history-list-v1',
 scope:'authenticated_owner_only',content_included:false,audio_included:false,training_approved:false,
 items:rows,has_more:false,next_cursor:null,...overrides});
const canonical=v=>{
 if(v===null||['string','boolean'].includes(typeof v))return JSON.stringify(v);
 if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 throw Error('BAD_CANONICAL');
};
const readback=(meta=row(),change={})=>{
 const pkg={schema_version:'nexa-clinical-text-readback-v1',encounter_id:meta.encounter_id,
 sync_version:meta.sync_version,updated_at:time,encounter_state:'draft',consent_recorded_at:null,
 fields:{hda:'NOT_A_REAL_PATIENT'},processing_meta:{radar:{questions:[]}},protocol_usage:[],...(change.package||{})};
 return {verified:true,canonical_sha256:createHash('sha256').update(canonical(pkg)).digest('hex'),
 package:pkg,durable_archive:false,audio_included:false,...change};
};
function harness({owner=OWNER,active='',local=null,response,fetchFail=false,
 listMeta=row(),form={},state='idle',audioActive=false,onReadback=null}={}){
 let fetchCalls=0,filled=null,adoptions=0,authChange=null,restoreCalls=0;
 let activeId=active,currentOwner=owner,sessionState=state,formFields={...form},localRec=local;
 let inertOnRestore=null;
 const status={textContent:''},preview={hidden:true,textContent:''};
 const doc={body:{inert:false},readyState:'loading',addEventListener(){},querySelector(){return null},
  getElementById(id){return id==='nexa438Status'?status:id==='nexa438Preview'?preview:null;}};
 const auto={
  currentEncounterId(){return activeId},get:async()=>localRec,
  collectFields(){return {...formFields}},
  preserve:async()=>({sync_state:'pending'}),
  adoptExisting:async data=>{
   adoptions++;return {owner_user_id:currentOwner,sync_state:'synced',
    encounter_id:data.encounter_id,sync_version:data.sync_version,fields:data.fields}
  }
 };
 const win={TextEncoder,crypto:webcrypto,confirm:()=>true,nexaEncounterAutosave18101:auto,
  nexaClinicalBridge18101:{state:()=>sessionState},
  nexaClinicalRuntime18121:{getProfile:()=>({id:currentOwner}),publishableKey:'PUBLIC_TEST_ONLY'},
  nexaClinicalSupabase18101:{supabaseKey:'PUBLIC_TEST_ONLY',
    auth:{getSession:async()=>({data:{session:{user:{id:currentOwner},access_token:'SYNTHETIC_JWT_NOT_REAL'}}}),
      onAuthStateChange:cb=>{authChange=cb;return {data:{subscription:{unsubscribe(){}}}}}}},
  nexaRecoverSavedEncounter:async data=>{
   restoreCalls++;inertOnRestore=doc.body.inert;
   if(audioActive)return false;
   const adopted=await auto.adoptExisting(data);
   activeId=data.encounter_id;filled={...adopted.fields};localRec={...adopted,local_revision:1};
   return true;
  }
 };
 const ctx={window:win,document:doc,MutationObserver:undefined,Date,Uint8Array,TextEncoder,
  fetch:async(url,options)=>{
   fetchCalls++;assert.match(url,/nexa-clinical-text-readback$/);
   assert.match(options.headers.Authorization,/^Bearer /);
   if(fetchFail)return {ok:false,status:503};
   const payload=JSON.parse(options.body);
   if(payload.action==='list')return {ok:true,status:200,json:async()=>page([listMeta])};
   if(typeof onReadback==='function')onReadback({setForm:x=>{formFields={...x}},
     switchOwner:x=>{currentOwner=x},setActive:x=>{activeId=x},setState:x=>{sessionState=x}});
   return {ok:true,status:200,json:async()=>typeof response==='function'?response(options):response};
  },setTimeout(){},fill:fields=>{filled=fields},lastProcessedMeta:null,activeHistoryId:null};
 vm.runInNewContext(code,ctx,{filename:'nexa-history-multidevice-v438.js'});
 return {api:win.nexaMultideviceHistoryV438,status,preview,doc,
  setForm:x=>{formFields={...x}},switchOwner:x=>{currentOwner=x},
  get authChange(){return authChange},get fetchCalls(){return fetchCalls},
  get filled(){return filled},get adoptions(){return adoptions},
  get restoreCalls(){return restoreCalls},get inertOnRestore(){return inertOnRestore},ctx,win};
}
test('loader registers frontend after original history; no index or Sprint 1 dependency',()=>{
 const i=loader.indexOf('./nexa-history-style-audit-v18.9.7.js');
 const j=loader.indexOf('./nexa-history-multidevice-v438.js');
 assert.ok(i>=0&&j>i);
 assert.doesNotMatch(code,/submit-audit-case|SUPABASE_SERVICE_ROLE_KEY|\.insert\(|\.upsert\(|\.update\(/);
});
test('index allows text id but refuses PHI in list and false training flags',()=>{
 const {api}=harness();
 assert.equal(api.validatePage(page([row({record_id:'Legacy_Case_2026'})])).rows[0].record_id,'Legacy_Case_2026');
 assert.throws(()=>api.validatePage(page([{...row(),fields:{hda:'PRIVATE'}}])));
 assert.throws(()=>api.validatePage(page([row()],{training_approved:true})));
});
test('malformed row and cross-page cursor cannot be accepted',()=>{
 const {api}=harness();
 for(const wrong of [{record_id:'a,b'},{record_id:'a.b'},{encounter_id:null},{sync_version:'1'}]){
  assert.throws(()=>api.validatePage(page([row(wrong)])));
 }
 assert.throws(()=>api.validatePage(page([row()],{has_more:true,next_cursor:null})));
 assert.throws(()=>api.validatePage(page([row(),row()])));
});
test('readback verifies SHA-256 and rejects mismatches and altered versions',async()=>{
 const {api}=harness();
 const data=readback();
 assert.equal((await api.validateReadback(data,row())).fields.hda,'NOT_A_REAL_PATIENT');
 await assert.rejects(api.validateReadback({...data,canonical_sha256:'0'.repeat(64)},row()),/READBACK_DIGEST_MISMATCH/);
 await assert.rejects(api.validateReadback(data,row({sync_version:2})),/READBACK_NOT_VERIFIED/);
});
test('fetch list only upon explicit call, with scoped session and metadata',async()=>{
 const h=harness({response:page()});
 assert.equal(h.fetchCalls,0);
 const response=await h.api.request({action:'list',limit:20},OWNER);
 assert.equal(response.items.length,1);
 assert.equal(h.fetchCalls,1);
 await assert.rejects(h.api.request({action:'list'},OTHER),/AUTH_REQUIRED/);
});
test('reopen synthetic encounter from independently verified server package',async()=>{
 const meta=row(),h=harness({response:readback(meta)});
 await h.api.loadPage(true);
 await h.api.openItem(meta);
 assert.equal(h.adoptions,1);assert.equal(h.filled.hda,'NOT_A_REAL_PATIENT');
 assert.match(h.status.textContent,/SHA-256/);
});
test('a pending local draft never gets overwritten',async()=>{
 const meta=row(),h=harness({local:{owner_user_id:OWNER,sync_state:'pending',sync_version:1},response:readback(meta)});
 await h.api.loadPage(true);
 await h.api.openItem(meta);
 assert.equal(h.adoptions,0);assert.equal(h.fetchCalls,1);assert.match(h.status.textContent,/LOCAL_DRAFT_OR_CONFLICT_PROTECTED/);
});
test('active distinct draft is checkpointed and blocks switching',async()=>{
 const meta=row(),h=harness({active:OTHER_ENCOUNTER,response:readback(meta)});
 await h.api.loadPage(true);
 await h.api.openItem(meta);assert.equal(h.adoptions,0);
 assert.match(h.status.textContent,/ACTIVE_ENCOUNTER_CHECKPOINT_REQUIRED/);
});
test('legacy text ID is view-only; never renumbered into editor',async()=>{
 const meta=row({record_id:'historico_legado_A'}),h=harness({listMeta:row({record_id:'historico_legado_A'}),response:readback(meta)});
 await h.api.loadPage(true);
 await h.api.openItem(meta);
 assert.equal(h.adoptions,0);assert.equal(h.filled,null);assert.equal(h.preview.hidden,false);
 assert.match(h.status.textContent,/Registro legado/);
});
test('unavailable backend is explicitly not treated as a saved or verified archive',async()=>{
 const h=harness({fetchFail:true});
 await assert.rejects(h.api.request({action:'list',limit:20},OWNER),/READBACK_BACKEND_NOT_READY/);
 assert.equal(h.filled,null);assert.equal(h.adoptions,0);
});

test('auth sign-out scrubs previous physician metadata and private readback preview',async()=>{
 const meta=row({record_id:'old_legacy_A'}),h=harness({listMeta:row({record_id:'old_legacy_A'}),response:readback(meta)});
 await h.api.loadPage(true);await h.api.openItem(meta);
 assert.equal(h.preview.hidden,false);assert.equal(typeof h.authChange,'function');
 h.authChange('SIGNED_OUT',null);
 assert.equal(h.preview.hidden,true);assert.equal(h.preview.textContent,'');
 assert.match(h.status.textContent,/Sessão alterada/);
});

test('V4.40 blocks unsaved HDA without active encounter identity',async()=>{
 const h=harness({form:{hda:'UNSAVED_LOCAL_NOTE'},response:readback()});
 await h.api.loadPage(true);await h.api.openItem(row());
 assert.equal(h.restoreCalls,0);assert.equal(h.filled,null);
 assert.match(h.status.textContent,/UNSAVED_FORM_PROTECTED/);
});
test('V4.40 blocks active edited encounter even before local checkpoint',async()=>{
 const h=harness({active:OTHER_ENCOUNTER,form:{hda:'EDITED_IN_FORM'},response:readback()});
 await h.api.loadPage(true);await h.api.openItem(row());
 assert.equal(h.restoreCalls,0);assert.match(h.status.textContent,/UNSAVED_FORM_PROTECTED/);
});
test('V4.40 refuses local conflict even with idle empty form',async()=>{
 const h=harness({local:{owner_user_id:OWNER,sync_state:'conflict',sync_version:1},response:readback()});
 await h.api.loadPage(true);await h.api.openItem(row());
 assert.equal(h.restoreCalls,0);assert.match(h.status.textContent,/LOCAL_DRAFT_OR_CONFLICT_PROTECTED/);
});
test('V4.40 stops owner switch while remote readback is pending',async()=>{
 const h=harness({response:readback(),onReadback:ctl=>ctl.switchOwner(OTHER)});
 await h.api.loadPage(true);await h.api.openItem(row());
 assert.equal(h.restoreCalls,0);assert.match(h.status.textContent,/OWNER_CHANGED|CLINICAL_FORM_CHANGED/);
});
test('V4.40 fails when form changes during remote readback',async()=>{
 const h=harness({response:readback(),onReadback:ctl=>ctl.setForm({hda:'EDIT_DURING_FETCH'})});
 await h.api.loadPage(true);await h.api.openItem(row());
 assert.equal(h.restoreCalls,0);assert.match(h.status.textContent,/CLINICAL_FORM_CHANGED_DURING_READBACK/);
});
test('V4.40 stops on SHA-256 divergence before restore',async()=>{
 const h=harness({response:{...readback(),canonical_sha256:'0'.repeat(64)}});
 await h.api.loadPage(true);await h.api.openItem(row());
 assert.equal(h.restoreCalls,0);assert.match(h.status.textContent,/READBACK_DIGEST_MISMATCH/);
});
test('V4.40 blocks if active unprocessed audio exists',async()=>{
 const h=harness({response:readback(),audioActive:true});
 await h.api.loadPage(true);await h.api.openItem(row());
 assert.equal(h.restoreCalls,1);assert.equal(h.adoptions,0);assert.equal(h.filled,null);
 assert.match(h.status.textContent,/AUDIO_OR_RECOVERY_BLOCKED/);assert.equal(h.doc.body.inert,false);
});
test('V4.40 succeeds only with clean idle form, inert lock and local verification',async()=>{
 const h=harness({response:readback()});
 await h.api.loadPage(true);await h.api.openItem(row());
 assert.equal(h.restoreCalls,1);assert.equal(h.adoptions,1);assert.equal(h.inertOnRestore,true);
 assert.equal(h.doc.body.inert,false);assert.equal(h.filled.hda,'NOT_A_REAL_PATIENT');
 assert.match(h.status.textContent,/checkpoint local verificado/);
});
test('V4.40 stops active recording even when fields are empty',async()=>{
 const h=harness({state:'recording',response:readback()});
 await h.api.loadPage(true);await h.api.openItem(row());
 assert.equal(h.restoreCalls,0);assert.match(h.status.textContent,/ACTIVE_CLINICAL_SESSION_PROTECTED/);
});
test('V4.40 fails closed when authoritative form state is missing',async()=>{
 const h=harness({response:readback()});delete h.win.nexaClinicalBridge18101;
 await h.api.loadPage(true);await h.api.openItem(row());
 assert.equal(h.restoreCalls,0);assert.match(h.status.textContent,/CLINICAL_FORM_GUARD_UNAVAILABLE/);
});

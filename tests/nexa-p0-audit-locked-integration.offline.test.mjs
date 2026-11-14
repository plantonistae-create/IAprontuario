/* NEXA P0 — real audit-submit handler + real autosave source, offline only.
 * This is ONE cross-PR integration contract. No network, backend, user data,
 * hosted credentials, consent fabrication or final-review ACK is involved.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const autosave=fs.readFileSync(new URL('../nexa-encounter-autosave-v18.10.1.js',import.meta.url),'utf8');
function take(source,start,end){
 const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
 assert.ok(first>=0&&last>first,'Expected exact source boundary: '+start);
 assert.equal(source.indexOf(start,first+start.length),-1,'Duplicate source boundary: '+start);
 return source.slice(first,last);
}
const handler=take(html,'async function submitCurrentForAudit(){',"$('submitAuditBtn').onclick=submitCurrentForAudit;");
const localBuild=take(autosave,'async function buildLocal(','function remotePayload(');
const localPreserve=take(autosave,'async function preserve(','async function startNew(');
assert.doesNotMatch(handler,/fetch\s*\(|APP_CONFIG\.submitAuditPath|reviewed_documentation\s*:\s*true/);
const code=localBuild+'\n'+localPreserve+'\n'+handler+
 '\nthis.__combined={preserve,submitCurrentForAudit};';
const USER='11111111-1111-4111-8111-111111111111';
const OTHER='33333333-3333-4333-8333-333333333333';
const ID='22222222-2222-4222-8222-222222222222';
const INITIAL='História clínica inteiramente sintética e sem dados reais';
const EDITED='História clínica sintética alterada depois do bloqueio';
const copy=x=>structuredClone(x);

function fixture({state='draft',sync='pending',visible=INITIAL,
                 ownerId=USER}={}){
 const item={
  encounter_id:ID,owner_user_id:ownerId,
  encounter_state:state,sync_state:sync,
  fields:{hda:INITIAL},local_revision:4,sync_version:7,
  last_client_saved_at:'2026-11-13T19:00:00Z',
  created_at:'2026-11-13T18:00:00Z',
  audit_priority:0,requires_form_refresh:false
 };
 const records=new Map([[ID,copy(item)]]);
 const writes=[],messages=[],events=[];
 const fields=()=>({hda:visible});
 const currentProf={id:USER,clinical_access:true};
 const window={dispatchEvent:e=>events.push(e.type),nexaEncounterAutosave18101:null};
 const context={
  currentProf,window,
  collect:fields,collectFields:fields,owner:()=>currentProf.id,
  ensureOwnerScope:()=>{},ownerSwitchRequiresExplicitEncounter:false,
  cancelScheduledPersist:()=>{},currentEncounterId:()=>ID,
  assertOwnerStill:actor=>assert.equal(actor,USER),
  setActiveId:id=>assert.equal(id,ID),isUuid:id=>id===ID,uuid:()=>ID,
  clone:copy,eligible:f=>String(f.hda||'').length>=20,
  nowIso:()=> '2026-11-14T15:00:00.000Z',
  processingMeta:reason=>({reason}),lastProcessedMeta:null,
  serializeLocal:async fn=>fn(),
  store:{
   get:async id=>records.has(id)?copy(records.get(id)):null,
   put:async row=>{
    writes.push(copy(row));records.set(row.encounter_id,copy(row));return row;
   }
  },
  navigator:{onLine:false},
  syncOne:()=>{throw Error('REMOTE_SYNC_FORBIDDEN')},
  show:(msg,isError)=>messages.push({msg:String(msg),isError:!!isError}),
  fetch:()=>{throw Error('AUDIT_NETWORK_FORBIDDEN')},
  confirm:()=>{throw Error('CLIENT_ATTESTATION_FORBIDDEN')},
  CustomEvent:class{constructor(type){this.type=type}}
 };
 vm.runInNewContext(code,context,{timeout:1000});
 window.nexaEncounterAutosave18101={preserve:context.__combined.preserve};
 return {
  run:()=>context.__combined.submitCurrentForAudit(),
  read:()=>copy(records.get(ID)),writes,messages,events
 };
}

test('modified audited encounter: audit button cannot rewrite locked snapshot',async()=>{
 const f=fixture({state:'audited',sync:'locked',visible:EDITED});
 const before=f.read();
 await f.run();
 assert.deepEqual(f.read(),before);
 assert.equal(f.writes.length,0);
 assert.equal(f.events.length,0);
 assert.match(f.messages.at(-1).msg,/não foi possível confirmar o salvamento local/);
});
test('unchanged locked encounter: no IndexedDB write and no fake ACK',async()=>{
 const f=fixture({state:'discarded',sync:'locked'});
 const before=f.read();
 await f.run();
 assert.deepEqual(f.read(),before);
 assert.equal(f.writes.length,0);
 assert.equal(f.events.length,0);
 assert.match(f.messages.at(-1).msg,/nenhum caso foi enviado/);
});
test('ordinary draft: audit gate preserves once locally and never submits',async()=>{
 const f=fixture({state:'draft',sync:'pending',visible:EDITED});
 await f.run();
 assert.equal(f.writes.length,1);
 assert.equal(f.read().owner_user_id,USER);
 assert.equal(f.read().fields.hda,EDITED);
 assert.equal(f.read().local_revision,5);
 assert.match(f.messages.at(-1).msg,/nenhum caso foi enviado/);
});
test('other physician source: audit gate fails closed with zero writes',async()=>{
 const f=fixture({state:'draft',sync:'pending',ownerId:OTHER,visible:EDITED});
 const before=f.read();
 await f.run();
 assert.deepEqual(f.read(),before);
 assert.equal(f.writes.length,0);
 assert.match(f.messages.at(-1).msg,/não foi possível confirmar o salvamento local/);
});

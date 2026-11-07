import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('index.html'),audit=read('nexa-audit-outbox-v18.9.19.js'),history=read('nexa-history-recovery-v1.js'),loader=read('nexa-hotfix.js'),worker=read('sw.js');

test('audit outbox derives identity from authenticated runtime, not persisted tokens',()=>{
 assert.match(audit,/nexaClinicalRuntime18121\?\.getProfile\?\.\(\)/);
 assert.doesNotMatch(audit,/localStorage\.getItem\(key\)/);
 assert.match(audit,/async function sessionAuth\(\)/);
 assert.match(audit,/nexa:clinical-structured/);
});
test('structured transcription is durably checkpointed before audio discard',()=>{
 const checkpoint=html.indexOf("await nexaPersistSession('structured')");
 const discard=html.indexOf("audioBlob=null;chunks=[];$('status').textContent='Transcrição salva localmente");
 assert.ok(checkpoint>0&&discard>checkpoint,'structured note must be saved before clearing audio');
 assert.match(html,/if\(structuredSaved\)\{/);
 assert.match(html,/Transcrição pronta, porém NÃO salva/);
 assert.match(html,/const rec=await api\.preserve\(reason\)/);
 assert.match(html,/localStorage\.setItem\(NEXA_SESSION_KEY/);
 assert.doesNotMatch(html,/try\{localStorage\.removeItem\(NEXA_SESSION_KEY\)\}catch\{\}\s*Promise\.resolve\(api\.preserve/);
 assert.match(html,/window\.nexaRecoverSavedEncounter=nexaRecoverSavedEncounter/);
 assert.match(html,/if\(recordOwner!==userId\)/);
 assert.match(html,/await nexaPersistSession\('before_history_recovery'\)/);
 assert.match(html,/await api\.adoptExisting\(canonical\)/);
});
test('recovery UI uses native IndexedDB and owner-scoped server history without new storage',()=>{
 assert.match(history,/nexaEncounterAutosave18101/);
 assert.match(history,/\.from\('consultation_history'\)/);
 assert.match(history,/\.eq\('user_id',p\.id\)/);
 assert.match(history,/item\.owner_user_id\|\|''/);
 assert.match(history,/item\.user_id\|\|''/);
 assert.match(history,/nexaRecoverSavedEncounter\?\.\(row\)/);
 assert.doesNotMatch(history,/indexedDB\.deleteDatabase/);
 assert.doesNotMatch(history,/localStorage\.clear\(\)/);
 assert.match(history,/Nenhuma transcrição com texto encontrada/);
 assert.match(loader,/nexa-history-recovery-v1\.js/);
 assert.match(worker,/nexa-v18-15-0-[a-z0-9-]+/,'service worker cache stays versioned');
});
test('local unsynced record outranks older synced server copy and other doctors stay isolated',()=>{
 let api;const context={window:{},document:{getElementById:()=>null,querySelector:()=>null,createElement:()=>({id:'',textContent:'',style:{}}),addEventListener:()=>{},head:{appendChild(){}}},addEventListener:()=>{},setTimeout:()=>0,Date,console};
 context.window=context;
 new vm.Script(history).runInNewContext(vm.createContext(context));
 api=context.nexaRecoverHistoryV1;
 assert.ok(api?.candidates);
 const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const server=[{encounter_id:id,user_id:'doctor-A',updated_at:'2026-10-20T10:00:00Z',fields:{hda:'Antiga cópia do servidor'}}];
 const local=[{encounter_id:id,owner_user_id:'doctor-A',last_client_saved_at:'2026-10-20T10:02:00Z',fields:{hda:'Nova revisão ainda não sincronizada'}},
  {encounter_id:other,owner_user_id:'doctor-B',last_client_saved_at:'2026-10-20T10:03:00Z',fields:{hda:'Outro profissional'}}];
 const candidates=api.candidates(local,server,'doctor-A');
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].source,'este computador');
 assert.equal(candidates[0].fields.hda,'Nova revisão ainda não sincronizada');
});
test('conflict stays recoverable even when the server has a newer timestamp',()=>{
 let api;
 const context={window:{},document:{getElementById:()=>null,querySelector:()=>null,createElement:()=>({}),addEventListener:()=>{},head:{appendChild(){}}},addEventListener:()=>{},setTimeout:()=>0,Date,console};
 context.window=context;
 new vm.Script(history).runInNewContext(vm.createContext(context));
 api=context.nexaRecoverHistoryV1;
 const id='33333333-3333-4333-8333-333333333333';
 const remote=[{encounter_id:id,user_id:'doctor-A',updated_at:'2026-10-25T16:10:00Z',fields:{hda:'Versão remota mais recente'}}];
 const local=[{encounter_id:id,owner_user_id:'doctor-A',sync_state:'conflict',last_client_saved_at:'2026-10-25T16:00:00Z',fields:{hda:'Versão local em conflito'}}];
 const rows=api.candidates(local,remote,'doctor-A');
 assert.equal(rows.length,1);
 assert.equal(rows[0].source,'este computador');
 assert.equal(rows[0].fields.hda,'Versão local em conflito');
});
test('recovery UI exposes manual CAS retry and authenticated audit submission, without blind upsert',()=>{
 assert.match(history,/Tentar sincronizar/);
 assert.match(history,/api\.syncOne\(current\)/);
 assert.match(history,/Revisar divergência/);
 assert.match(history,/nexaEncounterConflictReview18102/);
 assert.match(history,/out\.submitRemoteEncounter\(row,auth\)/);
 assert.match(history,/auth\.userId!==p\.id/);
 assert.match(history,/sync_state==='conflict'/);
 assert.doesNotMatch(history,/\.upsert\(/);
 assert.match(history,/14\*86400000/);
});



test('session autosave checks exact checkpoint identity before displaying success',async()=>{
 const begin=html.indexOf('  function nexaSameClinicalFields(');
 const end=html.indexOf('  function nexaPersistSessionSoon()',begin);
 assert.ok(begin>0&&end>begin,'checkpoint guard must exist');
 const source=html.slice(begin,end);
 const who={id:'synthetic-owner'};
 const writes=[];
 let visible={hda:'Nota clínica sintética atual',alergias:'Sem alergias referidas'};
 const old={encounter_id:'synthetic-encounter',owner_user_id:who.id,local_revision:1,
   fields:{hda:'Nota clínica sintética antiga',alergias:'Sem alergias referidas'}};
 let durable=old;
 const api={
   collectFields:()=>({...visible}),
   preserve:async()=>({...old}),
   get:async()=>({...durable})
 };
 const currentWindow={nexaEncounterAutosave18101:api};
 const factory=new Function('currentProf','window','q','localStorage','NEXA_SESSION_KEY',
   'nexaSessionState','document','setTimeout','console',
   source+'\nreturn nexaPersistSession;');
 const persist=factory(who,currentWindow,()=>null,{setItem:(...v)=>writes.push(v)},
   'synthetic-session','structured',{body:{dataset:{nexaStage:'summary'}}},()=>0,console);
 await assert.rejects(persist('structured'),/CAMPOS_CLINICOS_NAO_PERSISTIDOS/);
 assert.equal(writes.length,0,'old saved HDA must never receive a success pointer');
 durable={...old,fields:{...visible},local_revision:2};
 api.preserve=async()=>({...durable});
 await persist('structured');
 assert.equal(writes.length,1,'exact match can publish recovery pointer');
 let first=true;
 api.collectFields=()=>first?(first=false,{...visible}):{...visible,hda:'Alteração sintética durante gravação'};
 await assert.rejects(persist('structured'),/CAMPOS_ALTERADOS_DURANTE_SALVAMENTO/);
 assert.equal(writes.length,1,'in-flight clinical edit must never be declared saved');
});

test('history reopen uses the durable local copy instead of an older server row',async()=>{
 const begin=html.indexOf('  async function nexaRecoverSavedEncounter(row){');
 const end=html.indexOf('  window.nexaRecoverSavedEncounter=nexaRecoverSavedEncounter;',begin);
 assert.ok(begin>0&&end>begin,'history reopen implementation must exist');
 const source=html.slice(begin,end);
 const who={id:'synthetic-owner'},id='11111111-1111-4111-8111-111111111111';
 const remote={encounter_id:id,user_id:who.id,fields:{hda:'Cópia sintética antiga do servidor'},
   processing_meta:{},sync_version:2};
 const local={encounter_id:id,owner_user_id:who.id,fields:{hda:'Rascunho sintético mais recente no dispositivo'},
   processing_meta:{},sync_version:2,local_revision:4,sync_state:'pending'};
 const calls=[];
 const win={nexaEncounterAutosave18101:{adoptExisting:async incoming=>{
   calls.push(['adopt',incoming]);return local;
 }}};
 const factory=new Function('window','currentProf','nexaHasMeaningfulSession','nexaPersistSession',
   'nexaRestoreSession',source+'\nreturn nexaRecoverSavedEncounter;');
 const reopen=factory(win,who,()=>false,async reason=>calls.push(['persist',reason]),
   snapshot=>calls.push(['render',snapshot]));
 assert.equal(await reopen(remote),true);
 const rendered=calls.find(call=>call[0]==='render')?.[1];
 assert.equal(rendered.fields.hda,local.fields.hda);
 assert.equal(rendered.encounter_id,id);
 assert.equal(calls.find(call=>call[0]==='persist')?.[1],'history_reopened');
});


test('single-writer recovery pointer follows confirmed local save, not an extra write',async()=>{
 const begin=html.indexOf('  async function nexaUpdatePointerAfterLocalSave(event){');
 const end=html.indexOf("  window.addEventListener('nexa:encounter-local-saved'",begin);
 assert.ok(begin>0&&end>begin,'single writer pointer listener must exist');
 const source=html.slice(begin,end);
 assert.doesNotMatch(html,/document\.addEventListener\('input',e=>\{if\(e\.target\?\.matches\?\.\('textarea,input,select'\)\)nexaPersistSessionSoon\(\)/,
   'input handler must not schedule a second encounter write');
 const who={id:'synthetic-owner'},id='11111111-1111-4111-8111-111111111111';
 const fields={hda:'Evolução sintética preservada',exame_fisico:'Exame sintético'};
 const saved={encounter_id:id,owner_user_id:who.id,fields:{...fields},
   last_client_saved_at:'2026-11-06T12:00:00Z',sync_state:'pending'};
 let currentId=id,visible={...fields},stored={...saved};
 const pointerWrites=[],status={textContent:''};
 const api={
   get:async()=>({...stored}),
   collectFields:()=>({...visible}),
   currentEncounterId:()=>currentId
 };
 const factory=new Function('window','currentProf','localStorage','NEXA_SESSION_KEY',
   'nexaSameClinicalFields','document','nexaSessionState','q',
   source+'\nreturn nexaUpdatePointerAfterLocalSave;');
 const check=factory({nexaEncounterAutosave18101:api},who,
   {setItem:(...args)=>pointerWrites.push(args)},'synthetic-pointer',
   (expected,actual)=>Object.entries(expected).every(([key,val])=>actual[key]===val),
   {body:{dataset:{nexaStage:'summary'}}},'structured',()=>status);
 assert.equal(await check({detail:{encounter_id:id}}),true);
 assert.equal(pointerWrites.length,1);
 const pointer=JSON.parse(pointerWrites[0][1]);
 assert.equal(pointer.encounter_id,id);
 assert.equal(pointer.owner,who.id);
 assert.equal(pointer.saved_at,saved.last_client_saved_at);
 assert.ok(!JSON.stringify(pointer).includes(fields.hda),'never store clinical text in pointer');
 visible={...fields,hda:'Novos dados ainda não salvos'};
 assert.equal(await check({detail:{encounter_id:id}}),false);
 assert.equal(pointerWrites.length,1,'stale clinical fields must not update recovery pointer');
 visible={...fields};currentId='22222222-2222-4222-8222-222222222222';
 assert.equal(await check({detail:{encounter_id:id}}),false);
 assert.equal(pointerWrites.length,1,'old encounter event must not revive a reset session');
 currentId=id;who.id='different-owner';
 assert.equal(await check({detail:{encounter_id:id}}),false);
 assert.equal(pointerWrites.length,1,'other user cannot receive a clinical recovery pointer');
 who.id='synthetic-owner';stored={...saved,sync_state:'conflict'};
 assert.equal(await check({detail:{encounter_id:id}}),true);
 assert.match(status.textContent,/conflito pendente/i);
});


test('deferred local save failure is visible to clinician without showing patient text',()=>{
 const begin=html.indexOf("  window.addEventListener('nexa:encounter-local-save-failed'");
 const end=html.indexOf("  window.addEventListener('beforeunload'",begin);
 assert.ok(begin>0&&end>begin,'local save failure listener must be installed');
 const source=html.slice(begin,end);
 assert.match(source,/ATENÇÃO: alterações não salvas localmente/);
 assert.match(source,/saveState\('error','não salvo · armazenamento local'\)/);
 assert.match(source,/Copie o texto clínico antes de fechar/);
 assert.ok(!source.includes('event.detail.fields'),'failure event must not display clinical content');
 assert.match(html,/nexa-hotfix\.js\?v=20261107-audio-exit-guard/);
 assert.match(worker,/nexa-v18-15-0-audio-exit-guard-20261107/);
 assert.match(worker,/nexa-hotfix\.js\?v=20261107-audio-exit-guard/);
 assert.match(loader,/nexa-encounter-autosave-v18\.10\.1\.js\?v=20261106-server-refresh/);
});

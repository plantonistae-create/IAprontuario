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
   'nexaRestoreSession','recording','recordingStarting','audioBlob','show',
   source+'\nreturn nexaRecoverSavedEncounter;');
 const reopen=factory(win,who,()=>false,async reason=>calls.push(['persist',reason]),
   snapshot=>calls.push(['render',snapshot]),false,false,null,()=>{});
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
 assert.match(html,/nexa-hotfix\.js\?v=20261107-radar-silent-focus-p0/);
 const version=html.match(/nexa-radar-controller\.js\?v=(20261107-[a-z0-9-]+)/)?.[1];
 const cache=worker.match(/const CACHE_NAME="nexa-v18-15-0-(20261107-[a-z0-9-]+)"/)?.[1];
 assert.ok(version,'versioned Radar controller is required');
 assert.equal(cache,version,'worker cache must use current Radar controller release');
 assert.match(worker,/nexa-hotfix\.js\?v=20261107-radar-silent-focus-p0/);
 assert.match(loader,/nexa-encounter-autosave-v18\.10\.1\.js\?v=20261106-server-refresh/);
});


test('unprocessed recorded audio warns before unload even with no clinical text',()=>{
 const begin=html.indexOf('  function nexaShouldWarnBeforeExit(){');
 const end=html.indexOf('  nexaCheckRecoverableSession();',begin);
 assert.ok(begin>0&&end>begin,'exit guard must precede recoverable-session setup');
 const guard=html.slice(begin,end);
 assert.match(guard,/recording\|\|recordingStarting/);
 assert.match(guard,/audioBlob&&audioBlob\.size>0/);
 assert.match(guard,/nexaHasMeaningfulSession\(\)/);
 assert.match(guard,/e\.preventDefault\(\);e\.returnValue=''/);
 const runScenario=({recording=false,starting=false,audioSize=0,hasNote=false})=>{
   let handler=null,checkpointCount=0,prevented=false;
   const win={addEventListener:(name,callback)=>{
     if(name==='beforeunload')handler=callback;
   }};
   const factory=new Function('window','recording','recordingStarting','audioBlob',
     'nexaHasMeaningfulSession','nexaPersistSession',
     guard+'\nreturn window;');
   factory(win,recording,starting,audioSize?{size:audioSize}:null,
     ()=>hasNote,async()=>{checkpointCount++;return null});
   assert.equal(typeof handler,'function');
   const evt={preventDefault:()=>{prevented=true},returnValue:undefined};
   handler(evt);
   return {prevented,returnValue:evt.returnValue,checkpointCount};
 };
 assert.deepEqual(runScenario({}),{prevented:false,returnValue:undefined,checkpointCount:0});
 for(const state of [{audioSize:1800},{recording:true},{starting:true}]){
   const result=runScenario(state);
   assert.equal(result.prevented,true,'recorded/in-progress audio must warn before closing');
   assert.equal(result.returnValue,'');
   assert.equal(result.checkpointCount,0,'audio-only session cannot falsely claim audio persistence');
 }
 const withNote=runScenario({hasNote:true});
 assert.equal(withNote.prevented,true);
 assert.equal(withNote.checkpointCount,1,'clinical text should still trigger the IndexedDB checkpoint');
 assert.match(html,/áudio ainda apenas na memória · transcreva antes de sair/,
   'recording completion must clearly warn that audio is not durably stored');
});


test('legacy seven-day history cannot silently discard the open clinical note or audio',async()=>{
 const legacy=html.slice(html.indexOf('async function loadHistory(){'),html.indexOf("$('historyHead').onclick",html.indexOf('async function loadHistory(){')));
 assert.match(legacy,/const ownerAtRequest=String\(currentProf\?\.id\|\|''\)/);
 assert.match(legacy,/if\(currentProf\?\.id!==ownerAtRequest\)return/);
 assert.match(legacy,/\.eq\('user_id',ownerAtRequest\)/);
 assert.match(legacy,/history=\(data\|\|\[\]\)\.map\(row=>\(\{\.\.\.row,encounter_id:row\.id,user_id:ownerAtRequest\}\)\)/);
 assert.match(legacy,/await window\.nexaRecoverSavedEncounter\(r\)/);
 assert.doesNotMatch(legacy,/\(\)=>\{clearClinicalSession\(\);fill\(r\.fields\|\|\{\}\)/,
   'opening an old history item must not wipe the current consultation directly');
 const begin=html.indexOf('  async function nexaRecoverSavedEncounter(row){');
 const end=html.indexOf('  window.nexaRecoverSavedEncounter=nexaRecoverSavedEncounter;',begin);
 assert.ok(begin>0&&end>begin,'canonical history recovery must exist');
 const source=html.slice(begin,end);
 assert.ok(source.indexOf("if(recording||recordingStarting||(audioBlob&&audioBlob.size>0))")
   < source.indexOf("await nexaPersistSession('before_history_recovery')"),
   'volatile audio guard must precede any history switch');
 const id='88888888-8888-4888-8888-888888888888';
 const row={encounter_id:id,user_id:'synthetic-owner',fields:{hda:'Consulta sintética arquivada'}};
 for(const state of [{recording:true,starting:false,audio:null},{recording:false,starting:true,audio:null},{recording:false,starting:false,audio:{size:1024}}]){
   let calls=0,adoptCalls=0,persistCalls=0;
   const factory=new Function('currentProf','recording','recordingStarting','audioBlob',
     'show','nexaHasMeaningfulSession','nexaPersistSession','window',
     'nexaRestoreSession','confirm',
     source+'\nreturn nexaRecoverSavedEncounter;');
   const reopen=factory({id:'synthetic-owner'},state.recording,state.starting,state.audio,
     ()=>{calls++;},()=>false,async()=>{persistCalls++;},
     {nexaEncounterAutosave18101:{adoptExisting:async()=>{adoptCalls++;}}},
     ()=>{},()=>true);
   assert.equal(await reopen(row),false);
   assert.equal(calls,1,'physician must receive a clear warning before switching');
   assert.equal(adoptCalls,0,'the clinical record must not be replaced while audio is volatile');
   assert.equal(persistCalls,0,'audio-only guard must not pretend a text checkpoint saved the audio');
 }
});


test('radar reset delegates exactly once without pre-clearing recovery pointers',()=>{
 const begin=html.indexOf("  q('nexaRadarResetBtn')?.addEventListener('click',()=>{");
 const end=html.indexOf("  q('nexaHomeNav')?.addEventListener",begin);
 assert.ok(begin>0&&end>begin,'radar reset handler must exist');
 const source=html.slice(begin,end);
 assert.doesNotMatch(source,/nexaClearPersistedSession\(/,
   'never erase a recoverable session before confirming the native reset');
 assert.doesNotMatch(source,/nexaConfirmReset\(/,
   'only the canonical reset handler may request confirmation');
 assert.doesNotMatch(source,/nexaSetSessionState\('idle'\)/,
   'cancelled reset must not transition session to idle');
 let handler=null,clicks=0,pointers=0;
 const q=id=>id==='nexaRadarResetBtn'
   ?{addEventListener:(name,fn)=>{assert.equal(name,'click');handler=fn}}
   :id==='resetBtn'?{click:()=>{clicks++}}:null;
 new Function('q',source)(q);
 assert.equal(typeof handler,'function');
 handler();
 assert.equal(clicks,1,'radar reset must invoke the canonical reset once');
 assert.equal(pointers,0,'fallback never removes pointer without verified reset');
 assert.match(html,/window\.addEventListener\('nexa:consultation-reset',\(\)=>\{nexaSetSessionState\('idle'\)/,
   'reset-completed event must own the idle transition');
});

test('canonical native reset blocks volatile audio and confirms only clinical text',()=>{
 const begin=html.indexOf('  function nexaConfirmReset(){');
 const end=html.indexOf('  function nexaAddConductTimestamp(){',begin);
 assert.ok(begin>0&&end>begin,'native reset guard must exist');
 const source=html.slice(begin,end);
 const run=({recording=false,starting=false,size=0,hasNote=false,confirmAnswer=true})=>{
   let confirms=0,warnings=0;
   const factory=new Function('recording','recordingStarting','audioBlob',
     'nexaHasMeaningfulSession','show','confirm',
     source+'\nreturn nexaConfirmReset;');
   const fn=factory(recording,starting,size?{size}:null,()=>hasNote,
     (message,isError)=>{assert.equal(isError,true);warnings++},
     ()=>{confirms++;return confirmAnswer});
   return {allowed:fn(),confirms,warnings};
 };
 assert.deepEqual(run({}),{allowed:true,confirms:0,warnings:0});
 assert.deepEqual(run({hasNote:true,confirmAnswer:false}),{allowed:false,confirms:1,warnings:0});
 assert.deepEqual(run({hasNote:true,confirmAnswer:true}),{allowed:true,confirms:1,warnings:0});
 for(const state of [{recording:true},{starting:true},{size:2048}]){
   assert.deepEqual(run(state),{allowed:false,confirms:0,warnings:1},
     'audio in memory cannot be discarded by fallback reset');
 }
});


test('legacy history filters owners and waits for confirmed deletion',async()=>{
 const begin=html.indexOf('function renderHistory(){');
 const end=html.indexOf("$('historyHead').onclick",begin);
 assert.ok(begin>0&&end>begin,'legacy seven-day history must exist');
 const source=html.slice(begin,end);
 const profile={id:'doctor-A'};
 const idA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',idB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const initial=[
  {id:idA,user_id:'doctor-A',created_at:'2026-11-07T03:00:00Z',fields:{hda:'Texto fictício A',queixa_principal:'Teste A'}},
  {id:idB,user_id:'doctor-B',created_at:'2026-11-07T03:10:00Z',fields:{hda:'Texto fictício B',queixa_principal:'Teste B'}}
 ];
 let rendered=[],queries=[],messages=[],confirmCount=0;
 let reply={data:[],error:{code:'42501'}};
 const nodes={
  historyCount:{textContent:''},
  historyBody:{classList:{contains:()=>false}},
  historyList:{replaceChildren(){rendered=[]},set innerHTML(value){this.empty=value}}
 };
 const query=()=>({
  eq(key,value){queries.push([key,value]);return this},
  async select(){return reply}
 });
 const db={from:table=>{assert.equal(table,'consultation_history');return{delete:query}}};
 const item=(_host,title,desc,open,remove)=>rendered.push({title,desc,open,remove});
 const helpers=new Function('history','currentProf','$','item','sb','confirm',
   'window','activeHistoryId','saveState','console','show',
   source+'\nreturn {renderHistory, remaining:()=>history};');
 const ui=helpers(initial,profile,name=>nodes[name],item,db,()=>{confirmCount++;return true},
   {nexaRecoverSavedEncounter:async()=>true},null,()=>{},
   {warn:()=>{}},(message,isError)=>{assert.equal(isError,true);messages.push(message)});
 ui.renderHistory();
 assert.equal(rendered.length,1,'doctor A must not see doctor B clinical excerpt');
 assert.match(rendered[0].desc,/Texto fictício A/);
 assert.doesNotMatch(rendered[0].desc,/Texto fictício B/);
 const staleAction=rendered[0].remove;
 profile.id='doctor-B';
 await staleAction();
 assert.equal(confirmCount,0,'stale doctor A callback must not attempt deletion');
 assert.equal(queries.length,0,'stale callback cannot call delete');
 assert.equal(rendered.length,1);
 assert.match(rendered[0].desc,/Texto fictício B/);
 profile.id='doctor-A';ui.renderHistory();
 reply={data:[],error:{code:'42501'}};
 await rendered[0].remove();
 assert.equal(rendered.length,1,'failed server deletion must not remove patient history');
 assert.equal(messages.length,1);
 assert.deepEqual(queries.slice(-2),[['id',idA],['user_id','doctor-A']]);
 reply={data:[],error:null};
 await rendered[0].remove();
 assert.equal(rendered.length,1,'zero-row deletion must not be treated as success');
 assert.equal(messages.length,2);
 reply={data:[{id:idA}],error:null};
 await rendered[0].remove();
 assert.equal(rendered.length,0,'a verified server acknowledgement may remove the item');
 assert.equal(ui.remaining().length,1);
 assert.equal(ui.remaining()[0].id,idB);
 profile.id='doctor-B';ui.renderHistory();
 assert.equal(rendered.length,1,'the second doctor still sees only their own history');
 assert.match(rendered[0].desc,/Texto fictício B/);
});

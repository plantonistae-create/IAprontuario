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
 assert.match(worker,/nexa-v18-15-0-core-audit-v4-reset-20261025/);
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

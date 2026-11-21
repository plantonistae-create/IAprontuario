import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const base = new URL('../supabase/proposals/V459/', import.meta.url);
const migration = readFileSync(new URL('owner_scoped_identity.CANDIDATE.sql',base),'utf8');
const rollback = readFileSync(new URL('rollback_owner_scoped_identity.CANDIDATE.sql',base),'utf8');
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const E='33333333-3333-4333-8333-333333333333';

// Deliberately only a model. These tests do not execute SQL or prove Postgres RLS.
class OwnerScopedModel {
  constructor(){this.rows=[];this.audit=[];}
  insert(actor,{id,encounter_id,user_id,fields}){
    if(actor!==user_id)throw Error('RLS_OWNER_DENIED');
    if(!user_id)throw Error('NULL_OWNER');
    if(this.rows.some(x=>x.user_id===user_id&&(x.id===id||x.encounter_id===encounter_id)))
      throw Error('23505_OWNER_CONFLICT');
    const row={id,encounter_id,user_id,fields,sync_version:0};
    this.rows.push(row);this.audit.push({user_id,consultation_id:id,action:'create'});
    return {...row};
  }
  find(actor,id){return this.rows.find(r=>r.user_id===actor&&r.id===id)||null;}
  update(actor,id,version,fields){
    const r=this.rows.find(x=>x.user_id===actor&&x.id===id&&x.sync_version===version);
    if(!r)return null;
    r.fields=fields;r.sync_version++;
    this.audit.push({user_id:actor,consultation_id:id,action:'update'});
    return {...r};
  }
  remove(actor,id){const i=this.rows.findIndex(x=>x.user_id===actor&&x.id===id);if(i<0)return false;this.rows.splice(i,1);return true;}
}

const count=(src,part)=>src.split(part).length-1;
test('SQL candidates live under proposals, not auto-applied migrations',()=>{
  assert.match(import.meta.url,/tests\/nexa-v459-owner-identity\.offline\.test\.mjs/);
  assert.match(migration,/CANDIDATE ONLY/);
  assert.match(rollback,/CANDIDATE ROLLBACK ONLY/);
});
test('both SQL scripts execute one transaction with short lock timeout',()=>{
  for(const s of [migration,rollback]){
    assert.match(s,/^BEGIN;/m);assert.match(s,/^COMMIT;/m);
    assert.match(s,/SET LOCAL lock_timeout = '2s'/);
    assert.match(s,/LOCK TABLE public\.consultation_history IN ACCESS EXCLUSIVE MODE/);
    assert.equal(count(s,'BEGIN;'),1);assert.equal(count(s,'COMMIT;'),1);
  }
});
test('migration refuses NULL owners, owner-scoped duplicates, and unreviewed FKs',()=>{
  for(const code of ['V459_STOP_NULL_OWNER_REQUIRES_SEPARATE_ADJUDICATION','V459_STOP_OWNER_SCOPED_DUPLICATES',
    'V459_STOP_UNREVIEWED_FOREIGN_KEY','V459_STOP_UNKNOWN_PRIMARY_KEY']) assert.ok(migration.includes(code));
  assert.match(migration,/ALTER COLUMN user_id SET NOT NULL/);
});
test('migration protects audit trigger contract and global audit uniqueness',()=>{
  assert.match(migration,/to_regclass\('public\.audit_log'\)/);
  assert.match(migration,/V459_STOP_AUDIT_LOG_GLOBAL_UNIQUENESS/);
  assert.doesNotMatch(migration,/DROP TRIGGER|DISABLE TRIGGER|ALTER FUNCTION|DROP FUNCTION/);
});
test('migration replaces BOTH global key constraints, preserving id values',()=>{
  assert.match(migration,/PRIMARY KEY \(user_id, id\)/);
  assert.match(migration,/ON public\.consultation_history \(user_id, encounter_id\)/);
  assert.match(migration,/DROP INDEX IF EXISTS public\.consultation_history_encounter_id_uidx/);
  assert.match(migration,/DROP CONSTRAINT consultation_history_pkey/);
  assert.doesNotMatch(migration,/UPDATE public\.consultation_history|DELETE FROM public\.consultation_history|SET id\s*=/);
});
test('new indexes and key are guarded for idempotence and unexpected state',()=>{
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS consultation_history_owner_encounter_uidx/);
  assert.match(migration,/PRIMARY KEY \(id\)/);
  assert.match(migration,/V459_STOP_INDEX_NAME_COLLISION/);
  assert.match(migration,/V459_STOP_POSTCHECK_FAILED/);
  assert.match(migration,/V459_STOP_GLOBAL_UNIQUE_REMAINING/);
});
test('rollback explicitly refuses global duplicates before restoring uniqueness',()=>{
  assert.match(rollback,/GROUP BY id HAVING count\(\*\) > 1/);
  assert.match(rollback,/GROUP BY encounter_id HAVING count\(\*\) > 1/);
  assert.match(rollback,/V459_ROLLBACK_BLOCKED_GLOBAL_DUPLICATES/);
  assert.match(rollback,/PRIMARY KEY \(id\)/);
  assert.match(rollback,/ON public\.consultation_history \(encounter_id\)/);
  assert.doesNotMatch(rollback,/DELETE FROM|TRUNCATE|SET id\s*=/);
});
test('two owners may store the same id and encounter UUID in scoped model',()=>{
  const m=new OwnerScopedModel();const x={id:E,encounter_id:E,fields:{hda:'FICTIONAL_A'}};
  m.insert(A,{...x,user_id:A});m.insert(B,{...x,user_id:B,fields:{hda:'FICTIONAL_B'}});
  assert.equal(m.find(A,E).fields.hda,'FICTIONAL_A');assert.equal(m.find(B,E).fields.hda,'FICTIONAL_B');
  assert.deepEqual(m.audit.map(x=>x.user_id),[A,B]);
});
test('same-owner collisions remain rejected for both id and encounter_id',()=>{
  const m=new OwnerScopedModel();m.insert(A,{id:E,encounter_id:E,user_id:A,fields:{}});
  assert.throws(()=>m.insert(A,{id:E,encounter_id:'44444444-4444-4444-8444-444444444444',user_id:A,fields:{}}),/23505/);
  assert.throws(()=>m.insert(A,{id:'legacy_text',encounter_id:E,user_id:A,fields:{}}),/23505/);
});
test('negative cross-owner SELECT/UPDATE/DELETE/INSERT in the scoped model',()=>{
  const m=new OwnerScopedModel();m.insert(A,{id:E,encounter_id:E,user_id:A,fields:{hda:'PRIVATE_A'}});
  assert.equal(m.find(B,E),null);
  assert.equal(m.update(B,E,0,{hda:'ATTACK'}),null);
  assert.equal(m.remove(B,E),false);
  assert.throws(()=>m.insert(B,{id:'other',encounter_id:E,user_id:A,fields:{}}),/RLS_OWNER_DENIED/);
  assert.equal(m.find(A,E).fields.hda,'PRIVATE_A');
});
test('compare-and-swap prevents stale same-owner edits',()=>{
  const m=new OwnerScopedModel();m.insert(A,{id:E,encounter_id:E,user_id:A,fields:{hda:'A0'}});
  assert.equal(m.update(A,E,0,{hda:'A1'}).sync_version,1);
  assert.equal(m.update(A,E,0,{hda:'STALE'}),null);
  assert.equal(m.find(A,E).fields.hda,'A1');
});
test('existing client write contract is owner-scoped (if checkout source present)',t=>{
  const candidate=new URL('../nexa-encounter-autosave-v18.10.1.js',import.meta.url);
  if(!existsSync(candidate)){t.skip('Full checkout client source unavailable in isolated test scratch');return;}
  const src=readFileSync(candidate,'utf8');
  assert.match(src,/id:rec\.encounter_id,encounter_id:rec\.encounter_id,user_id:rec\.owner_user_id/);
  assert.match(src,/\.eq\('id',rec\.encounter_id\)\.eq\('user_id',rec\.owner_user_id\)\.eq\('sync_version',expected\)/);
  assert.doesNotMatch(src,/onConflict\s*:\s*['"]encounter_id/);
});

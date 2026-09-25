import fs from 'node:fs';
import assert from 'node:assert/strict';
import { normalizeSnapshotVersion, safeCoreContext, validateDeidentifiedEnvelope } from '../supabase/functions/submit-audit-case/audit-contract.mjs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260913034000_audit_pipeline_core_dataset_v18919.sql',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('../supabase/migrations/20260925174500_audit_auto_queue_v18101.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/submit-audit-case/index.ts',import.meta.url),'utf8');

assert.equal(normalizeSnapshotVersion(undefined),'final-v1');
assert.equal(normalizeSnapshotVersion('final-v2'),'final-v2');
assert.equal(normalizeSnapshotVersion('bad value'),'final-v1');

const ctx=safeCoreContext({schema_version:'3',destination:{recommended:'alta',final:'internacao',status:'altered'},hypothesis_validation:{ai:'A',final:'B',cid:'Z00.0'},learning_layers:{original_ai:{hypothesis:'A'},physician_final:{hypothesis:'B'},audit_corrected:null},audit_submission_snapshot:{source_consultation_id:'11111111-1111-4111-8111-111111111111',frontend_version:'18.9.19'}});
assert.equal(ctx.destination.recommended,'alta');
assert.equal(ctx.destination.final,'internacao');
assert.equal(ctx.learning_layers.original_ai.hypothesis,'A');
assert.equal(ctx.learning_layers.physician_final.hypothesis,'B');
assert.equal(ctx.learning_layers.audit_corrected,null);

for(const bad of [
  {},
  {fields:{hda:'ok'},core_context:null},
  {fields:null,core_context:{}},
  {fields:{email:'teste@example.invalid'},core_context:{}},
  {fields:{hda:'CPF 123.456.789-00'},core_context:{}},
  {fields:{hda:'Paciente: Nome Ficticio relata dor'},core_context:{}}
]) assert.equal(validateDeidentifiedEnvelope(bad).ok,false,JSON.stringify(bad));

const good={fields:{hda:'Paciente adulto relata dor toracica ha duas horas.'},core_context:{learning_layers:{original_ai:{hypothesis:'dor toracica'},physician_final:{hypothesis:'dor toracica'},audit_corrected:null}}};
assert.equal(validateDeidentifiedEnvelope(good,{requireLearningLayers:true}).ok,true);

for(const token of ["eq('snapshot_version',snapshotVersion)","validateDeidentifiedEnvelope","audit_schema_version:'3'","ALREADY_SUBMITTED","ALREADY_REVIEWED","SOURCE_NOT_READY","source_sync_version","encounter_state","AUDIT_UPDATE_FAILED"])assert.ok(edge.includes(token),`edge missing ${token}`);
for(const token of ['snapshot_version text not null','unique(source_consultation_id,snapshot_version)','returns void','for update','AUDIT_REVIEW_CONFLICT',"decision='discarded'",'delete from public.nexa_core_cases',"decision='corrected'","'{audit_corrected}'","'original_ai'","'physician_final'","'target'",'security definer','set search_path=public,pg_temp','grant execute on function public.submit_audit_review','revoke all on function public.get_audit_queue(text) from anon','grant execute on function public.get_audit_queue(text) to authenticated','revoke all on function public.get_core_dataset_summary() from anon','grant execute on function public.get_core_dataset_summary() to authenticated','quality_status','case_data','learning_profile','get_audit_queue_v2','get_audit_dashboard','DISCARD_REASON_REQUIRED','encounter_state','audit_cases_queue_priority_idx'])assert.ok(migration.toLowerCase().includes(token.toLowerCase()),`migration missing ${token}`);
assert.ok(!migration.includes("returns jsonb"));
console.log('NEXA Audit backend contract: PASS');

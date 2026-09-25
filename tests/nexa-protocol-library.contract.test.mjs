import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260925183000_protocol_library_v18101.sql',import.meta.url),'utf8');
const admin=fs.readFileSync(new URL('../supabase/functions/admin-protocols/index.ts',import.meta.url),'utf8');
const library=fs.readFileSync(new URL('../supabase/functions/protocol-library/index.ts',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../nexa-protocol-library-v18.10.1.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const autosave=fs.readFileSync(new URL('../nexa-encounter-autosave-v18.10.1.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../nexa-hotfix.js',import.meta.url),'utf8');

for(const token of [
  'create table if not exists public.nexa_clinical_protocols',
  'create table if not exists public.nexa_protocol_versions',
  'unique(protocol_id,version_no)',
  'active_version_id uuid',
  "status in ('draft','review','approved','archived')",
  "jsonb_typeof(prescription_items)='array'",
  "add column if not exists protocol_usage jsonb",
  'revoke all on public.nexa_clinical_protocols from anon,authenticated',
  'revoke all on public.nexa_protocol_versions from anon,authenticated',
]) assert.ok(migration.toLowerCase().includes(token.toLowerCase()),`migration missing ${token}`);

for(const token of ["action==='list'","action==='get'","action==='save_draft'","action==='submit_review'","action==='publish'","status:'archived'","active_version_id:vid","prescription_items:rxItems"]) {
  assert.ok(admin.includes(token),`admin API missing ${token}`);
}

for(const token of [".not('active_version_id','is',null)",".eq('status','approved')","match_terms","cid10","prescription_items","PROTOCOL_ACCESS_REQUIRED"]) {
  assert.ok(library.includes(token),`published library missing ${token}`);
}

for(const token of ['nexaOpenProtocolLibrary18101','protocol-library','data-npl-id','nplUse','nexaInsertProtocolPrescription18101']) {
  assert.ok(ui.includes(token),`protocol UI missing ${token}`);
}
for(const token of ['searchProtocolRxBtn','nexaInsertProtocolPrescription18101','rxComposer.options','protocol_version_id','protocolLibraryPath']) {
  assert.ok(index.includes(token),`prescription integration missing ${token}`);
}
for(const token of ['protocol_usage','window.__NEXA_PROTOCOL_USAGE__'])assert.ok(autosave.includes(token),`autosave missing ${token}`);
assert.ok(loader.includes('nexa-protocol-library-v18.10.1.js'),'protocol library not loaded');

assert.ok(!admin.match(/paracetamol|dipirona|amoxicilina|salbutamol/i),'backend must not seed clinical prescriptions');
assert.ok(!migration.match(/paracetamol|dipirona|amoxicilina|salbutamol/i),'migration must not seed clinical prescriptions');

console.log('NEXA published protocol library + prescription contract: PASS');

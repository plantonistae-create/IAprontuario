import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalJson, readVerifiedTextPackage, TextReadbackError } from '../supabase/functions/_shared/nexa-clinical-text-readback.mjs';

const doctor = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const encounter = '33333333-3333-4333-8333-333333333333';
const row = { user_id: doctor, encounter_id: encounter, sync_version: 3,
  updated_at: '2026-11-16T12:00:00Z', encounter_state: 'draft', consent_recorded_at: null,
  fields: { hda: 'Atendimento inteiramente fictício', conduta: 'Observação fictícia' },
  processing_meta: { radar: { items: [2,1] } }, protocol_usage: [] };
const capability = { access_status: 'active', clinical_access: true };
const hashCanonical = async text => createHash('sha256').update(text, 'utf8').digest('hex');
const request = { encounter_id: encounter, expected_sync_version: 3 };
function run(change = {}) {
  return readVerifiedTextPackage({ actor: doctor, capability, request,
    lookup: async () => structuredClone(row), hashCanonical, ...change });
}
async function denied(promise, code) {
  await assert.rejects(promise, e => e instanceof TextReadbackError && e.code === code);
}

test('authenticated owner receives current textual package, exact version and verified SHA-256', async () => {
  const out = await run();
  assert.equal(out.verified, true);
  assert.equal(out.package.sync_version, 3);
  assert.deepEqual(out.package.fields, row.fields);
  assert.equal(out.canonical_sha256, await hashCanonical(canonicalJson(out.package)));
  assert.equal(out.durable_archive, false);
  assert.equal(out.audio_included, false);
});
test('canonical JSON hash is key-order independent, preserving array order', () => {
  assert.equal(canonicalJson({b:1,a:{z:2,y:3}}), canonicalJson({a:{y:3,z:2},b:1}));
  assert.notEqual(canonicalJson({a:[1,2]}), canonicalJson({a:[2,1]}));
});
test('cross-owner row never returns clinical text', async () => {
  await denied(run({lookup: async () => ({...row,user_id:other})}), 'OWNER_SCOPE_VIOLATION');
  await denied(run({actor:other}), 'OWNER_SCOPE_VIOLATION');
});
test('missing row and revoked clinical access fail closed', async () => {
  await denied(run({lookup:async()=>null}), 'SOURCE_NOT_FOUND');
  await denied(run({capability:{access_status:'inactive',clinical_access:true}}), 'CLINICAL_ACCESS_REQUIRED');
});
test('changed server version or divergent content hash must be rejected', async () => {
  await denied(run({request:{...request,expected_sync_version:2}}), 'SOURCE_VERSION_CHANGED');
  const original = await run();
  const changed = {...row,fields:{...row.fields,hda:'Conteúdo fictício alterado'}};
  await denied(run({request:{...request,expected_sha256:original.canonical_sha256},lookup:async()=>changed}), 'SOURCE_CONTENT_MISMATCH');
});
test('untrusted payload fields and invalid source content rejected', async () => {
  await denied(run({request:{...request,fields:row.fields}}), 'INVALID_REQUEST');
  await denied(run({lookup:async()=>({...row,fields:null})}), 'SOURCE_INVALID');
});
test('endpoint requires verified JWT and owner-scoped RLS without service key or writes', () => {
  const source=readFileSync(new URL('../supabase/functions/nexa-clinical-text-readback/index.ts',import.meta.url),'utf8');
  assert.match(source,/auth\.getUser\(\)/);
  assert.match(source,/rpc\('get_my_capabilities'\)/);
  assert.match(source,/\.from\('consultation_history'\)/);
  assert.match(source,/\.eq\('encounter_id', encounter_id\)\.eq\('user_id', owner\)/);
  assert.match(source,/NEXA_TEXT_READBACK_ENABLED/);
  assert.match(source,/no-store/);
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

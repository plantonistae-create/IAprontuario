// V4.98: source-only safety regression. No network, DB, browser or clinical data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('legacy physician attestation cannot issue patient consent, independently of outer STOP', () => {
  const edge = read('supabase/functions/nexa-source-actions/index.ts');
  const outer = edge.indexOf('if (!DEPLOYED_SOURCE_ACTION_WRITER_AUTHORIZED)');
  const decoded = edge.indexOf('const request = decodeRequest(JSON.parse(bodyText));');
  const guard = edge.indexOf('if (request.kind === "record" && request.params.p_kind === "consent")');
  const firstRpc = edge.indexOf('await db.rpc("has_active_clinical_access")');
  const write = edge.indexOf('await db.rpc("nexa_p0_record_source_action"');
  assert.ok(outer >= 0 && outer < decoded && decoded < guard);
  assert.ok(guard < firstRpc && firstRpc < write,
    'patient-consent denial must precede source mutations and event writes');
  const branch = edge.slice(guard, edge.indexOf('if (request.kind === "bootstrap")', guard));
  assert.match(branch, /PATIENT_CONFIRMED_CONSENT_AUTHORITY_NOT_PROVEN/);
  assert.match(branch, /external_ai_authorized: false/);
  assert.match(branch, /gate_c_verified: false/);
  assert.match(branch, /\}, 423\)/);
  const ui = read('nexa-p0-physician-source-review.js');
  assert.match(ui, /pre_egress_source_verified!==true/);
  const sql = read('supabase/migrations/20261114190000_nexa_p0_source_action_writer_REVIEW_ONLY.sql');
  assert.match(sql, /No policy rows are seeded/);
  assert.match(sql, /STOP_WRITER176_ROLE_RLS_REVIEW_ONLY_NOT_AUTHORIZED/);
});

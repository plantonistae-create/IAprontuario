import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { TARGET, evaluateMigrationGate } from '../scripts/nexa-openai-migration-gate.mjs';

const checks = {
  billing_ready: true,
  privacy_approved: true,
  old_key_escrow_verified: true,
  service_account_key_created: true,
  new_key_attested_with_synthetic_request: true,
  new_key_present_in_staging: true,
  vector_store_access_verified: true,
  staging_functions_verified: true,
  staging_jwt_rls_verified: true,
  staging_synthetic_flows_passed: true,
  hosted_bundle_baseline_verified: true,
  rollback_rehearsed: true,
  admin_key_remains_separate: true,
};
const full = () => ({
  schema_version: 1,
  browser: { ...TARGET },
  credential: { ...TARGET },
  spend: { monthly_budget_usd: 100, alerts_usd: [50, 80, 100], hard_limit_enabled: false },
  checks: { ...checks },
});

test('records complete synthetic predicates without authorizing a cutover', () => {
  const result = evaluateMigrationGate(full());
  assert.equal(result.status, 'PRECONDITIONS_RECORDED');
  assert.deepEqual(result.blocked, []);
  assert.equal(result.authorizes_secret_rotation, false);
  assert.equal(result.authorizes_clinical_data_transfer, false);
});

test('blocks the wrong OpenAI organization and unattested credential scope', () => {
  const input = full();
  input.browser.organization_id = 'org-XmRFkJwlfJuGPMDJOF35kbGF';
  input.credential.organization_id = null;
  input.credential.project_id = null;
  const blocked = evaluateMigrationGate(input).blocked;
  assert.ok(blocked.includes('WRONG_BROWSER_TARGET'));
  assert.ok(blocked.includes('CREDENTIAL_SCOPE_UNVERIFIED'));
});

test('blocks incomplete billing, hard limit, missing clinical privacy and rollback', () => {
  const input = full();
  input.spend.monthly_budget_usd = null;
  input.spend.alerts_usd = [50, 80];
  input.spend.hard_limit_enabled = true;
  input.checks.privacy_approved = false;
  input.checks.old_key_escrow_verified = false;
  input.checks.rollback_rehearsed = false;
  const blocked = evaluateMigrationGate(input).blocked;
  for (const code of ['BUDGET_OR_ALERTS_INCOMPLETE', 'HARD_SPEND_LIMIT_ENABLED',
    'PRIVACY_APPROVED', 'OLD_KEY_ESCROW_VERIFIED', 'ROLLBACK_REHEARSED']) {
    assert.ok(blocked.includes(code), code);
  }
});

test('blocks staging isolation, vector search and hosted-function gaps separately', () => {
  const input = full();
  for (const field of ['vector_store_access_verified', 'staging_functions_verified',
    'staging_jwt_rls_verified', 'staging_synthetic_flows_passed',
    'hosted_bundle_baseline_verified', 'admin_key_remains_separate']) input.checks[field] = false;
  assert.equal(evaluateMigrationGate(input).blocked.length, 6);
});

test('rejects keys, clinical text and unexpected metadata without echoing input', () => {
  for (const extra of [
    { OPENAI_API_KEY: 'FAKE_SECRET_VALUE' },
    { transcript: 'synthetic patient text' },
    { encounter_id: 'synthetic-private-id' },
  ]) {
    const input = { ...full(), ...extra };
    assert.throws(() => evaluateMigrationGate(input), /SANITIZED_METADATA_REQUIRED/);
    const run = spawnSync(process.execPath, ['scripts/nexa-openai-migration-gate.mjs'], {
      input: JSON.stringify(input), encoding: 'utf8',
    });
    assert.equal(run.status, 1);
    assert.equal(run.stdout, '');
    assert.doesNotMatch(run.stderr, /FAKE_SECRET_VALUE|synthetic patient text|synthetic-private-id/);
  }
});

test('the CLI gate fails closed on an incomplete synthetic inventory', () => {
  const input = full();
  input.checks.new_key_present_in_staging = false;
  const run = spawnSync(process.execPath,
    ['scripts/nexa-openai-migration-gate.mjs', '--require-ready'],
    { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stdout, /NEW_KEY_PRESENT_IN_STAGING/);
});

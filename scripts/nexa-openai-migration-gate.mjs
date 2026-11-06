// Offline preflight only. Never accepts API keys, clinical content or raw logs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TARGET = Object.freeze({
  organization_id: 'org-l5gc98PRIumcyvgT68IKPZpf',
  project_id: 'proj_pdlp9hhuhMIOI3TOUMhxLcpt',
});

const CHECKS = Object.freeze([
  'billing_ready',
  'privacy_approved',
  'old_key_escrow_verified',
  'service_account_key_created',
  'new_key_attested_with_synthetic_request',
  'new_key_present_in_staging',
  'vector_store_access_verified',
  'staging_functions_verified',
  'staging_jwt_rls_verified',
  'staging_synthetic_flows_passed',
  'hosted_bundle_baseline_verified',
  'rollback_rehearsed',
  'admin_key_remains_separate',
]);

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key)) ||
      keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error('SANITIZED_METADATA_REQUIRED');
  }
}

function id(value, prefix) {
  return value === null || (typeof value === 'string' &&
    new RegExp('^' + prefix + '[A-Za-z0-9]{8,40}$').test(value));
}

export function evaluateMigrationGate(input) {
  exactObject(input, ['schema_version', 'browser', 'credential', 'spend', 'checks']);
  if (input.schema_version !== 1) throw new Error('UNSUPPORTED_SCHEMA');
  exactObject(input.browser, ['organization_id', 'project_id']);
  exactObject(input.credential, ['organization_id', 'project_id']);
  exactObject(input.spend, ['monthly_budget_usd', 'alerts_usd', 'hard_limit_enabled']);
  exactObject(input.checks, CHECKS);
  if (![input.browser.organization_id, input.credential.organization_id].every(v => id(v, 'org-')) ||
      ![input.browser.project_id, input.credential.project_id].every(v => id(v, 'proj_')) ||
      Object.values(input.checks).some(v => typeof v !== 'boolean') ||
      !(input.spend.monthly_budget_usd === null || input.spend.monthly_budget_usd === 100) ||
      !Array.isArray(input.spend.alerts_usd) ||
      input.spend.alerts_usd.length > 3 ||
      input.spend.alerts_usd.some(v => ![50, 80, 100].includes(v)) ||
      new Set(input.spend.alerts_usd).size !== input.spend.alerts_usd.length ||
      typeof input.spend.hard_limit_enabled !== 'boolean') {
    throw new Error('INVALID_SANITIZED_METADATA');
  }

  const blocked = [];
  if (input.browser.organization_id !== TARGET.organization_id ||
      input.browser.project_id !== TARGET.project_id) blocked.push('WRONG_BROWSER_TARGET');
  if (input.credential.organization_id !== TARGET.organization_id ||
      input.credential.project_id !== TARGET.project_id) blocked.push('CREDENTIAL_SCOPE_UNVERIFIED');
  if (input.spend.monthly_budget_usd !== 100 ||
      [50, 80, 100].some(v => !input.spend.alerts_usd.includes(v))) blocked.push('BUDGET_OR_ALERTS_INCOMPLETE');
  if (input.spend.hard_limit_enabled) blocked.push('HARD_SPEND_LIMIT_ENABLED');
  for (const check of CHECKS) if (!input.checks[check]) blocked.push(check.toUpperCase());
  return {
    classification: 'OFFLINE_SELF_REPORTED_PREFLIGHT_NOT_LIVE_ATTESTATION',
    target: TARGET,
    status: blocked.length ? 'BLOCKED' : 'PRECONDITIONS_RECORDED',
    blocked,
    authorizes_secret_rotation: false,
    authorizes_clinical_data_transfer: false,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const raw = readFileSync(0, 'utf8');
    if (Buffer.byteLength(raw) > 16384) throw new Error('INPUT_TOO_LARGE');
    const result = evaluateMigrationGate(JSON.parse(raw));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (process.argv.includes('--require-ready') && result.status !== 'PRECONDITIONS_RECORDED') process.exitCode = 2;
  } catch {
    process.stderr.write('Rejected: sanitized metadata only. No keys, patient data or raw logs.\n');
    process.exitCode = 1;
  }
}

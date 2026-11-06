import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { reconcileCostAggregates } from '../scripts/nexa-openai-cost-reconcile.mjs';

const row = (date_utc, model, modality, capability, estimated_usd, billed_usd) =>
  ({ date_utc, model, modality, capability, estimated_usd, billed_usd });
const complete = () => ({
  schema_version: 1,
  currency: 'USD',
  coverage: { provider_billing_complete: true, webrtc_audio_billing_observed: true },
  rows: [
    row('2026-11-01', 'gpt-5.6-luna', 'text', 'realtime.radar', 0.12, 0.13),
    row('2026-11-01', 'gpt-realtime-2.1-mini', 'realtime_audio', 'realtime.transcription', 0.21, 0.20),
    row('2026-11-02', 'gpt-4o-transcribe', 'transcription', 'final.transcription', 0.02, 0.03),
  ],
});

test('compares synthetic daily model and modality aggregates without claiming savings', () => {
  const result = reconcileCostAggregates(complete());
  assert.equal(result.daily.length, 2);
  assert.equal(result.daily[0].partial_estimated_usd, 0.33);
  assert.equal(result.daily[0].partial_billed_usd, 0.33);
  assert.equal(result.daily[0].difference_usd, 0);
  assert.equal(result.daily[1].difference_usd, 0.01);
  assert.equal(result.arithmetic_comparison_complete, true);
  assert.equal(result.savings_measured_usd, null);
  assert.equal(result.production_cost_confirmed, false);
});

test('keeps WebRTC and missing provider billing visible as explicit gaps', () => {
  const input = complete();
  input.rows[1].billed_usd = null;
  input.coverage.provider_billing_complete = false;
  input.coverage.webrtc_audio_billing_observed = false;
  const result = reconcileCostAggregates(input);
  assert.equal(result.daily[0].difference_usd, null);
  assert.equal(result.arithmetic_comparison_complete, false);
  for (const gap of ['BILLING_ROWS_MISSING', 'PROVIDER_BILLING_COVERAGE_UNVERIFIED',
    'WEBRTC_AUDIO_BILLING_UNOBSERVED']) assert.ok(result.gaps.includes(gap));
});

test('rejects duplicate dimensions, invalid UTC dates and unsupported currencies', () => {
  const duplicate = complete();
  duplicate.rows.push({ ...duplicate.rows[0] });
  assert.throws(() => reconcileCostAggregates(duplicate), /DUPLICATE_AGGREGATE_ROW/);
  const invalidDate = complete();
  invalidDate.rows[0].date_utc = '2026-02-30';
  assert.throws(() => reconcileCostAggregates(invalidDate), /INVALID_AGGREGATE_DIMENSION/);
  const currency = complete();
  currency.currency = 'BRL';
  assert.throws(() => reconcileCostAggregates(currency), /INVALID_AGGREGATE_REPORT/);
});

test('rejects raw logs, identifiers and API keys without echoing input', () => {
  for (const extra of [
    { transcript: 'synthetic clinical text' },
    { patient_id: 'private-id' },
    { OPENAI_API_KEY: 'FAKE_SECRET_VALUE' },
  ]) {
    const input = { ...complete(), ...extra };
    assert.throws(() => reconcileCostAggregates(input), /AGGREGATES_ONLY/);
    const run = spawnSync(process.execPath, ['scripts/nexa-openai-cost-reconcile.mjs'], {
      input: JSON.stringify(input), encoding: 'utf8',
    });
    assert.equal(run.status, 1);
    assert.equal(run.stdout, '');
    assert.doesNotMatch(run.stderr, /synthetic clinical text|private-id|FAKE_SECRET_VALUE/);
  }
});

test('rejects malformed token-price amounts and more than six decimal places', () => {
  for (const amount of [-1, Infinity, 0.1234567, '0.02']) {
    const input = complete();
    input.rows[0].billed_usd = amount;
    assert.throws(() => reconcileCostAggregates(input), /INVALID_AGGREGATE_AMOUNT/);
  }
});

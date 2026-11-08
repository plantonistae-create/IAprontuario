// Offline comparison of approved daily aggregates. It does not calculate savings.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MODALITIES = new Set(['text', 'transcription', 'realtime_audio', 'other']);
const CAPABILITIES = new Set([
  'realtime.radar', 'realtime.transcription', 'final.transcription',
  'clinical.documentation', 'clinical.assistance', 'other',
]);
const MAX_ROWS = 500;
const MAX_USD = 100000;

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key)) ||
      keys.some(key => !Object.hasOwn(value, key))) throw new Error('AGGREGATES_ONLY');
}
function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
function microUsd(value) {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_USD ||
      Math.abs(value * 1e6 - Math.round(value * 1e6)) > 0.00001) throw new Error('INVALID_AGGREGATE_AMOUNT');
  return Math.round(value * 1e6);
}
const usd = value => value === null ? null : Math.round(value) / 1e6;

export function reconcileCostAggregates(input) {
  exact(input, ['schema_version', 'currency', 'coverage', 'rows']);
  if (input.schema_version !== 1 || input.currency !== 'USD' ||
      !Array.isArray(input.rows) || input.rows.length === 0 || input.rows.length > MAX_ROWS)
    throw new Error('INVALID_AGGREGATE_REPORT');
  exact(input.coverage, ['provider_billing_complete', 'webrtc_audio_billing_observed']);
  if (Object.values(input.coverage).some(v => typeof v !== 'boolean'))
    throw new Error('INVALID_COVERAGE');

  const seen = new Set();
  const days = new Map();
  let missingEstimate = 0, missingBill = 0;
  for (const row of input.rows) {
    exact(row, ['date_utc', 'model', 'modality', 'capability', 'estimated_usd', 'billed_usd']);
    if (!date(row.date_utc) || typeof row.model !== 'string' ||
        !/^[A-Za-z0-9._-]{1,80}$/.test(row.model) ||
        !MODALITIES.has(row.modality) || !CAPABILITIES.has(row.capability))
      throw new Error('INVALID_AGGREGATE_DIMENSION');
    const key = [row.date_utc, row.model, row.modality, row.capability].join('|');
    if (seen.has(key)) throw new Error('DUPLICATE_AGGREGATE_ROW');
    seen.add(key);
    const estimate = microUsd(row.estimated_usd), billed = microUsd(row.billed_usd);
    if (estimate === null) missingEstimate++;
    if (billed === null) missingBill++;
    const day = days.get(row.date_utc) ?? { date_utc: row.date_utc,
      estimated_micro_usd: 0, billed_micro_usd: 0, missing_estimate_rows: 0, missing_bill_rows: 0 };
    if (estimate !== null) day.estimated_micro_usd += estimate;
    else day.missing_estimate_rows++;
    if (billed !== null) day.billed_micro_usd += billed;
    else day.missing_bill_rows++;
    days.set(row.date_utc, day);
  }
  const daily = [...days.values()].sort((a, b) => a.date_utc.localeCompare(b.date_utc))
    .map(day => ({
      date_utc: day.date_utc,
      partial_estimated_usd: day.missing_estimate_rows === 0 ? usd(day.estimated_micro_usd) : null,
      partial_billed_usd: day.missing_bill_rows === 0 ? usd(day.billed_micro_usd) : null,
      missing_estimate_rows: day.missing_estimate_rows,
      missing_bill_rows: day.missing_bill_rows,
      difference_usd: day.missing_estimate_rows || day.missing_bill_rows ? null :
        usd(day.billed_micro_usd - day.estimated_micro_usd),
    }));
  const gaps = [
    ...(missingEstimate ? ['ESTIMATE_ROWS_MISSING'] : []),
    ...(missingBill ? ['BILLING_ROWS_MISSING'] : []),
    ...(!input.coverage.provider_billing_complete ? ['PROVIDER_BILLING_COVERAGE_UNVERIFIED'] : []),
    ...(!input.coverage.webrtc_audio_billing_observed ? ['WEBRTC_AUDIO_BILLING_UNOBSERVED'] : []),
  ];
  return {
    classification: 'OFFLINE_AGGREGATE_COMPARISON_NOT_PROVIDER_ATTESTATION',
    currency: 'USD',
    dimensions: ['UTC day', 'model', 'modality', 'capability'],
    daily,
    gaps,
    arithmetic_comparison_complete: gaps.length === 0,
    savings_measured_usd: null,
    production_cost_confirmed: false,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const raw = readFileSync(0, 'utf8');
    if (Buffer.byteLength(raw) > 131072) throw new Error('INPUT_TOO_LARGE');
    process.stdout.write(JSON.stringify(reconcileCostAggregates(JSON.parse(raw)), null, 2) + '\n');
  } catch {
    process.stderr.write('Rejected: approved aggregate-only input required. No clinical content or raw logs.\n');
    process.exitCode = 1;
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildManifest, buildTaskExports, planEncounterExport } from '../experimental/nexa-core-capture-eligibility.V523.mjs';

import { signSyntheticChain, syntheticAttestation } from './helpers/core-export-chain.mjs';

const ownerId = '11111111-1111-4111-8111-111111111111';
const encounterId = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-11-27T12:00:00Z');
const syntheticChain = (rows, scope = {}) => signSyntheticChain(rows, { ownerId, encounterId, ...scope });
const text = ['transcript_final', { text: 'Lote integralmente fictício.' }, '{"text": "Lote integralmente fictício."}'];
const provider = ['provenance', { provider: 'synthetic', model: 'model', model_version: 'v1', pipeline_version: 'p1' },
  '{"model": "model", "provider": "synthetic", "model_version": "v1", "pipeline_version": "p1"}'];
const rights = extra => ({ core_export: {
  authorized_by: 'Autor sintético', authorized_at: '2026-11-20T00:00:00Z', scope: ['asr'],
  purposes: ['evaluation', 'training'], expires_at: '2027-11-20T00:00:00Z',
  revoked_at: null, deidentification: { verified: true, verified_by: 'Revisor sintético' }, ...extra,
} });
const attestation = (chain, scope = {}) => syntheticAttestation(chain, { ownerId, encounterId, ...scope });
const review = row => ({ record_digest: row.record_digest, decision: 'approved_for_training', reviewer: 'Revisor Core sintético' });
const make = (chain = syntheticChain([text, provider]), options = {}) => planEncounterExport({
  ownerId, encounterId, chain, serverAttestation: attestation(chain), rights: rights(),
  salt: 'synthetic-salt-purpose-s6', now, ...options,
});
function refuses(plan, reason) {
  assert.equal(plan.eligible, false);
  assert.deepEqual(plan.records, []);
  assert.match(plan.reasons.join(','), reason);
  assert.deepEqual(buildTaskExports([plan], { datasetVersion: 'synthetic', now }), {});
}

test('S6 refuses inconsistent record payload, kind and canonical evidence', () => {
  const chain = syntheticChain([text, provider]);
  assert.equal(make(chain).eligible, true);
  const changed = structuredClone(chain);
  changed[0].payload.text = 'Outra frase inteiramente sintética.';
  refuses(make(changed), /CHAIN_PAYLOAD_MISMATCH/);
  changed[0].payload_canonical = JSON.stringify(changed[0].payload);
  refuses(make(changed), /CHAIN_PAYLOAD_DIGEST_MISMATCH/);
  refuses(make([{ ...chain[0], payload_canonical: undefined }, chain[1]]), /CHAIN_CANONICAL_PAYLOAD_REQUIRED/);
  refuses(make([{ ...chain[0], kind: 'transcript_corrected' }, chain[1]]), /CHAIN_RECORD_DIGEST_MISMATCH/);
});

test('S6 requires the attestation and record digests to bind the exact owner and encounter', () => {
  const chain = syntheticChain([text, provider]);
  refuses(make(chain, { serverAttestation: attestation(chain, { encounterId: other }) }), /CHAIN_ATTESTATION_SCOPE_MISMATCH/);
  const otherChain = syntheticChain([text, provider], { ownerId: other });
  refuses(make(otherChain), /CHAIN_RECORD_DIGEST_MISMATCH/);
});

test('S6 blocks internal identifiers in free text, nested keys and exported provenance', () => {
  for (const row of [
    ['transcript_final', { text: 'Atendimento ' + encounterId }],
    ['transcript_final', { fields: { ['source_' + other]: 'fictício' } }],
    ['transcript_final', { clinical: { patient_id: 'LAB-42' } }],
  ]) refuses(make(syntheticChain([row, provider])), /INTERNAL_IDENTIFIER_DETECTED/);
  const unsafeProv = ['provenance', { ...provider[1], model_version: other }];
  refuses(make(syntheticChain([text, unsafeProv])), /INTERNAL_IDENTIFIER_DETECTED/);
});

test('S6 train-only rights cannot fall back to evaluation and evaluation-only cannot promote', () => {
  const chain = syntheticChain([text, provider]);
  const trainOnly = rights({ purposes: ['training'] });
  refuses(make(chain, { rights: trainOnly }), /NO_RECORDS_AUTHORIZED_FOR_EXPORT/);
  const train = make(chain, { rights: trainOnly, coreReview: [review(chain[0])] });
  const evaluation = make(chain, { rights: rights({ purposes: ['evaluation'] }), coreReview: [review(chain[0])] });
  assert.deepEqual(Object.keys(buildTaskExports([train], { datasetVersion: 'synthetic', now })), ['asr.training_candidate']);
  assert.deepEqual(Object.keys(buildTaskExports([evaluation], { datasetVersion: 'synthetic', now })), ['asr.evaluation_only']);
});

test('S6 revoked rights emit nothing and conflicting or incomplete provenance cannot promote', () => {
  refuses(make(undefined, { rights: rights({ revoked_at: '2026-11-26T00:00:00Z' }) }), /RIGHTS_REVOKED/);
  for (const first of [{ ...provider[1], model_version: '' }, { ...provider[1], model_version: 'v2' }]) {
    const chain = syntheticChain([text, ['provenance', first], provider]);
    const plan = make(chain, { coreReview: [review(chain[0])] });
    assert.equal(plan.records[0].training_ready, false);
    assert.equal(plan.records[0].provenance, null);
  }
  const app = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(app, /nexaCapture\('provenance',\{[^\n]*model_version:payload\.model_version\|\|'unreported'/);
});

test('S6 a capture changed after planning cannot change the exported bytes', () => {
  const chain = syntheticChain([['transcript_final', { text: 'Original sintético' }], provider]);
  const plan = make(chain);
  chain[0].payload.text = 'Alteração sintética';
  const { jsonl } = buildManifest([plan], { datasetVersion: 'synthetic', now });
  assert.match(jsonl, /Original sintético/);
  assert.doesNotMatch(jsonl, /Alteração sintética/);
});

import test from 'node:test'; import assert from 'node:assert/strict';
import { planEncounterExport, buildManifest, buildTaskExports, validateRights, piiFindings } from '../experimental/nexa-core-capture-eligibility.V523.mjs';
const SALT = 'synthetic-salt-0123456789', OWNER = '11111111-1111-4111-8111-111111111111', ENC = '33333333-3333-4333-8333-333333333333', NOW = new Date('2026-11-26T12:00:00Z');
const rights = (o = {}) => ({ core_export: { authorized_by: 'Comitê Core (sintético)', authorized_at: '2026-11-20T00:00:00Z', scope: ['asr', 'documentation', 'radar'], purposes: ['evaluation', 'training'], deidentification: { verified: true, verified_by: 'Revisor Humano (sintético)' }, expires_at: '2027-11-20T00:00:00Z', revoked_at: null, ...o } });
const mkChain = (over = {}) => { const kinds = [['transcript_final', { text: 'cefaleia desde hoje', source: 'server_transcription', training_label: false }], ['clinical_fields', { fields: { hda: 'Cefaleia' }, fields_digest: 'a'.repeat(64) }], ['provenance', { provider: 'openai', model: 'gpt-x', model_version: '2026-01', pipeline_version: 'p1' }], ['radar', { ledger: {} }], ['physician_edit', { before_digest: 'a'.repeat(64), after_digest: 'b'.repeat(64), fields: { hda: 'Cefaleia intensa' }, fields_digest: 'b'.repeat(64) }]];
  const c = kinds.map(([kind, payload], i) => ({ seq: i + 1, kind, payload, parent_digest: i ? 'r' + i : '0'.repeat(64), record_digest: 'r' + (i + 1) })); return over.mut ? over.mut(c) : c; };
const att = (c) => ({ valid: true, records: c.length, head: c[c.length - 1].record_digest });
const plan = (o = {}) => { const chain = o.chain || mkChain(); return planEncounterExport({ ownerId: OWNER, encounterId: ENC, chain, serverAttestation: o.att === undefined ? att(chain) : o.att, rights: o.rights === undefined ? rights() : o.rights, coreReview: o.coreReview, salt: SALT, now: NOW }); };
test('eligible only with valid rights, attested chain, no PII; identity is pseudonymized', () => {
  const p = plan(); assert.equal(p.eligible, true); assert.equal(p.records.length, 5 - 1 + 0 + 0 - 0, 'provenance is not a data stream'); 
  const s = JSON.stringify(p.records); assert.ok(!s.includes(OWNER) && !s.includes(ENC), 'real ids never leave'); assert.equal(new Set(p.records.map(r => r.encounter)).size, 1);
  assert.throws(() => planEncounterExport({ ownerId: OWNER, encounterId: ENC, chain: mkChain(), serverAttestation: att(mkChain()), rights: rights(), salt: 'short', now: NOW }), /PSEUDONYM_SALT_REQUIRED/);
});
test('NOTHING from a provider is a training label; promotion needs an explicit named human Core review of that exact digest', () => {
  const p = plan(); for (const r of p.records) { assert.equal(r.training_label, false); assert.equal(r.training_ready, false, r.kind + ' is not training-ready by default'); }
  assert.ok(p.records.filter(r => r.kind === 'transcript_final' || r.kind === 'clinical_fields' || r.kind === 'radar').every(r => r.machine_generated === true && r.label_status === 'machine_generated'));
  const edit = p.records.find(r => r.kind === 'physician_edit'); assert.equal(edit.label_status, 'physician_corrected'); assert.equal(edit.training_ready, false, 'a physician correction alone is not a Core review');
  const reviewed = plan({ coreReview: [{ record_digest: 'r2', reviewer: 'Revisor Core (sintético)', decision: 'approved_for_training' }, { record_digest: 'r1', reviewer: 'x', decision: 'approved_for_training' }, { record_digest: 'r3', reviewer: 'Revisor Core', decision: 'rejected' }] });
  assert.deepEqual(reviewed.records.filter(r => r.training_ready).map(r => r.record_digest), ['r2'], 'only the exact reviewed digest with a named reviewer and an approving decision');
  assert.ok(reviewed.records.every(r => r.training_label === false), 'the planner never creates labels');
  const noProv = plan({ chain: mkChain({ mut: c => c.map(r => r.kind === 'provenance' ? { ...r, payload: { ...r.payload, model_version: 'unreported' } } : r) }), coreReview: [{ record_digest: 'r2', reviewer: 'Revisor Core', decision: 'approved_for_training' }] });
  assert.equal(noProv.summary.provenance_complete, false); assert.equal(noProv.records.filter(r => r.training_ready).length, 0, 'incomplete provenance blocks training readiness even after review');
});
test('refusals export nothing: rights, scope, expiry, revocation, de-identification, chain attestation, gaps, unknown kinds, PII', () => {
  const none = (o, re) => { const p = plan(o); assert.equal(p.eligible, false); assert.equal(p.records.length, 0); assert.match(p.reasons.join(','), re); };
  none({ rights: null }, /RIGHTS_MISSING/); none({ rights: rights({ authorized_by: '' }) }, /RIGHTS_NO_NAMED_AUTHORIZER/); none({ rights: rights({ scope: ['audio'] }) }, /RIGHTS_SCOPE_INVALID/);
  none({ rights: rights({ expires_at: '2026-11-01T00:00:00Z' }) }, /RIGHTS_EXPIRED/); none({ rights: rights({ revoked_at: '2026-11-25T00:00:00Z' }) }, /RIGHTS_REVOKED/);
  none({ rights: rights({ deidentification: { verified: true, verified_by: '' } }) }, /DEIDENTIFICATION_NOT_VERIFIED/); none({ rights: rights({ deidentification: { verified: false } }) }, /DEIDENTIFICATION_NOT_VERIFIED/);
  none({ att: null }, /CHAIN_NOT_SERVER_ATTESTED/); none({ att: { valid: true, records: 5, head: 'forged' } }, /CHAIN_NOT_SERVER_ATTESTED/);
  none({ chain: mkChain({ mut: c => c.filter(r => r.seq !== 3) }), att: { valid: true, records: 4, head: 'r5' } }, /CHAIN_SEQUENCE_GAP/);
  none({ chain: mkChain({ mut: c => c.map(r => r.seq === 2 ? { ...r, kind: 'training_label' } : r) }) }, /CHAIN_UNKNOWN_KIND/);
  none({ chain: mkChain({ mut: c => c.map(r => r.kind === 'transcript_final' ? { ...r, payload: { text: 'CPF 123.456.789-09 e fulano@mail.com' } } : r) }) }, /PII_DETECTED:CPF/);
  assert.deepEqual(piiFindings({ a: 'tel (11) 98888-7777' }), ['PHONE']);
  assert.ok(validateRights(rights(), new Date('2028-01-01')).includes('RIGHTS_EXPIRED_OR_UNDATED'));
});
test('scope limits streams; manifest is hash-bound and states the policy', () => {
  const p = plan({ rights: rights({ scope: ['documentation'] }) }); assert.deepEqual([...new Set(p.records.map(r => r.stream))], ['documentation']);
  const refused = plan({ rights: null }); const { jsonl, manifest } = buildManifest([p, refused], { datasetVersion: 'synthetic-v1', now: NOW });
  assert.equal(manifest.encounters_exported, 1); assert.equal(manifest.encounters_refused, 1); assert.equal(manifest.training_ready_records, 0); assert.equal(manifest.machine_generated_never_auto_labeled, true); assert.equal(manifest.audio_bytes_included, false);
  assert.equal(manifest.sha256.length, 64); assert.equal(jsonl.trim().split('\n').length, manifest.records);
});

test('V5.31: evaluation and training are separate rights; per-task exports are independent, hash-bound and never mixed', () => {
  const ch = mkChain(), reviews = ch.filter((r) => r.kind === 'transcript_final').map((r) => ({ record_digest: r.record_digest, decision: 'approved_for_training', reviewer: 'Revisor Core (sintético)' }));
  const evalOnly = plan({ coreReview: reviews, rights: rights({ purposes: undefined }) }); assert.equal(evalOnly.summary.training_ready, 0, 'no purposes => evaluation only, even with a Core review'); assert.ok(evalOnly.records.every((r) => r.purpose === 'evaluation_only'));
  const train = plan({ coreReview: reviews, rights: rights({ purposes: ['evaluation', 'training'] }) }); assert.ok(train.summary.training_ready >= 1);
  const ex = buildTaskExports([train], { datasetVersion: 'v-test', now: NOW }); const keys = Object.keys(ex);
  assert.ok(keys.includes('asr.training_candidate') && !keys.includes('asr.evaluation_only') && keys.includes('documentation.evaluation_only') && keys.includes('radar.evaluation_only'));
  for (const k of keys) { const [task, purpose] = k.split('.'); const rows = ex[k].jsonl.trim().split('\n').map(JSON.parse); assert.ok(rows.every((r) => r.stream === task && r.purpose === purpose), 'no mixing in ' + k); assert.equal(ex[k].manifest.records, rows.length); assert.equal(ex[k].manifest.audio_bytes_included, false); }
  assert.ok(!ex['documentation.training_candidate'] && !ex['radar.training_candidate'], 'provider output without Core review is never a training candidate');
  for (const k of keys) { const m = ex[k].manifest; assert.ok(m.provenance_set.length >= 1 && m.provenance_set.every((q) => q && q.provider === 'openai' && q.model_version === '2026-01'), 'provenance in manifest ' + k); assert.ok(m.rights_basis.length === 1 && m.rights_basis[0].purposes.includes(k.endsWith('training_candidate') ? 'training' : 'evaluation'), 'rights basis in manifest ' + k); }
  assert.ok(validateRights(rights({ purposes: ['resale'] }), NOW).includes('RIGHTS_PURPOSE_INVALID'));
  const asrOnly = buildTaskExports([plan({ rights: rights({ scope: ['asr'] }) })], { datasetVersion: 'v', now: NOW }); assert.ok(Object.keys(asrOnly).every((k) => k.startsWith('asr.')), 'task not in the rights scope is not exported');
});

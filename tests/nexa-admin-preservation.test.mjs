import test from 'node:test'; import assert from 'node:assert/strict';
globalThis.window = globalThis; await import('../nexa-admin-preservation-v525.js'); const P = window.nexaAdminPreservationV525;
test('cost estimates need typed tariffs; none are assumed; KMS calls follow the measured per-envelope counts', () => {
  const a = { stored_bytes: 2 * 1073741824, envelope_v1_chunks: 1000, envelope_v2_chunks: 100000, session_keys_v2: 50 };
  assert.deepEqual(P.costs(a, null), { storage: null, kms: null, note: 'Informe as tarifas para estimar custos (nenhuma tarifa é assumida).' });
  const c = P.costs(a, { storagePerGbMonth: 0.021, kmsPer10k: 0.03 }); assert.equal(c.storage, 0.042); assert.equal(c.kmsCalls, Math.round(1000 * 3 + 100000 * 0.05 + 50)); assert.equal(c.kms, +(c.kmsCalls / 1e4 * 0.03).toFixed(4));
  assert.equal(P.costs(a, { storagePerGbMonth: -1, kmsPer10k: NaN }).storage, null, 'invalid tariffs are ignored');
});
test('rows: bytes formatting, pending/stale, candidates, and hostile numbers cannot break the table', () => {
  const r = Object.fromEntries(P.rows({ audio: { stored_bytes: 1536, audio_bytes: 3 * 1048576, chunks_total: 7, sessions_protected: 2, pending_backups: 3, pending_backups_stale: 1, envelope_v1_chunks: 1, envelope_v2_chunks: 6, session_keys_v2: 1 }, capture: { encounters_with_capture: 2, records_total: 9, records_by_kind: { radar: 5, transcript_final: 2 }, candidates_asr: 2, candidates_radar: 2, candidates_documentation: 1 } }, null));
  assert.equal(r['Volume armazenado (envelopes cifrados)'], '1.50 KB'); assert.equal(r['Áudio protegido (bytes originais)'], '3.00 MB'); assert.equal(r['Backups pendentes (iniciados, não finalizados)'], '3'); assert.equal(r['Candidatos a exportação — ASR / Radar / documentação'], '2 / 2 / 1'); assert.match(r['Registros de captura'], /radar: 5/);
  const bad = P.rows({ audio: { stored_bytes: 'x', chunks_total: null }, capture: { records_by_kind: null } }, null); assert.ok(bad.every(([k, v]) => typeof k === 'string' && typeof v === 'string'));
});

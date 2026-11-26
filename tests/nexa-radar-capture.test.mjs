// V5.24 — pure diff logic of the Radar suggestion capture (the real page is covered by tests/nexa-radar-capture.e2e.cjs).
import test from 'node:test'; import assert from 'node:assert/strict';
globalThis.window = Object.assign(globalThis, { addEventListener() {}, localStorage: null }); await import('../nexa-radar-capture-v524.js'); const { diff } = window.nexaRadarCaptureV524;
const ctx = { at: '2026-11-26T12:00:00Z', viewMode: 'ps', evidenceLibraryVersion: 'lib-3' };
const mem = () => ({ entries: new Map(), alerts: new Map(), sugg: new Map() });
const Q = (o = {}) => ({ id: 'focal', concept: 'focal', category: 'red_flags', priority: 'critical', question: 'Houve fraqueza?', reason: 'porque', status: 'to_ask', source: 'rule', redFlag: true, evidence: [], ...o });
const apply = (events, seen) => { for (const e of events) { seen.add(e.key); e.commit(); } return events.map(e => e.payload); };
test('every published suggestion is captured once with origin, versions and view mode; unchanged state records nothing', () => {
  const m = mem(), seen = new Set(), state = { version: 1, radarMeta: { engine: 'e1' }, items: [Q(), Q({ id: 'meningism', concept: 'meningism', source: 'ai', redFlag: false })], alerts: [{ id: 'finding:sudden', concept: 'sudden', kind: 'documented_finding', priority: 'critical', question: 'Reavaliar', evidence: [{ quote: 'COMEÇOU DE REPENTE', section: 'hda', state: 'known_present' }] }], confirm: [], ledger: {}, alertJournal: [] };
  const p = apply(diff(state, seen, m, ctx), seen); assert.equal(p.length, 3);
  assert.deepEqual(p.map(x => [x.list, x.suggestion_id, x.source, x.event]), [['items', 'focal', 'rule', 'suggestion_displayed'], ['items', 'meningism', 'ai', 'suggestion_displayed'], ['alerts', 'finding:sudden', 'documented_finding', 'suggestion_displayed']]);
  assert.ok(p.every(x => x.evidence_library_version === 'lib-3' && x.view_mode === 'ps' && x.radar_state_version === 1 && x.radar_meta.engine === 'e1' && x.displayed_at === ctx.at));
  assert.equal(p[2].evidence[0].quote, 'COMEÇOU DE REPENTE'); assert.equal(diff(state, seen, m, ctx).length, 0, 'idempotent');
  const changed = apply(diff({ ...state, items: [Q({ reason: 'novo motivo' })] }, seen, m, ctx), seen); assert.equal(changed.length, 1); assert.equal(changed[0].event, 'suggestion_changed', 'a changed suggestion is a new record, never an overwrite');
});
test('physician response, correction (replacement), undo and alert review are separate records that keep the previous value', () => {
  const m = mem(), seen = new Set(), base = { items: [Q()], alerts: [], confirm: [], alertJournal: [{ id: 'finding:sudden', status: 'active', reason: '', firstSeen: 'x' }] };
  apply(diff({ ...base, ledger: {} }, seen, m, ctx), seen);
  const r1 = apply(diff({ ...base, ledger: { focal: { action: 'answer', value: 'Sem déficit focal', section: 'exame_fisico', at: 't1' } } }, seen, m, ctx), seen)[0];
  assert.deepEqual([r1.event, r1.suggestion_id, r1.value, r1.previous, r1.is_correction], ['physician_response', 'focal', 'Sem déficit focal', null, false]);
  const r2 = apply(diff({ ...base, ledger: { focal: { action: 'answer', value: 'Fraqueza em MSD', section: 'exame_fisico', at: 't2' } } }, seen, m, ctx), seen)[0];
  assert.equal(r2.is_correction, true); assert.equal(r2.previous.value, 'Sem déficit focal', 'the earlier answer survives inside the correction record');
  const r3 = apply(diff({ ...base, ledger: {} }, seen, m, ctx), seen)[0]; assert.equal(r3.event, 'physician_response_undone'); assert.equal(r3.previous.value, 'Fraqueza em MSD');
  const al = apply(diff({ ...base, ledger: {}, alertJournal: [{ id: 'finding:sudden', status: 'reviewed', reason: 'avaliado, sem sinais', firstSeen: 'x' }] }, seen, m, ctx), seen); assert.deepEqual([al[0].event, al[0].status, al[0].previous_status, al[0].reason], ['alert_status', 'reviewed', 'active', 'avaliado, sem sinais']);
  assert.equal(diff({ ...base, ledger: {}, alertJournal: [{ id: 'finding:sudden', status: 'reviewed', reason: 'avaliado, sem sinais', firstSeen: 'x' }] }, seen, m, ctx).length, 0);
});
test('events already recorded (seen set, e.g. after a reload) are not duplicated; invalid input is ignored', () => {
  const state = { items: [Q()], alerts: [], confirm: [], ledger: { focal: { action: 'answer', value: 'x', at: 't' } }, alertJournal: [] };
  const seen = new Set(); const first = diff(state, seen, mem(), ctx); first.forEach(e => seen.add(e.key)); assert.equal(first.length, 2);
  assert.equal(diff(state, seen, mem(), ctx).length, 0, 'fresh in-memory state + persisted seen keys = no duplicates');
  assert.deepEqual(diff(null, new Set(), mem(), ctx), []); assert.deepEqual(diff({ items: [{ nope: 1 }, null] }, new Set(), mem(), ctx), []);
  const big = diff({ items: [Q({ question: 'x'.repeat(5000), reason: 'y'.repeat(5000) })] }, new Set(), mem(), ctx)[0].payload; assert.ok(big.question.length <= 400 && big.reason.length <= 400, 'payloads are bounded');
});

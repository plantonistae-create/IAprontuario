// V5.34 — operational package integrity (no database, no network, no hosted effect): manifest hashes, executable-SQL pins, rollback independence/non-destructiveness, verifier read-only shape.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, existsSync } from 'node:fs'; import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url); const rd = p => readFileSync(new URL(p, root), 'utf8'); const sha = s => createHash('sha256').update(s).digest('hex');
const M = JSON.parse(rd('supabase/ops/V533/MANIFEST.V533.json')); const code = t => t.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const codeSha = t => sha(t.split(/(?<=\n)/).filter(l => !l.trimStart().startsWith('--')).join(''));
// executable SQL of the adjudicated candidates, pinned (comment-only edits are allowed; any code change must fail here)
const PIN = { M1: 'c3ad39cb9d8e', M2: 'c64b30275bd3', M3: '4bf8ef095b30', M4: 'ee433d990fcd' };
test('manifest: every listed file exists and matches its full sha256', () => { assert.equal(M.applied, false); for (const [k, f] of Object.entries(M.files)) { assert.ok(existsSync(new URL(f.path, root)), k); assert.equal(sha(readFileSync(new URL(f.path, root))), f.sha256, k); } assert.ok(Object.keys(M.files).length >= 18); });
test('candidates: executable SQL is pinned (only comments may differ from the adjudicated files)', () => { for (const k of ['M1', 'M2', 'M3', 'M4']) { const c = codeSha(rd(M.files[k].path)); assert.equal(c, M.files[k].code_sha256); assert.ok(c.startsWith(PIN[k]), k + ' executable SQL changed'); } });
const OWN = { M1: /nexa_assist/, M2: /nexa_capture/, M3: /nexa_audio/, M4: /nexa_admin_preservation_summary/ };
test('rollback/reenable: one file per step, own objects only, tolerant of absent objects, no destructive verb', () => {
  for (const k of ['M1', 'M2', 'M3', 'M4']) for (const f of [M.files['rollback.' + k].path, M.files['reenable.' + k].path]) {
    const c = code(rd(f)); assert.ok(!/\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE)\b/i.test(c), f); assert.ok(OWN[k].test(c), f); assert.match(c, /to_regprocedure/); assert.match(c, /IF f IS NOT NULL/);
    for (const o of Object.keys(OWN).filter(x => x !== k)) assert.ok(!OWN[o].test(c), f + ' references ' + o); assert.match(c, /^\s*BEGIN;[\s\S]*COMMIT;\s*$/m); }
});
test('no document or SQL comment advertises a destructive rollback; the combined rollback is gone', () => {
  assert.ok(!existsSync(new URL('supabase/proposals/V525/rollback.NON-DESTRUCTIVE.sql', root))); assert.ok(!existsSync(new URL('supabase/proposals/V525/reenable.sql', root)));
  for (const k of ['M1', 'M2', 'M3', 'M4']) { const t = rd(M.files[k].path); assert.ok(!/DROP SCHEMA|DROP TABLE|CASCADE\.\s*$/m.test(t.split('\n').filter(l => /rollback/i.test(l)).join('\n')), k); assert.ok(!/V525\/rollback/.test(t)); }
  const rb = rd('supabase/ops/V533/RUNBOOK.V533.md'); assert.ok(!/DROP SCHEMA\b(?![^\n]*never|[^\n]*Nunca|[^\n]*not)/i.test(rb.replace(/Nunca[^\n]*/gi, ''))); assert.ok(!rb.includes('V525/rollback'));
});
test('verifier: one read-only statement with the strengthened checks', () => {
  const q = rd(M.files.verify.path); const noLit = code(q).replace(/'(?:[^']|'')*'/g, "''"); assert.equal((noLit.match(/;/g) || []).length, 1); assert.match(noLit.trim(), /^WITH /);
  for (const w of ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'GRANT', 'REVOKE', 'TRUNCATE', 'COPY', 'CALL', 'SET']) assert.ok(!new RegExp('\\b' + w + '\\b').test(noLit), w);
  for (const id of ['P07 definition', 'P08 effective EXECUTE ACL', 'P09 owners', 'P10 trigger', 'P11 inventory', 'P12 effective table ACL', 'P13 effective schema ACL']) assert.ok(q.includes(id), id);
  assert.equal((q.match(/\('(?:private|public)\.[a-z_]+','[0-9a-f]{32}'\)/g) || []).length, 14);
});

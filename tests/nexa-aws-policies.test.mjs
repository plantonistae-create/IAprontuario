// V5.34 — local model of AWS KMS authorization over the shipped policy templates (key policy + identity policy + permissions boundary).
// Semantics modelled (documented AWS behaviour): explicit Deny in ANY policy wins; access needs an Allow from the key policy for the principal directly OR (key policy delegates to the account root AND the identity policy allows);
// a permissions boundary must also allow. This is a model, not AWS itself: the real check is the K1 checkpoint (IAM policy simulator + synthetic wrap/unwrap) in RUNBOOK.V533.md.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
const A = '111122223333', KEY = `arn:aws:kms:sa-east-1:${A}:key/1234abcd-12ab-34cd-56ef-1234567890ab`, USER = `arn:aws:iam::${A}:user/nexa-edge-kms`, ROOT = `arn:aws:iam::${A}:root`;
const load = f => JSON.parse(readFileSync(new URL('../supabase/ops/V533/aws/' + f, import.meta.url), 'utf8').replaceAll('<ACCOUNT_ID>', A).replaceAll('<KEY_ID>', '1234abcd-12ab-34cd-56ef-1234567890ab'));
const keyPol = load('kms-key-policy.json'), idp = load('iam-policy.nexa-edge-kms.json'), boundary = load('iam-permissions-boundary.nexa-edge-kms.json');
const arr = x => x === undefined ? [] : Array.isArray(x) ? x : [x];
const glob = (pat, v) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(v);
const ctxv = (req, k) => k === 'kms:EncryptionContextKeys' ? Object.keys(req.ctx) : k.startsWith('kms:EncryptionContext:') ? (Object.hasOwn(req.ctx, k.split(':')[2]) ? [req.ctx[k.split(':')[2]]] : null) : k === 'aws:RequestedRegion' ? [req.region] : k === 'aws:SecureTransport' ? [String(req.tls)] : k === 'aws:PrincipalArn' ? [req.principal] : null;
function condOk(c, req) {
  for (const [op, kv] of Object.entries(c || {})) for (const [k, want] of Object.entries(kv)) {
    const have = ctxv(req, k); const w = arr(want).map(String); let r;
    if (op === 'Null') r = (have === null) === (w[0] === 'true');
    else { const base = op.replace(/^For(AllValues|AnyValue):/, ''); const set = op.startsWith('ForAllValues:') ? 'all' : op.startsWith('ForAnyValue:') ? 'any' : 'single';
      const one = v => base === 'StringEquals' || base === 'Bool' ? w.includes(String(v)) : base === 'StringNotEquals' ? !w.includes(String(v)) : base === 'StringLike' ? w.some(p => glob(p, String(v))) : (() => { throw new Error('op ' + op); })();
      const vals = have ?? []; r = set === 'all' ? vals.every(one) : set === 'any' ? vals.some(one) : have === null ? base === 'StringNotEquals' : vals.length > 0 && (base === 'StringNotEquals' ? vals.every(one) : vals.some(one)); }
    if (!r) return false; } return true; }
const stmtMatches = (s, req, withPrincipal) => {
  if (withPrincipal) { const ps = arr(s.Principal?.AWS ?? s.Principal); if (!ps.some(p => p === '*' || p === req.principal)) return false; }
  const acts = s.NotAction ? !arr(s.NotAction).some(a => glob(a, req.action)) : arr(s.Action).some(a => glob(a, req.action)); if (!acts) return false;
  const res = s.NotResource ? !arr(s.NotResource).some(r => glob(r, req.resource)) : arr(s.Resource).some(r => r === '*' || glob(r, req.resource)); if (!res) return false;
  return condOk(s.Condition, req); };
const evalPol = (p, req, wp) => { const m = p.Statement.filter(s => stmtMatches(s, req, wp)); return { deny: m.some(s => s.Effect === 'Deny'), allow: m.some(s => s.Effect === 'Allow'), rootAllow: m.some(s => s.Effect === 'Allow' && arr(s.Principal?.AWS).includes(ROOT)) }; };
// identityPolicies: policies attached to the requesting principal (the nexa user carries idp + boundary; an "admin" carries AdministratorAccess)
function authorize(req, { identity = [idp], bound = boundary } = {}) {
  const k = evalPol(keyPol, req, true); const ids = identity.map(p => evalPol(p, req, false)); const b = bound ? evalPol(bound, req, false) : { allow: true, deny: false };
  if (k.deny || ids.some(i => i.deny) || b.deny) return false;
  const direct = keyPol.Statement.some(s => s.Effect === 'Allow' && stmtMatches(s, req, true) && arr(s.Principal?.AWS).includes(req.principal));
  const viaIam = k.rootAllow && ids.some(i => i.allow) && b.allow;
  return direct || viaIam; }
const good = { principal: USER, action: 'kms:Encrypt', resource: KEY, region: 'sa-east-1', tls: true, ctx: { nexa_aad_sha256: 'ab'.repeat(32) } };
const ADMIN = { Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }] };
test('the intended request is allowed (Encrypt and Decrypt)', () => { assert.equal(authorize(good), true); assert.equal(authorize({ ...good, action: 'kms:Decrypt' }), true); });
test('every condition is enforced on EVERY path (key policy direct allow AND identity allow)', () => {
  for (const [name, mut] of Object.entries({ wrongRegion: { region: 'us-east-1' }, noTls: { tls: false }, noContext: { ctx: {} }, otherContextKey: { ctx: { purpose: 'x' } }, extraContextKey: { ctx: { nexa_aad_sha256: 'a', extra: 'b' } }, otherKeyArn: { resource: KEY.replace('1234abcd', 'ffffffff') } }))
    for (const action of ['kms:Encrypt', 'kms:Decrypt']) assert.equal(authorize({ ...good, action, ...mut }), false, name + ' ' + action);
});
test('no alternative permission for the Edge user (other actions, grants, admin, key deletion, other cryptographic operations)', () => {
  for (const action of ['kms:GenerateDataKey', 'kms:GenerateDataKeyWithoutPlaintext', 'kms:ReEncryptFrom', 'kms:ReEncryptTo', 'kms:Sign', 'kms:GenerateMac', 'kms:CreateGrant', 'kms:PutKeyPolicy', 'kms:ScheduleKeyDeletion', 'kms:DisableKey', 'kms:DescribeKey', 'kms:CreateKey']) assert.equal(authorize({ ...good, action }), false, action);
  // even if someone later attaches AdministratorAccess to the Edge user, the key-policy and explicit-deny layers still hold
  for (const action of ['kms:GenerateDataKey', 'kms:CreateGrant', 'kms:Encrypt']) assert.equal(authorize({ ...good, action, region: 'us-east-1' }, { identity: [idp, ADMIN], bound: null }), false, 'admin attached ' + action);
  assert.equal(authorize({ ...good, action: 'kms:GenerateDataKey' }, { identity: [ADMIN], bound: null }), false);
});
test('nobody else can use the key cryptographically, not even the account root or an administrator', () => {
  for (const principal of [ROOT, `arn:aws:iam::${A}:user/admin`, `arn:aws:iam::${A}:role/AdminRole`, `arn:aws:iam::999988887777:user/stranger`]) for (const action of ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey', 'kms:ReEncryptFrom', 'kms:CreateGrant']) assert.equal(authorize({ ...good, principal, action }, { identity: [ADMIN], bound: null }), false, principal + ' ' + action);
});
test('administration stays possible (no lock-out): root/administrators can manage the policy and rotation', () => {
  for (const action of ['kms:PutKeyPolicy', 'kms:EnableKeyRotation', 'kms:DescribeKey', 'kms:GetKeyPolicy', 'kms:ScheduleKeyDeletion']) assert.equal(authorize({ ...good, principal: ROOT, action }, { identity: [], bound: null }), true, action);
});
test('policy hygiene: no wildcard principal Allow, no wildcard action Allow for the Edge user, fixed region, explicit key ARN', () => {
  for (const s of keyPol.Statement.filter(x => x.Effect === 'Allow')) assert.ok(!arr(s.Principal.AWS).includes('*'));
  assert.deepEqual(idp.Statement[0].Action, ['kms:Encrypt', 'kms:Decrypt']); assert.ok(idp.Statement[0].Resource.startsWith('arn:aws:kms:sa-east-1:')); assert.ok(!JSON.stringify(boundary).includes('"*"'));
});

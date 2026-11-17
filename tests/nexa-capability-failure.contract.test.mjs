// Contract: a failed get_my_capabilities lookup (network/RPC error) is not an account state.
// It must never sign the physician out, stop a recording or show "aguardando ativação".
// Behaviour is proven end-to-end in tests/nexa-capability-failure.e2e.cjs (fake mic, stubbed client, offline).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const getProfile = html.slice(html.indexOf('async function getProfile(u)'), html.indexOf('async function enter(session)'));
const enter = html.slice(html.indexOf('async function enter(session){'), html.indexOf('async function submitAuth()'));

test('getProfile flags a thrown/RPC error as capability_error instead of a real pending account', () => {
  assert.match(getProfile, /catch\(e\)\{console\.warn\('Capacidades NEXA Core indisponíveis:',e\);return\{[^}]*access_status:'pending'[^}]*capability_error:true\}/);
  // A successful RPC without a profile row is still treated as pending (no capability_error there).
  assert.match(getProfile, /return\{id:u\.id,name:fallback,email:u\.email\|\|'',access_status:'pending',is_admin:false,is_reviewer:false,clinical_access:false\}\}catch/);
});

test('enter() handles capability_error BEFORE adopting the profile and never signs out on it', () => {
  const i = enter.indexOf('if(incomingProf.capability_error){');
  assert.ok(i > 0, 'capability_error branch missing');
  assert.ok(i < enter.indexOf('currentProf=incomingProf;'), 'branch must run before currentProf is replaced');
  const branch = enter.slice(i, enter.indexOf('nexaCapabilityRetries=0;currentProf=incomingProf;'));
  assert.doesNotMatch(branch, /signOut|clearClinicalSession|stopRec/);
  assert.match(branch, /if\(currentProf\?\.id===session\.user\.id\)\{[^}]*return\}/, 'same-account active session must be kept as is');
  assert.match(branch, /Não foi possível confirmar seu acesso agora \(falha de conexão\)\. Nada foi apagado/);
  assert.doesNotMatch(branch, /aguardando ativa/i);
});

test('retry is bounded and only re-enters the same signed-in account', () => {
  assert.match(html, /function nexaScheduleCapabilityRetry\(session\)\{clearTimeout\(nexaCapabilityRetryTimer\);if\(nexaCapabilityRetries>=3\)return;/);
  assert.match(html, /if\(!currentProf&&data\?\.session\?\.user\?\.id===session\.user\.id\)enter\(data\.session\)/);
});

test('genuine disabled/pending answers still sign out (access control unchanged)', () => {
  assert.match(enter, /if\(currentProf\.access_status==='disabled'\)\{await sb\.auth\.signOut\(\)/);
  assert.match(enter, /if\(currentProf\.access_status==='pending'\)\{await sb\.auth\.signOut\(\)/);
});

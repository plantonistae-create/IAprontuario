// Contract: a failed get_my_capabilities lookup is not an account state. It is classified
// (transient / denied / inconclusive), never signs the physician out, never stops a recording or wipes the
// draft / retained audio, and blocks NEW authorization-dependent clinical actions until the server confirms.
// Behaviour is proven end-to-end in tests/nexa-capability-failure.e2e.cjs (fake mic, stubbed client, offline).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const getProfile = html.slice(html.indexOf('async function getProfile(u)'), html.indexOf('let nexaCapabilityRetries=0'));
const helpers = html.slice(html.indexOf('let nexaCapabilityRetries=0'), html.indexOf('async function enter(session){'));
const enter = html.slice(html.indexOf('async function enter(session){'), html.indexOf('async function submitAuth()'));
const fnBody = name => { const i = html.indexOf(name); return html.slice(i, html.indexOf('\n', html.indexOf('\n', i) + 1)); };

test('getProfile keeps HTTP status + PostgREST code and flags errors as capability_error with a kind', () => {
  assert.match(getProfile, /const \{data,error,status\}=await sb\.rpc\('get_my_capabilities'\);if\(error\)throw Object\.assign\(new Error\(String\(error\.message\|\|'RPC_ERROR'\)\),\{status:Number\(status\?\?error\.status\?\?0\)\|\|0,code:String\(error\.code\|\|''\)\}\);/);
  assert.match(getProfile, /capability_error:true,capability_error_kind:nexaClassifyCapabilityError\(e\)\}/);
  // A successful RPC without a profile row is still a real pending account (no capability_error there).
  assert.match(getProfile, /return\{id:u\.id,name:fallback,email:u\.email\|\|'',access_status:'pending',is_admin:false,is_reviewer:false,clinical_access:false\}\}catch/);
});

test('classifier: explicit denials vs transient vs inconclusive (fail closed on unknown shapes)', () => {
  assert.match(helpers, /if\(st===401\|\|st===403\|\|\['42501','PGRST301','PGRST302','28000','28P01'\]\.includes\(code\)/);
  assert.match(helpers, /\[408,425,429,500,502,503,504\]\.includes\(st\)\|\|\(st===0&&\/fetch\|network\|timeout/);
  assert.match(helpers, /return'inconclusive'\}/);
});

test('enter(): capability_error is handled before adopting the profile; no sign-out / wipe / stop on it', () => {
  const i = enter.indexOf('if(incomingProf.capability_error){');
  assert.ok(i > 0 && i < enter.indexOf('currentProf=incomingProf;'));
  const branch = enter.slice(i, enter.indexOf("nexaSetCapabilityState('verified');currentProf=incomingProf;"));
  assert.doesNotMatch(branch, /signOut|clearClinicalSession|stopRec|nexaClearPersistedSession/);
  assert.match(branch, /if\(currentProf\?\.id===session\.user\.id\)\{[^}]*nexaSetCapabilityState\(kind==='denied'\?'denied':'unverified',kind\);nexaScheduleCapabilityRetry\(session\);return\}/);
  assert.match(branch, /Nada foi apagado/);
  assert.doesNotMatch(branch, /aguardando ativa/i);
  assert.match(enter, /nexaCapabilityRetries=0;clearTimeout\(nexaCapabilityRetryTimer\);nexaSetCapabilityState\('verified'\);currentProf=incomingProf;/);
});

test('new authorization-dependent actions are gated in three layers; ongoing recording is not', () => {
  assert.match(helpers, /const NEXA_CAPABILITY_GATED=\['nfProcess','nfTopProcess','generateExamsBtn','generatePrescriptionBtn','generateBothPlanBtn','clinicalSendBtn','submitAuditBtn'\];/);
  assert.match(helpers, /document\.addEventListener\('click',e=>\{[^\n]*NEXA_CAPABILITY_GATED\.includes\(b\.id\)\|\|nexaCapabilityState==='verified'[^\n]*e\.stopImmediatePropagation\(\)[^\n]*\},true\);/);
  assert.match(fnBody('async function startRec(){'), /startRec\(\)\{/);
  assert.match(html, /async function startRec\(\)\{\n  if\(recording\|\|recordingStarting\|\|!\$\('consent'\)\.checked\|\|!currentProf\?\.clinical_access\)return;\n  if\(!nexaCapabilityAllows\(\)\)return;/);
  assert.match(html, /async function processAudio\(\)\{\n  if\(!nexaCapabilityAllows\(\)\)return;\n/);
  assert.doesNotMatch(helpers, /'nexaLocalPauseBtn'|'nexaLocalFinishBtn'|'nfFinish'|'nfPause'/, 'pause/finish must stay available');
});

test('re-verification is bounded and only re-enters the same signed-in account', () => {
  assert.match(helpers, /if\(nexaCapabilityRetries>=10\)return;const wait=Math\.min\(6000\*2\*\*nexaCapabilityRetries,60000\)/);
  assert.match(helpers, /if\(s\?\.user\?\.id===session\.user\.id&&\(!currentProf\|\|currentProf\.id===s\.user\.id\)\)enter\(s\)/);
  assert.match(helpers, /window\.addEventListener\('online',nexaRecheckCapabilities\);window\.addEventListener\('focus',nexaRecheckCapabilities\);/);
});

test('genuine disabled/pending answers still sign out (access control unchanged; RLS stays server-side)', () => {
  assert.match(enter, /if\(currentProf\.access_status==='disabled'\)\{await sb\.auth\.signOut\(\)/);
  assert.match(enter, /if\(currentProf\.access_status==='pending'\)\{await sb\.auth\.signOut\(\)/);
});

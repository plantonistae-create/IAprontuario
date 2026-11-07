import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessG1OfflineReadiness, OFFLINE_ONLY_EXAMPLE, PINNED_G1 } from '../scripts/nexa-g1-offline-preflight.mjs';

const sample=()=>structuredClone(OFFLINE_ONLY_EXAMPLE);
function stopped(mutator,reason){
  const p=sample();mutator(p);const x=assessG1OfflineReadiness(p);
  assert.equal(x.result,'STOP');
  assert.ok(x.blockers.includes(reason),'expected '+reason+', got '+x.blockers.join(','));
  assert.equal(x.gates.g1,'BLOCKED_NOT_AUTHENTICATED');
  assert.equal(x.authorizationGranted,false);
  assert.equal(x.networkCalled,false);
  assert.equal(x.productionChanged,false);
}
test('offline fixture is valid only as local preparation; G1 through G4 remain blocked',()=>{
  const x=assessG1OfflineReadiness(sample());
  assert.equal(x.result,'OFFLINE_PREFLIGHT_PASS');
  assert.deepEqual(x.blockers,[]);
  assert.equal(x.gates.g1,'BLOCKED_NOT_AUTHENTICATED');
  assert.equal(x.gates.g4,'NO_GO');
  for(const field of ['networkCalled','authenticated','upstreamValidated','productionChanged','authorizationGranted','costSavingsUsdProven'])assert.equal(x[field],false);
});
test('missing or extra manifest fields fail closed, never inferred as approval',()=>{
  assert.equal(assessG1OfflineReadiness(null).result,'STOP');
  stopped(p=>{delete p.isolation},'MISSING_ISOLATION');
  stopped(p=>{p.actions.service_role='do-not-read'},'UNEXPECTED_ACTIONS_FIELD');
  stopped(p=>{p.mystery=true},'UNEXPECTED_TOP_LEVEL_FIELD');
});
test('remote production/staging and arbitrary remote URLs are refused',()=>{
  stopped(p=>{p.isolation.origin='https://fmkrcieubrlltiggyauc.supabase.co'},'PRODUCTION_OR_SECRET_REFERENCE');
  stopped(p=>{p.isolation.origin='https://phaitiijsjwrggdnoxiz.supabase.co'},'PRODUCTION_OR_SECRET_REFERENCE');
  stopped(p=>{p.isolation.origin='https://safe-looking.example.com:4173'},'NOT_ISOLATED_OFFLINE');
  stopped(p=>{p.isolation.origin='http://127.0.0.1:4173/other'},'NOT_ISOLATED_OFFLINE');
  stopped(p=>{p.isolation.origin='http://user:pass@127.0.0.1:4173'},'NOT_ISOLATED_OFFLINE');
});
test('unknown source, altered hosted function or missing JWT verification are refused',()=>{
  stopped(p=>{p.repository.main='not-a-real-commit'},'SOURCE_NOT_PINNED_DRAFT');
  stopped(p=>{p.repository.prDraft=false},'SOURCE_NOT_PINNED_DRAFT');
  stopped(p=>{p.hosted.bundleSha256='changed'},'HOSTED_V6_INTEGRITY_REQUIRED');
  stopped(p=>{p.hosted.modified=true},'HOSTED_V6_INTEGRITY_REQUIRED');
  stopped(p=>{p.hosted.verifyJwt=false},'HOSTED_V6_INTEGRITY_REQUIRED');
  assert.equal(PINNED_G1.hostedVersion,6);
});
test('off-network and disposable environment required',()=>{
  stopped(p=>{p.isolation.networkDisabled=false},'NOT_ISOLATED_OFFLINE');
  stopped(p=>{p.isolation.ephemeral=false},'NOT_ISOLATED_OFFLINE');
  stopped(p=>{p.isolation.remoteProject=true},'NOT_ISOLATED_OFFLINE');
});
test('credentials, auth and mutable operations are always blocked',()=>{
  stopped(p=>{p.credentials.configured=true},'CREDENTIALS_FORBIDDEN');
  stopped(p=>{p.credentials.adminAccess=true},'CREDENTIALS_FORBIDDEN');
  stopped(p=>{p.credentials.readEnvironment=true},'CREDENTIALS_FORBIDDEN');
  for(const key of ['login','makeRequest','upstream','writeDatabase','createResources','microphone','merge','deploy','changeJwtOrRls']){
    stopped(p=>{p.actions[key]=true},'OPERATION_FORBIDDEN');
  }
  stopped(p=>{p.actions.paidRequests=1},'OPERATION_FORBIDDEN');
});
test('privacy and explicit approval remain fail closed',()=>{
  stopped(p=>{p.privacy.syntheticOnly=false},'PRIVACY_POLICY_REQUIRED');
  stopped(p=>{p.privacy.patientData=true},'PRIVACY_POLICY_REQUIRED');
  stopped(p=>{p.privacy.audioCapture=true},'PRIVACY_POLICY_REQUIRED');
  stopped(p=>{p.privacy.transcriptsStored=true},'PRIVACY_POLICY_REQUIRED');
  stopped(p=>{p.privacy.requestBodyLogging=true},'PRIVACY_POLICY_REQUIRED');
  stopped(p=>{p.privacy.metadataOnlyLogs=false},'PRIVACY_POLICY_REQUIRED');
  for(const gate of ['g1','g2','g3','g4'])stopped(p=>{p.approvals[gate]=true},'AUTHORIZATION_NOT_GRANTED');
});
test('output returns reason codes only, never echoing forbidden input',()=>{
  const p=sample();p.isolation.origin='https://fmkrcieubrlltiggyauc.supabase.co/secret';
  const out=JSON.stringify(assessG1OfflineReadiness(p));
  assert.ok(!out.includes('fmkrcieubrlltiggyauc'));
  assert.ok(!out.includes('/secret'));
});
test('the preparatory module has no fetch/auth/resource side effects',()=>{
  const src=readFileSync(new URL('../scripts/nexa-g1-offline-preflight.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/\b(?:fetch\s*\(|createClient\s*\(|signInWithPassword\s*\(|process\.env|child_process|execSync\s*\()/);
  assert.match(src,/authorizationGranted:false/);
});

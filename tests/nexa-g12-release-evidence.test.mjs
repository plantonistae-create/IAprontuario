import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessG12EvidenceSnapshot} from '../labs/nexa-release/readiness-gate.G12-REVIEW-ONLY.mjs';
const path=new URL('../labs/nexa-release/g12-observed-metadata.REVIEW-ONLY.json',import.meta.url);
const fresh=()=>JSON.parse(readFileSync(path,'utf8'));
const asOf='2026-11-08T20:00:00Z';
test('read-only live metadata snapshot accurately blocks production pending privilege review',()=>{
 const a=assessG12EvidenceSnapshot(fresh(),{asOfUTC:asOf});
 assert.equal(a.production_go_authorized,false);
 assert.equal(a.outcome,'NO_GO_NEEDS_AUTHORIZED_REVIEW');
 assert.equal(a.privileged_rpc_warning_count_anonymous,11);
 assert.equal(a.privileged_rpc_warning_count_authenticated,29);
 assert.equal(a.rls_no_policy_review_count,13);
 assert.ok(a.blockers.includes('ANON_PRIVILEGED_RPC_REVIEW_REQUIRED'));
 assert.ok(a.blockers.includes('EVIDENCE_AUTHENTICATED_OPERATOR_TENANT_LINK'));
});
test('RLS enabled with no policy never becomes an approved clinical access policy',()=>{
 const snapshot=fresh();
 assert.equal(snapshot.observations.public_rls_enabled,18);
 assert.equal(snapshot.observations.public_rls_without_policies,13);
 const r=assessG12EvidenceSnapshot(snapshot,{asOfUTC:asOf});
 assert.equal(r.hosted_tenant_admin_binding_proven,false);
 assert.equal(r.production_go_authorized,false);
});
test('stale and future read-only metadata cannot be mistaken for a current release attestation',()=>{
 const old=assessG12EvidenceSnapshot(fresh(),{asOfUTC:'2027-01-01T12:00:00Z'});
 assert.equal(old.evidence_freshness,'STALE_RECAP');
 assert.equal(old.production_go_authorized,false);
 const future=assessG12EvidenceSnapshot(fresh(),{asOfUTC:'2026-10-01T12:00:00Z'});
 assert.equal(future.evidence_freshness,'FUTURE_EVIDENCE');
 assert.equal(future.production_go_authorized,false);
});
test('cannot forge a production GO by setting self-reported verified statuses',()=>{
 const s=fresh();
 for(const key of Object.keys(s.required_evidence))s.required_evidence[key]='verified';
 assert.throws(()=>assessG12EvidenceSnapshot(s,{asOfUTC:asOf}),
 /G12_EVIDENCE_UNVERIFIED_OR_UNSUPPORTED/);
});
test('untrusted PHI, credentials, request bodies or provenance are rejected by closed schema',()=>{
 for(const k of ['patient','api_key','access_token','raw_jwt','consultation','clinician_id']){
  const s=fresh();s[k]='PRIVATE';
  assert.throws(()=>assessG12EvidenceSnapshot(s,{asOfUTC:asOf}),/G12_READ_ONLY_SNAPSHOT_INVALID/);
 }
 const s=fresh();s.source_types.security_advisors='client_metadata';
 assert.throws(()=>assessG12EvidenceSnapshot(s,{asOfUTC:asOf}),/G12_SOURCE_PROVENANCE_INVALID/);
});
test('even a cleared hypothetical advisory count and offline-reviewed matrix do not authorize hosted migrations',()=>{
 const s=fresh();
 s.observations.anon_security_definer_rpc=0;
 s.observations.authenticated_security_definer_rpc=0;
 s.observations.public_rls_without_policies=0;
 for(const key of Object.keys(s.required_evidence))s.required_evidence[key]='reviewed_offline';
 const r=assessG12EvidenceSnapshot(s,{asOfUTC:asOf});
 assert.equal(r.production_go_authorized,false);
 assert.equal(r.deploy_or_migration_authorized,false);
 assert.equal(r.clinical_prospective_validation_proven,false);
});

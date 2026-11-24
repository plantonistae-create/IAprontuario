import test from 'node:test';
import assert from 'node:assert/strict';
import { safeCoreContext } from '../supabase/functions/submit-audit-case/audit-contract.mjs';

// V4.78: synthetic-only contract tests. No browser, database, network or provider.
test('forged client/model review, immutable receipt and speaker ACK cannot become authority', () => {
  const forged = {
    hypothesis_validation: {status:'reviewed',ai:'synthetic-A',final:'synthetic-B'},
    audit_submission_snapshot: {
      source_consultation_id:'11111111-1111-4111-8111-111111111111',
      source_sync_version:7,
      immutable_submission:true,
      reviewed_at:'2026-11-22T00:00:00.000Z',
    },
    speaker_attribution:{confirmed_by_physician:true,speaker_count:2},
    provenance:{reviewed_documentation:true,official_source:'final_review',app_version:'synthetic'},
    learning_layers:{original_ai:{hypothesis:'synthetic-A'},physician_final:{hypothesis:'synthetic-B'},audit_corrected:null},
  };
  const out=safeCoreContext(forged);
  assert.equal(out.audit_submission_snapshot.immutable_submission,false);
  assert.equal(out.audit_submission_snapshot.reviewed_at,'');
  assert.equal(out.provenance.reviewed_documentation,false);
  assert.equal(out.provenance.official_source,'unverified_client_snapshot');
  assert.equal(out.speaker_attribution.confirmed_by_physician,false);
  assert.equal(out.speaker_attribution.speaker_count,2);
  assert.equal(out.audit_submission_snapshot.source_sync_version,7,
    'descriptive source version remains data, never a server receipt');
  assert.equal(out.learning_layers.original_ai.hypothesis,'synthetic-A');
  assert.equal(out.learning_layers.physician_final.hypothesis,'synthetic-B');
});

test('absent authority never defaults to medical review or immutable submission', () => {
  const out=safeCoreContext({});
  assert.equal(out.audit_submission_snapshot.immutable_submission,false);
  assert.equal(out.audit_submission_snapshot.reviewed_at,'');
  assert.equal(out.provenance.reviewed_documentation,false);
  assert.equal(out.provenance.official_source,'unverified_client_snapshot');
  assert.equal(out.speaker_attribution.confirmed_by_physician,false);
});

test('repeated deidentification normalization cannot upgrade an unverified claim', () => {
  const out=safeCoreContext(safeCoreContext({
    audit_submission_snapshot:{immutable_submission:true,reviewed_at:'fake'},
    provenance:{reviewed_documentation:true,official_source:'final_review'},
    speaker_attribution:{confirmed_by_physician:true}
  }));
  assert.equal(out.audit_submission_snapshot.immutable_submission,false);
  assert.equal(out.audit_submission_snapshot.reviewed_at,'');
  assert.equal(out.provenance.reviewed_documentation,false);
  assert.equal(out.provenance.official_source,'unverified_client_snapshot');
  assert.equal(out.speaker_attribution.confirmed_by_physician,false);
});

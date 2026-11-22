/**
 * NEXA P0 ACK V2 SQL — offline STATIC assertions ONLY.
 * Never parses/executes SQL; never reaches Postgres, Supabase, network or CI.
 * This suite proves declared negative safety invariants, NOT real RLS/atomicity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./nexa-p0-ack-atomic-v2.REVIEW_ONLY.NOT_APPLIED.sql', import.meta.url), 'utf8');
const stripComments = x => x.replace(/--[^\n]*/g, '');
const statements = stripComments(sql);
const has = re => assert.match(sql,re);
const absent = re => assert.doesNotMatch(statements,re);

test('unconditional hard STOP precedes all DDL and DML', () => {
  const begin=statements.indexOf('BEGIN;');
  const stop=statements.indexOf("MESSAGE='STOP_ACK_V2_REVIEW_ONLY_DB_AUTHORITY_NOT_PROVEN'");
  const firstDdl=statements.search(/\bCREATE\s+(?:TABLE|FUNCTION|TRIGGER)\b/i);
  assert.ok(begin >= 0 && stop > begin && firstDdl > stop);
  has(/DO \$nexa_ack_v2_unconditional_stop\$[\s\S]*?RAISE EXCEPTION USING ERRCODE='42501'/);
  assert.match(statements.trimEnd(),/ROLLBACK;\s*$/);
  absent(/\bCOMMIT\s*;/i);
});
test('new objects only process receipts and review challenges, not consent ledger', () => {
  assert.deepEqual([...statements.matchAll(/\bCREATE TABLE\s+([\w.]+)/gi)].map(x=>x[1]),[
    'private.nexa_p0_processing_receipts_candidate',
    'private.nexa_p0_ack_challenges_candidate'
  ]);
  absent(/\bCREATE TABLE\s+private\.nexa_p0_source_action_events\b/i);
});
test('receipt has immutable identity, source revision, model and output', () => {
  has(/CREATE TABLE private\.nexa_p0_processing_receipts_candidate[\s\S]*?execution_id uuid NOT NULL/);
  for(const field of ['owner_user_id','encounter_id','source_row_id','source_sync_version','source_digest','execution_id','provider','model_version','output_digest','terminal_state','server_recorded_at']) {
    assert.match(sql,new RegExp('\\b'+field+'\\b'));
  }
  has(/canonicalization text NOT NULL DEFAULT 'pg-jsonb-v1'/);
  has(/terminal_state text NOT NULL CHECK \(terminal_state = 'COMPLETED'\)/);
  has(/UNIQUE \(owner_user_id, encounter_id, execution_id\)/);
});
test('processing receipt cannot be updated, deleted, or truncated', () => {
  has(/BEFORE UPDATE OR DELETE ON private\.nexa_p0_processing_receipts_candidate/);
  has(/BEFORE TRUNCATE ON private\.nexa_p0_processing_receipts_candidate/);
  has(/MESSAGE='PROCESSING_RECEIPT_IMMUTABLE'/);
});
test('challenges bind same owner, source, version and processing receipt via FK', () => {
  has(/FOREIGN KEY \(processing_receipt_id, owner_user_id, encounter_id,[\s\S]*?\)\s+REFERENCES private\.nexa_p0_processing_receipts_candidate/);
  has(/consent_event_id uuid NOT NULL[\s\S]*?REFERENCES private\.nexa_p0_source_action_events\(event_id\)/);
  has(/final_ack_event_id uuid REFERENCES private\.nexa_p0_source_action_events\(event_id\)/);
});
test('secret is stored only as verifier, expiring within five minutes', () => {
  has(/nonce_verifier bytea NOT NULL CHECK \(pg_catalog\.octet_length\(nonce_verifier\) = 32\)/);
  has(/CHECK \(expires_at > issued_at AND expires_at <= issued_at \+ INTERVAL '5 minutes'\)/);
  absent(/\b(?:challenge_token|raw_secret|nonce_plaintext)\s+(?:text|bytea)\b/i);
});
test('challenge can only have unconsumed or fully consumed column states', () => {
  has(/consumed_at IS NULL AND consumed_action_id IS NULL AND final_ack_event_id IS NULL/);
  has(/consumed_at IS NOT NULL AND consumed_action_id IS NOT NULL[\s\S]*?final_ack_event_id IS NOT NULL/);
  has(/UNIQUE \(owner_user_id, encounter_id, consumed_action_id\)/);
  has(/BEFORE DELETE ON private\.nexa_p0_ack_challenges_candidate/);
  has(/BEFORE TRUNCATE ON private\.nexa_p0_ack_challenges_candidate/);
});
test('new candidate tables have FORCE RLS and no role activation', () => {
  for(const name of ['nexa_p0_processing_receipts_candidate','nexa_p0_ack_challenges_candidate']){
    assert.match(sql,new RegExp('ALTER TABLE private\\.'+name+' FORCE ROW LEVEL SECURITY'));
    assert.match(sql,new RegExp('REVOKE ALL ON private\\.'+name+' FROM PUBLIC'));
  }
  absent(/\bGRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE|EXECUTE)\b/i);
  absent(/\bCREATE POLICY\b/i);
});
test('all three candidate entrypoints raise before any action', () => {
  const functions=['nexa_p0_commit_processing_receipt_candidate','nexa_p0_issue_ack_challenge_candidate','nexa_p0_consume_ack_challenge_candidate'];
  for(const name of functions) {
    assert.match(sql,new RegExp('CREATE FUNCTION (?:private|public)\\.'+name+'\\([\\s\\S]*?AS \\$\\$\\s*BEGIN\\s*RAISE EXCEPTION USING ERRCODE='));
  }
  for(const code of ['PROCESSING_PRODUCER_AND_IMMUTABLE_READBACK_NOT_PROVEN','SERVER_CSPRNG_AUDIO_AND_CHALLENGE_AUTHORITY_NOT_PROVEN','ATOMIC_ACK_CONSUMPTION_AND_OWNER_RLS_NOT_PROVEN']) has(new RegExp(code));
});
test('actor identity is server-only and client actionId is not a nonce', () => {
  has(/Server authenticate via auth\.uid\(\)/);
  has(/actionId is idempotency, NOT challenge/);
  has(/Never\s+accept nonce\/verifier from client/);
});
test('lock order and atomic commit contract preserve #176 revocation boundary', () => {
  const contract=sql.slice(sql.indexOf('-- TRANSACTION DESIGN REQUIRED'));
  const p=contract.indexOf('consultation_history row FOR UPDATE');
  const advisory=contract.indexOf('#176 consent-scope advisory lock');
  const challenge=contract.indexOf('challenge row FOR UPDATE');
  const ack=contract.indexOf('PHYSICIAN_FINAL_REVIEW_ACK');
  assert.ok(p>=0 && advisory>p && challenge>advisory && ack>challenge);
  assert.match(contract,/INSERT exactly one[\s\S]*?private\.nexa_p0_source_action_events/);
  assert.match(contract,/ROLLBACK both ACK and consume/);
});
test('no authorizations, clinical backfill or egress paths are introduced', () => {
  absent(/\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE\s+TABLE|CREATE\s+POLICY)\b/i);
  has(/First AI egress, audit dispatch and locked reset stay DENIED/);
  has(/Gate C = NO-GO 0\/19/);
});


test('V3 focused challenge nonce uniqueness is enforced at schema level', () => {
  const start=statements.indexOf('CREATE TABLE private.nexa_p0_ack_challenges_candidate');
  const end=statements.indexOf('ALTER TABLE private.nexa_p0_ack_challenges_candidate');
  assert.ok(start>=0 && end>start);
  const challengeTable=statements.slice(start,end);
  assert.match(challengeTable, /nonce_verifier bytea NOT NULL CHECK \(pg_catalog\.octet_length\(nonce_verifier\) = 32\)/);
  assert.match(challengeTable, /UNIQUE \(nonce_verifier\)/);
});

test('V3 focused challenge UPDATE cannot silently consume without reviewed transition guard', () => {
  assert.match(statements, /CREATE FUNCTION private\.nexa_p0_reject_challenge_update_candidate\(\)[\s\S]*?MESSAGE='CHALLENGE_UPDATE_NOT_AUTHORIZED'/);
  assert.match(statements, /CREATE TRIGGER nexa_p0_ack_challenge_no_update_candidate\s+BEFORE UPDATE ON private\.nexa_p0_ack_challenges_candidate\s+FOR EACH ROW EXECUTE FUNCTION private\.nexa_p0_reject_challenge_update_candidate\(\)/);
  assert.doesNotMatch(statements, /GRANT\s+UPDATE\b/i);
});


test('every candidate PL/pgSQL function uses paired dollar quotes', () => {
  const functionCount = [...statements.matchAll(/\bCREATE FUNCTION\s+[\w.]+\s*\(/gi)].length;
  const paired = [...statements.matchAll(/\bAS\s+\$\$[\s\S]*?\$\$\s*;/gi)].length;
  assert.equal(functionCount, 6, 'expected exactly six reviewed function definitions');
  assert.equal(paired, functionCount, 'each function body must have AS $$ ... $$;');
  assert.doesNotMatch(statements, /\bAS\s+\$(?!\$)/i, 'bare $ is not a valid PostgreSQL delimiter');
});

test('candidate SECURITY DEFINER entrypoints explicitly revoke all application roles', () => {
  const names = [
    'private.nexa_p0_commit_processing_receipt_candidate',
    'public.nexa_p0_issue_ack_challenge_candidate',
    'public.nexa_p0_consume_ack_challenge_candidate',
  ];
  for (const name of names) {
    assert.match(statements, new RegExp(
      'REVOKE ALL ON FUNCTION '+name.replaceAll('.', '\\.')+
      '\\([\\s\\S]*?\\) FROM PUBLIC, anon, authenticated, service_role\\s*;', 'i'
    ), 'explicit role revocations missing for '+name);
  }
  assert.doesNotMatch(statements, /\bGRANT\s+EXECUTE\b/i);
});

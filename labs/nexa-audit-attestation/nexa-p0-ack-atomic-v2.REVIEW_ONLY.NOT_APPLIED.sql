-- NEXA P0 ACK V2 — TRANSACTION CONTRACT ONLY. NOT APPLIED OR TESTED IN POSTGRES.
-- Stacked on PR #176@09803e2b47252cd32c49fef15fbe20d64e8521ac.
-- Do NOT run this SQL. Inadvertent application must fail BEFORE any DDL/DML.
-- Existing consent/revocation/final ACK ledger from #176 MUST NOT be copied.
-- Prohibited: hosted SQL, release, rights elevation, consent backfill, AI egress.
--
-- Authority status: owner/ACL/RLS, processing producer, audio manifest,
-- server challenge CSPRNG/nonce verifier and physical C01-C10/N01-N09 UNPROVEN.
-- Gate C = NO-GO 0/19.
BEGIN;
DO $nexa_ack_v2_unconditional_stop$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501',
    MESSAGE='STOP_ACK_V2_REVIEW_ONLY_DB_AUTHORITY_NOT_PROVEN';
END;
$nexa_ack_v2_unconditional_stop$;
-- Everything below is UNREACHABLE when the file is processed as a single
-- transaction. On the STOP the transaction aborts; the final ROLLBACK is only
-- cleanup. Do not remove this STOP as a "test fix".

-- Candidate immutable PROCESSING receipt; the server cannot mint a receipt
-- from an HTTP 200, returned text, processing_meta or browser-side "completed".
-- Future producer must bind a real server-owned execution to the exact
-- persisted source revision under a separately authorized transaction.
CREATE TABLE private.nexa_p0_processing_receipts_candidate (
  receipt_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  source_row_id text NOT NULL,
  source_sync_version bigint NOT NULL CHECK (source_sync_version > 0),
  source_digest text NOT NULL CHECK (source_digest ~ '^sha256:[0-9a-f]{64}$'),
  canonicalization text NOT NULL DEFAULT 'pg-jsonb-v1'
    CHECK (canonicalization = 'pg-jsonb-v1'),
  execution_id uuid NOT NULL,
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 100),
  model_version text NOT NULL CHECK (length(model_version) BETWEEN 1 AND 120),
  output_digest text NOT NULL CHECK (output_digest ~ '^sha256:[0-9a-f]{64}$'),
  terminal_state text NOT NULL CHECK (terminal_state = 'COMPLETED'),
  server_recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (owner_user_id, encounter_id, execution_id),
  UNIQUE (receipt_id, owner_user_id, encounter_id, source_row_id,
    source_sync_version, source_digest)
);
ALTER TABLE private.nexa_p0_processing_receipts_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nexa_p0_processing_receipts_candidate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.nexa_p0_processing_receipts_candidate FROM PUBLIC;

CREATE FUNCTION private.nexa_p0_reject_receipt_mutation_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='PROCESSING_RECEIPT_IMMUTABLE';
END;
$$;
CREATE TRIGGER nexa_p0_processing_receipt_no_update_delete_candidate
BEFORE UPDATE OR DELETE ON private.nexa_p0_processing_receipts_candidate
FOR EACH ROW EXECUTE FUNCTION private.nexa_p0_reject_receipt_mutation_candidate();
CREATE TRIGGER nexa_p0_processing_receipt_no_truncate_candidate
BEFORE TRUNCATE ON private.nexa_p0_processing_receipts_candidate
FOR EACH STATEMENT EXECUTE FUNCTION private.nexa_p0_reject_receipt_mutation_candidate();

-- Challenge identity is owned by the server; the browser supplies only the
-- returned opaque secret to the consumer. Store ONLY a server-side verifier.
-- No CSPRNG function or backend verifier is proven yet. Never accept a client-
-- chosen challenge/nonce or "verified" bit.
CREATE TABLE private.nexa_p0_ack_challenges_candidate (
  challenge_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  source_row_id text NOT NULL,
  source_sync_version bigint NOT NULL CHECK (source_sync_version > 0),
  source_digest text NOT NULL CHECK (source_digest ~ '^sha256:[0-9a-f]{64}$'),
  canonicalization text NOT NULL DEFAULT 'pg-jsonb-v1'
    CHECK (canonicalization = 'pg-jsonb-v1'),
  processing_receipt_id uuid NOT NULL,
  audio_completion_evidence_id uuid NOT NULL,
  consent_event_id uuid NOT NULL
    REFERENCES private.nexa_p0_source_action_events(event_id),
  nonce_verifier bytea NOT NULL CHECK (pg_catalog.octet_length(nonce_verifier) = 32),
  UNIQUE (nonce_verifier), -- Reject server nonce/verifier reuse across challenges.
  issued_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_action_id uuid,
  final_ack_event_id uuid REFERENCES private.nexa_p0_source_action_events(event_id),
  FOREIGN KEY (processing_receipt_id, owner_user_id, encounter_id,
    source_row_id, source_sync_version, source_digest)
    REFERENCES private.nexa_p0_processing_receipts_candidate
      (receipt_id, owner_user_id, encounter_id, source_row_id,
       source_sync_version, source_digest),
  UNIQUE (owner_user_id, encounter_id, consumed_action_id),
  UNIQUE (final_ack_event_id),
  CHECK (expires_at > issued_at AND expires_at <= issued_at + INTERVAL '5 minutes'),
  CHECK (
    (consumed_at IS NULL AND consumed_action_id IS NULL AND final_ack_event_id IS NULL)
    OR
    (consumed_at IS NOT NULL AND consumed_action_id IS NOT NULL
      AND final_ack_event_id IS NOT NULL)
  )
);
ALTER TABLE private.nexa_p0_ack_challenges_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nexa_p0_ack_challenges_candidate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.nexa_p0_ack_challenges_candidate FROM PUBLIC;

-- Direct UPDATE on challenge rows is forbidden in this candidate; a future
-- reviewed transaction must replace this unconditional trigger with a narrow
-- single-use NULL -> consumed transition guard under proven owner/RLS/ACL.
-- Never expose challenge consumption by client-supplied flags.
CREATE FUNCTION private.nexa_p0_reject_challenge_update_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='CHALLENGE_UPDATE_NOT_AUTHORIZED';
END;
$;
CREATE TRIGGER nexa_p0_ack_challenge_no_update_candidate
BEFORE UPDATE ON private.nexa_p0_ack_challenges_candidate
FOR EACH ROW EXECUTE FUNCTION private.nexa_p0_reject_challenge_update_candidate();

CREATE FUNCTION private.nexa_p0_reject_challenge_delete_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='CHALLENGE_DELETE_FORBIDDEN';
END;
$$;
CREATE TRIGGER nexa_p0_ack_challenge_no_delete_candidate
BEFORE DELETE ON private.nexa_p0_ack_challenges_candidate
FOR EACH ROW EXECUTE FUNCTION private.nexa_p0_reject_challenge_delete_candidate();
CREATE TRIGGER nexa_p0_ack_challenge_no_truncate_candidate
BEFORE TRUNCATE ON private.nexa_p0_ack_challenges_candidate
FOR EACH STATEMENT EXECUTE FUNCTION private.nexa_p0_reject_challenge_delete_candidate();

-- These entrypoints declare narrow server APIs ONLY; there is no positive
-- implementation and no EXECUTE grants in this candidate. Function owners,
-- role membership and RLS policies are NOT presumed from source text.
CREATE FUNCTION private.nexa_p0_commit_processing_receipt_candidate(
  p_execution_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501',
    MESSAGE='PROCESSING_PRODUCER_AND_IMMUTABLE_READBACK_NOT_PROVEN';
END;
$$;

CREATE FUNCTION public.nexa_p0_issue_ack_challenge_candidate(
  p_encounter uuid, p_expected_sync_version bigint, p_displayed_digest text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501',
    MESSAGE='SERVER_CSPRNG_AUDIO_AND_CHALLENGE_AUTHORITY_NOT_PROVEN';
END;
$$;

CREATE FUNCTION public.nexa_p0_consume_ack_challenge_candidate(
  p_encounter uuid, p_challenge_id uuid, p_challenge_secret text,
  p_action_id uuid, p_expected_sync_version bigint,
  p_displayed_digest text, p_physician_explicit_confirmation boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501',
    MESSAGE='ATOMIC_ACK_CONSUMPTION_AND_OWNER_RLS_NOT_PROVEN';
END;
$$;
-- Defense-in-depth: no public EXECUTE even if the first STOP is
-- removed in an unsafe edit. No privileged role is granted access.
REVOKE ALL ON FUNCTION private.nexa_p0_commit_processing_receipt_candidate(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.nexa_p0_issue_ack_challenge_candidate(uuid,bigint,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.nexa_p0_consume_ack_challenge_candidate(
  uuid,uuid,text,uuid,bigint,text,boolean
) FROM PUBLIC, anon, authenticated, service_role;
-- No GRANT EXECUTE. In a future reviewed migration, revokes and all DDL
-- must be performed in one transaction before the functions become visible.

-- TRANSACTION DESIGN REQUIRED BEFORE REMOVING ANY STOP (NOT IMPLEMENTED):
-- 1. Server authenticate via auth.uid(); require active physician and own slot.
--    Reject service_role, unreviewed SECURITY DEFINER owners or BYPASSRLS.
-- 2. Same transaction: lock profile/slot FOR SHARE, then exact owned
--    consultation_history row FOR UPDATE (compatible with autosave row update).
--    Recompute private.nexa_p0_clinical_digest(fields, processing_meta,
--    protocol_usage, consent_recorded_at) using #176 pg-jsonb-v1. Compare
--    expected sync_version and displayed digest; reject new edits/conflicts.
-- 3. Obtain the EXACT #176 consent-scope advisory lock (owner|encounter|
--    purpose|provider|policy_version) shared with revoke_target_event AFTER
--    source lock. Revalidate approved purpose/policy, active consent event,
--    revocation history, correct owner/source/digest and event order.
--    Advisory lock serializes; it does NOT grant authorization or replace RLS.
-- 4. Read immutable processing receipt under its restricted role; prove its
--    owner, execution, actual producer, output, version, digest and independent
--    readback. Prove authenticated audio session manifest/chunk accounting,
--    provider processing completion and exact source reconciliation. A
--    retention/archive receipt is required ONLY when independently authorized.
--    Audio evidence provider and schema are currently MISSING => hard STOP.
-- 5. ISSUE: the trusted server generates 256-bit CSPRNG opaque secret (exact
--    approved facility still UNRESOLVED), stores ONLY verifier/hash and
--    challenge scope with <=5 min expiry; ensure one active challenge per
--    owner/source/revision/purpose or define explicit revocation rules.
--    Never accept nonce/verifier from client or infer completeness from processing_meta.
-- 6. CONSUME: lock existing challenge row FOR UPDATE AFTER source and policy
--    lock, verify nonce with reviewed constant-time method, unused/unexpired
--    state with server clock; verify matching owner/source/version/digest,
--    immutable processing/audio/consent IDs. Explicit physician confirmation
--    and caller actionId are required; actionId is idempotency, NOT challenge.
-- 7. In the SAME transaction, INSERT exactly one
--    PHYSICIAN_FINAL_REVIEW_ACK into EXISTING
--    private.nexa_p0_source_action_events from #176 with p_action_id,
--    event_kind, source_row_id, encounter_id, owner_user_id,
--    source_sync_version, source_digest, canonicalization='pg-jsonb-v1',
--    physician_explicit_action=true, patient_scope_attested=false,
--    purpose/provider/policy_version=NULL. DO NOT make a second ACK ledger.
--    Update challenge consumed_at/action_id/final_ack_event_id in that SAME
--    transaction, constrained by consumed_at IS NULL and unique action keys.
--    Any failure/revocation/edit/conflict must ROLLBACK both ACK and consume.
-- 8. Commit once. Independently read back the current owned source, event ID
--    and challenge consumption; NEVER claim success on an uncertain write.
--    First AI egress, audit dispatch and locked reset stay DENIED.
--
-- PHYSICAL GATES: prove effective restricted role, grants/memberships, RLS,
-- ownership and lock order with independent actors C01-C10 and N01-N09.
-- No schema-only dump can prove production runtime authority.
ROLLBACK;

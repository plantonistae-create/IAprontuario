-- Candidate contract for receipts that have already passed cryptographic
-- verification against a separately governed, pinned external verifier key.
-- This table is not an intake endpoint and a row inserted by a database
-- operator is not, by itself, proof that external verification occurred.
-- The historical mapper remains fail-closed until a real verifier integration
-- and recovery rehearsal are independently approved.
CREATE TABLE IF NOT EXISTS private.nexa_external_issuer_verified_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evidence_id uuid NOT NULL
   REFERENCES private.nexa_historical_evidence(id) ON DELETE RESTRICT,
 previous_receipt_id uuid
   REFERENCES private.nexa_external_issuer_verified_receipts(id) ON DELETE RESTRICT,
 previous_receipt_sha256 text
   CHECK (previous_receipt_sha256 IS NULL OR previous_receipt_sha256 ~ '^[a-f0-9]{64}$'),
 sequence_no integer NOT NULL CHECK (sequence_no > 0),
 event_kind text NOT NULL CHECK (event_kind IN ('verified','revoked','contested')),
 issuer_identity text NOT NULL CHECK (length(btrim(issuer_identity)) BETWEEN 1 AND 500),
 independent_verifier_identity text NOT NULL
   CHECK (length(btrim(independent_verifier_identity)) BETWEEN 1 AND 500),
 verifier_key_id text NOT NULL CHECK (length(btrim(verifier_key_id)) BETWEEN 1 AND 200),
 signing_algorithm text NOT NULL CHECK (signing_algorithm = 'ES256'),
 verification_method text NOT NULL CHECK (
   verification_method IN ('digital_signature','issuer_api','issuer_confirmation','institutional_registry')
 ),
 external_event_id text NOT NULL CHECK (length(btrim(external_event_id)) BETWEEN 1 AND 500),
 document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
 source_reference_sha256 text NOT NULL CHECK (source_reference_sha256 ~ '^[a-f0-9]{64}$'),
 proof_reference_sha256 text NOT NULL CHECK (proof_reference_sha256 ~ '^[a-f0-9]{64}$'),
 signed_payload_sha256 text NOT NULL CHECK (signed_payload_sha256 ~ '^[a-f0-9]{64}$'),
 compact_jws_sha256 text NOT NULL UNIQUE CHECK (compact_jws_sha256 ~ '^[a-f0-9]{64}$'),
 assertion_issued_at timestamptz NOT NULL,
 assertion_expires_at timestamptz NOT NULL,
 externally_verified_at timestamptz NOT NULL,
 signature_verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ingestion_contract_version text NOT NULL DEFAULT 'nexa-external-issuer-receipt-v1'
   CHECK (ingestion_contract_version = 'nexa-external-issuer-receipt-v1'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (assertion_expires_at > assertion_issued_at),
 CHECK (externally_verified_at <= assertion_issued_at + interval '5 minutes'),
 CHECK (
   (sequence_no = 1 AND event_kind = 'verified'
     AND previous_receipt_id IS NULL AND previous_receipt_sha256 IS NULL)
   OR
   (sequence_no > 1 AND previous_receipt_id IS NOT NULL
     AND previous_receipt_sha256 IS NOT NULL)
 )
);

CREATE UNIQUE INDEX IF NOT EXISTS nexa_external_issuer_receipt_first_event
 ON private.nexa_external_issuer_verified_receipts(evidence_id)
 WHERE sequence_no = 1;
CREATE UNIQUE INDEX IF NOT EXISTS nexa_external_issuer_receipt_linear_chain
 ON private.nexa_external_issuer_verified_receipts(previous_receipt_id)
 WHERE previous_receipt_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS nexa_external_issuer_receipt_replay_guard
 ON private.nexa_external_issuer_verified_receipts(
   independent_verifier_identity,external_event_id
 );
CREATE INDEX IF NOT EXISTS nexa_external_issuer_receipt_history
 ON private.nexa_external_issuer_verified_receipts(evidence_id,sequence_no,recorded_at,id);

ALTER TABLE private.nexa_external_issuer_verified_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nexa_external_issuer_verified_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.nexa_external_issuer_verified_receipts
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.nexa_check_external_issuer_verified_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
 v_evidence private.nexa_historical_evidence%ROWTYPE;
 v_previous private.nexa_external_issuer_verified_receipts%ROWTYPE;
BEGIN
 SELECT * INTO v_evidence
 FROM private.nexa_historical_evidence
 WHERE id = new.evidence_id
 FOR KEY SHARE;

 IF NOT FOUND
    OR new.issuer_identity IS DISTINCT FROM v_evidence.issuer
    OR new.document_sha256 IS DISTINCT FROM v_evidence.document_sha256 THEN
   RAISE EXCEPTION 'verified receipt does not match historical evidence'
     USING ERRCODE = '23514';
 END IF;

 IF new.sequence_no > 1 THEN
   SELECT * INTO v_previous
   FROM private.nexa_external_issuer_verified_receipts
   WHERE id = new.previous_receipt_id
   FOR UPDATE;

   IF NOT FOUND
      OR v_previous.evidence_id IS DISTINCT FROM new.evidence_id
      OR v_previous.sequence_no + 1 IS DISTINCT FROM new.sequence_no
      OR v_previous.compact_jws_sha256 IS DISTINCT FROM new.previous_receipt_sha256
      OR v_previous.independent_verifier_identity
         IS DISTINCT FROM new.independent_verifier_identity THEN
     RAISE EXCEPTION 'verified receipt chain is invalid'
       USING ERRCODE = '23514';
   END IF;
 END IF;

 RETURN new;
END $$;

DROP TRIGGER IF EXISTS nexa_external_issuer_verified_receipt_check
 ON private.nexa_external_issuer_verified_receipts;
CREATE TRIGGER nexa_external_issuer_verified_receipt_check
 BEFORE INSERT ON private.nexa_external_issuer_verified_receipts
 FOR EACH ROW EXECUTE FUNCTION private.nexa_check_external_issuer_verified_receipt();

DROP TRIGGER IF EXISTS nexa_external_issuer_verified_receipts_immutable
 ON private.nexa_external_issuer_verified_receipts;
CREATE TRIGGER nexa_external_issuer_verified_receipts_immutable
 BEFORE UPDATE OR DELETE ON private.nexa_external_issuer_verified_receipts
 FOR EACH ROW EXECUTE FUNCTION private.nexa_reject_evidence_decision_mutation();

REVOKE ALL ON FUNCTION private.nexa_check_external_issuer_verified_receipt()
 FROM PUBLIC,anon,authenticated;

COMMENT ON TABLE private.nexa_external_issuer_verified_receipts IS
 'Append-only receipts already verified against a pinned external ES256 key; database presence alone is not authenticity proof and does not activate historical mapping.';

-- Preserve the release gate even when structurally valid receipt rows exist.
CREATE OR REPLACE FUNCTION private.nexa_apply_verified_legacy_mapping()
RETURNS TABLE(entity_type text,applied bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 RAISE EXCEPTION 'externally authenticated issuer proof integration not approved; historical mapping disabled'
   USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION private.nexa_apply_verified_legacy_mapping()
 FROM PUBLIC,anon,authenticated;

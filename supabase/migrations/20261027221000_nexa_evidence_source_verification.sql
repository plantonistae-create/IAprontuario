-- Independent source verification ledger. No source is trusted merely because an operator writes an attestation.
-- Verifiers must validate an issuer through a separately governed integration or offline process.
CREATE TABLE IF NOT EXISTS private.nexa_evidence_source_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evidence_id uuid NOT NULL REFERENCES private.nexa_historical_evidence(id) ON DELETE RESTRICT,
 issuer_identity text NOT NULL,
 issuer_organization_id uuid NOT NULL REFERENCES public.organizations(id),
 method text NOT NULL CHECK (method IN ('digital_signature','issuer_api','issuer_confirmation','institutional_registry')),
 source_reference text NOT NULL,
 proof_reference text NOT NULL,
 document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
 verifier_id uuid NOT NULL REFERENCES public.profiles(id),
 verified_at timestamptz NOT NULL DEFAULT now(),
 outcome text NOT NULL CHECK (outcome IN ('valid','invalid','revoked','contested')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 CHECK (length(btrim(source_reference))>0 AND length(btrim(proof_reference))>0)
);
CREATE INDEX IF NOT EXISTS nexa_evidence_source_verifications_latest
 ON private.nexa_evidence_source_verifications(evidence_id,verified_at DESC,id DESC);
REVOKE ALL ON private.nexa_evidence_source_verifications FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS nexa_source_verification_immutable ON private.nexa_evidence_source_verifications;
CREATE TRIGGER nexa_source_verification_immutable BEFORE UPDATE OR DELETE
 ON private.nexa_evidence_source_verifications FOR EACH ROW
 EXECUTE FUNCTION private.nexa_reject_evidence_decision_mutation();
-- This ledger is a technical prerequisite, NOT proof that external verification occurred.
-- Production use requires a trusted verifier service and a protected immutable proof store.

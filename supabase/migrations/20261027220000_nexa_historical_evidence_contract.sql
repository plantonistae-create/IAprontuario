-- NEXA historical provenance contract. Additive; no clinical records are changed.
CREATE TABLE IF NOT EXISTS private.nexa_historical_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 professional_user_id uuid NOT NULL REFERENCES public.profiles(id),
 entity_type text NOT NULL CHECK (entity_type IN ('consultation_history','audit_cases','nexa_core_cases')),
 entity_id text NOT NULL,
 document_type text NOT NULL,
 issuer text NOT NULL,
 external_reference text NOT NULL,
 secure_document_reference text NOT NULL,
 document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
 acquisition_method text NOT NULL,
 acquired_at timestamptz NOT NULL DEFAULT now(),
 collected_by uuid NOT NULL REFERENCES public.profiles(id),
 valid_from timestamptz NOT NULL,
 valid_until timestamptz NOT NULL,
 source_authentication_method text,
 source_authenticated_at timestamptz,
 source_authenticated_by uuid REFERENCES public.profiles(id),
 integrity_verified_at timestamptz,
 integrity_verified_by uuid REFERENCES public.profiles(id),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','revoked','contested')),
 verified_at timestamptz,
 verified_by uuid REFERENCES public.profiles(id),
 verification_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (valid_until > valid_from),
 CHECK (status <> 'verified' OR (
   source_authenticated_at IS NOT NULL AND source_authenticated_by IS NOT NULL
   AND integrity_verified_at IS NOT NULL AND integrity_verified_by IS NOT NULL
   AND verified_at IS NOT NULL AND verified_by IS NOT NULL
   AND verification_reason IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS private.nexa_historical_evidence_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evidence_id uuid NOT NULL REFERENCES private.nexa_historical_evidence(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 proposer_id uuid NOT NULL REFERENCES public.profiles(id),
 approver_id uuid NOT NULL REFERENCES public.profiles(id),
 decision text NOT NULL CHECK (decision IN ('approved','rejected','rescinded')),
 rationale text NOT NULL,
 contract_version integer NOT NULL DEFAULT 1,
 decided_at timestamptz NOT NULL DEFAULT now(),
 CHECK (proposer_id <> approver_id)
);
CREATE INDEX IF NOT EXISTS nexa_historical_evidence_lookup_idx
 ON private.nexa_historical_evidence (entity_type,entity_id,organization_id,status);
CREATE INDEX IF NOT EXISTS nexa_historical_evidence_decision_idx
 ON private.nexa_historical_evidence_decisions (evidence_id,decided_at DESC,id DESC);
REVOKE ALL ON private.nexa_historical_evidence FROM PUBLIC,anon,authenticated;
REVOKE ALL ON private.nexa_historical_evidence_decisions FROM PUBLIC,anon,authenticated;
-- Immutable decisions: corrections are new events. Only privileged migration operators may write.
CREATE OR REPLACE FUNCTION private.nexa_reject_evidence_decision_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'historical evidence decisions are append-only'; END $$;
DROP TRIGGER IF EXISTS nexa_evidence_decisions_immutable ON private.nexa_historical_evidence_decisions;
CREATE TRIGGER nexa_evidence_decisions_immutable BEFORE UPDATE OR DELETE
ON private.nexa_historical_evidence_decisions FOR EACH ROW
EXECUTE FUNCTION private.nexa_reject_evidence_decision_mutation();
-- Verification fields are administrative attestations, not independent proof of authenticity.
-- Production activation must require independent source validation and restore testing.

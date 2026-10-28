-- Pending issuer-proof intake. An administrative event is never external proof.
-- Keep the historical mapper disabled until a separately authenticated issuer
-- integration verifies the signature/source and a later migration enables it.
CREATE TABLE IF NOT EXISTS private.nexa_external_issuer_proof_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evidence_id uuid NOT NULL REFERENCES private.nexa_historical_evidence(id) ON DELETE RESTRICT,
 previous_event_id uuid REFERENCES private.nexa_external_issuer_proof_events(id) ON DELETE RESTRICT,
 event_kind text NOT NULL CHECK (event_kind IN ('submitted','revoked','contested')),
 claimed_issuer_identity text NOT NULL,
 document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
 method text NOT NULL CHECK (method IN ('digital_signature','issuer_api','issuer_confirmation','institutional_registry')),
 source_reference text NOT NULL CHECK (length(btrim(source_reference)) > 0),
 proof_reference text NOT NULL CHECK (length(btrim(proof_reference)) > 0),
 recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((event_kind='submitted' AND previous_event_id IS NULL)
     OR (event_kind<>'submitted' AND previous_event_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS nexa_external_issuer_proof_events_history
 ON private.nexa_external_issuer_proof_events(evidence_id,recorded_at,id);
REVOKE ALL ON private.nexa_external_issuer_proof_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.nexa_check_external_issuer_proof_event()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 v_evidence private.nexa_historical_evidence%ROWTYPE;
 v_previous uuid;
BEGIN
 SELECT * INTO v_evidence FROM private.nexa_historical_evidence WHERE id=new.evidence_id;
 IF NOT FOUND OR new.claimed_issuer_identity IS DISTINCT FROM v_evidence.issuer
    OR new.document_sha256 IS DISTINCT FROM v_evidence.document_sha256 THEN
   RAISE EXCEPTION 'issuer proof does not match historical evidence' USING ERRCODE='23514';
 END IF;
 IF new.previous_event_id IS NOT NULL THEN
   SELECT evidence_id INTO v_previous FROM private.nexa_external_issuer_proof_events
    WHERE id=new.previous_event_id;
   IF v_previous IS DISTINCT FROM new.evidence_id THEN
     RAISE EXCEPTION 'issuer proof chain crosses evidence records' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS nexa_external_issuer_proof_event_check ON private.nexa_external_issuer_proof_events;
CREATE TRIGGER nexa_external_issuer_proof_event_check BEFORE INSERT
 ON private.nexa_external_issuer_proof_events FOR EACH ROW
 EXECUTE FUNCTION private.nexa_check_external_issuer_proof_event();
DROP TRIGGER IF EXISTS nexa_external_issuer_proof_events_immutable ON private.nexa_external_issuer_proof_events;
CREATE TRIGGER nexa_external_issuer_proof_events_immutable BEFORE UPDATE OR DELETE
 ON private.nexa_external_issuer_proof_events FOR EACH ROW
 EXECUTE FUNCTION private.nexa_reject_evidence_decision_mutation();
REVOKE ALL ON FUNCTION private.nexa_check_external_issuer_proof_event() FROM PUBLIC,anon,authenticated;

-- No trusted issuer integration is installed. Preserve the earlier mapper's
-- other contract tests, then replace its executable entry point fail-closed.
CREATE OR REPLACE FUNCTION private.nexa_apply_verified_legacy_mapping()
RETURNS TABLE(entity_type text,applied bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'externally authenticated issuer proof unavailable; historical mapping disabled'
   USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION private.nexa_apply_verified_legacy_mapping() FROM PUBLIC,anon,authenticated;

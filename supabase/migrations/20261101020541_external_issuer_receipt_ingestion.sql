-- Candidate service-only intake. The Edge boundary verifies ES256 before calling
-- this atomic persistence function. This function alone is not issuer proof.
CREATE OR REPLACE FUNCTION public.nexa_ingest_verified_external_receipt(p_receipt jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_evidence uuid;
 v_previous private.nexa_external_issuer_verified_receipts%ROWTYPE;
 v_existing private.nexa_external_issuer_verified_receipts%ROWTYPE;
 v_id uuid;
BEGIN
 -- The EXECUTE grant is restricted to service_role. PostgREST's JWT claim GUC
 -- is not stable across the local gateway runtimes; do not infer authority from it.
 v_evidence:=(p_receipt->>'evidence_id')::uuid;
 PERFORM 1 FROM private.nexa_historical_evidence WHERE id=v_evidence FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'evidence missing' USING ERRCODE='23503'; END IF;

 SELECT * INTO v_existing FROM private.nexa_external_issuer_verified_receipts
 WHERE independent_verifier_identity=p_receipt->>'independent_verifier_identity'
  AND external_event_id=p_receipt->>'external_event_id';
 IF FOUND THEN
  IF v_existing.evidence_id=v_evidence
   AND v_existing.compact_jws_sha256=p_receipt->>'compact_jws_sha256'
   AND v_existing.signed_payload_sha256=p_receipt->>'signed_payload_sha256'
  THEN RETURN v_existing.id; END IF;
  RAISE EXCEPTION 'receipt replay conflict' USING ERRCODE='23505';
 END IF;

 SELECT * INTO v_previous FROM private.nexa_external_issuer_verified_receipts
 WHERE evidence_id=v_evidence ORDER BY sequence_no DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  IF (p_receipt->>'sequence_no')::integer<>v_previous.sequence_no+1
   OR p_receipt->>'previous_receipt_sha256' IS DISTINCT FROM v_previous.compact_jws_sha256
   OR p_receipt->>'independent_verifier_identity' IS DISTINCT FROM v_previous.independent_verifier_identity
  THEN RAISE EXCEPTION 'receipt chain conflict' USING ERRCODE='23514'; END IF;
 ELSE
  IF (p_receipt->>'sequence_no')::integer<>1 OR p_receipt->>'previous_receipt_sha256' IS NOT NULL
  THEN RAISE EXCEPTION 'receipt root conflict' USING ERRCODE='23514'; END IF;
 END IF;

 INSERT INTO private.nexa_external_issuer_verified_receipts(
  evidence_id,previous_receipt_id,previous_receipt_sha256,sequence_no,event_kind,
  issuer_identity,independent_verifier_identity,verifier_key_id,signing_algorithm,
  verification_method,external_event_id,document_sha256,source_reference_sha256,
  proof_reference_sha256,signed_payload_sha256,compact_jws_sha256,
  assertion_issued_at,assertion_expires_at,externally_verified_at)
 VALUES(v_evidence,CASE WHEN v_previous.id IS NULL THEN NULL ELSE v_previous.id END,
  p_receipt->>'previous_receipt_sha256',(p_receipt->>'sequence_no')::integer,
  p_receipt->>'event_kind',p_receipt->>'issuer_identity',p_receipt->>'independent_verifier_identity',
  p_receipt->>'verifier_key_id',p_receipt->>'signing_algorithm',p_receipt->>'verification_method',
  p_receipt->>'external_event_id',p_receipt->>'document_sha256',p_receipt->>'source_reference_sha256',
  p_receipt->>'proof_reference_sha256',p_receipt->>'signed_payload_sha256',
  p_receipt->>'compact_jws_sha256',to_timestamp((p_receipt->>'assertion_issued_at')::integer),
  to_timestamp((p_receipt->>'assertion_expires_at')::integer),
  to_timestamp((p_receipt->>'externally_verified_at')::integer)) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.nexa_ingest_verified_external_receipt(jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nexa_ingest_verified_external_receipt(jsonb) TO service_role;

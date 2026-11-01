\set ON_ERROR_STOP on
-- Structural contract only: these synthetic digests do not represent an
-- external signature. The mapper must remain closed after every assertion.
\ir ../../supabase/migrations/20261101010336_nexa_external_issuer_verified_receipts.sql
\ir ../../supabase/migrations/20261101010336_nexa_external_issuer_verified_receipts.sql

DO $nexa_verified_receipts$
DECLARE
 v_before jsonb;
 v_after jsonb;
 v_evidence_a private.nexa_historical_evidence%ROWTYPE;
 v_evidence_b private.nexa_historical_evidence%ROWTYPE;
 v_root uuid;
 v_root_digest text := repeat('d',64);
 v_contested uuid;
BEGIN
 SELECT * INTO v_evidence_a FROM private.nexa_historical_evidence
  WHERE entity_id='legacy-text-id-1' LIMIT 1;
 SELECT * INTO v_evidence_b FROM private.nexa_historical_evidence
  WHERE entity_id='legacy-text-id-2' LIMIT 1;
 IF v_evidence_a.id IS NULL OR v_evidence_b.id IS NULL THEN
   RAISE EXCEPTION 'synthetic evidence fixture missing';
 END IF;

 IF has_table_privilege('authenticated','private.nexa_external_issuer_verified_receipts','SELECT')
    OR has_table_privilege('anon','private.nexa_external_issuer_verified_receipts','SELECT') THEN
   RAISE EXCEPTION 'client role can read verified external receipts';
 END IF;

 SELECT jsonb_build_object(
   'consultations',(SELECT count(*) FROM public.consultation_history),
   'audit',(SELECT count(*) FROM public.audit_cases),
   'core',(SELECT count(*) FROM public.nexa_core_cases),
   'clinical_digest',(SELECT md5(string_agg(id||':'||clinical_text,'|' ORDER BY id))
                      FROM public.consultation_history))
 INTO v_before;

 BEGIN
   INSERT INTO private.nexa_external_issuer_verified_receipts(
     evidence_id,sequence_no,event_kind,issuer_identity,independent_verifier_identity,
     verifier_key_id,signing_algorithm,verification_method,external_event_id,
     document_sha256,source_reference_sha256,proof_reference_sha256,
     signed_payload_sha256,compact_jws_sha256,assertion_issued_at,
     assertion_expires_at,externally_verified_at)
   VALUES (v_evidence_a.id,1,'verified',v_evidence_a.issuer,'synthetic-verifier',
     'synthetic-key','ES256','digital_signature','synthetic-mismatch',repeat('0',64),
     repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),
     clock_timestamp(),clock_timestamp()+interval '2 minutes',clock_timestamp());
   RAISE EXCEPTION 'receipt with mismatched document hash accepted';
 EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;

 INSERT INTO private.nexa_external_issuer_verified_receipts(
   evidence_id,sequence_no,event_kind,issuer_identity,independent_verifier_identity,
   verifier_key_id,signing_algorithm,verification_method,external_event_id,
   document_sha256,source_reference_sha256,proof_reference_sha256,
   signed_payload_sha256,compact_jws_sha256,assertion_issued_at,
   assertion_expires_at,externally_verified_at)
 VALUES (v_evidence_a.id,1,'verified',v_evidence_a.issuer,'synthetic-verifier',
   'synthetic-key','ES256','digital_signature','synthetic-root',v_evidence_a.document_sha256,
   repeat('1',64),repeat('2',64),repeat('3',64),v_root_digest,
   clock_timestamp(),clock_timestamp()+interval '2 minutes',clock_timestamp())
 RETURNING id INTO v_root;

 BEGIN
   INSERT INTO private.nexa_external_issuer_verified_receipts(
     evidence_id,sequence_no,event_kind,issuer_identity,independent_verifier_identity,
     verifier_key_id,signing_algorithm,verification_method,external_event_id,
     document_sha256,source_reference_sha256,proof_reference_sha256,
     signed_payload_sha256,compact_jws_sha256,assertion_issued_at,
     assertion_expires_at,externally_verified_at)
   VALUES (v_evidence_b.id,1,'verified',v_evidence_b.issuer,'synthetic-verifier',
     'synthetic-key','ES256','digital_signature','synthetic-root',v_evidence_b.document_sha256,
     repeat('1',64),repeat('2',64),repeat('3',64),repeat('9',64),
     clock_timestamp(),clock_timestamp()+interval '2 minutes',clock_timestamp());
   RAISE EXCEPTION 'external event replay accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;

 BEGIN
   INSERT INTO private.nexa_external_issuer_verified_receipts(
     evidence_id,previous_receipt_id,previous_receipt_sha256,sequence_no,event_kind,
     issuer_identity,independent_verifier_identity,verifier_key_id,signing_algorithm,
     verification_method,external_event_id,document_sha256,source_reference_sha256,
     proof_reference_sha256,signed_payload_sha256,compact_jws_sha256,
     assertion_issued_at,assertion_expires_at,externally_verified_at)
   VALUES (v_evidence_b.id,v_root,v_root_digest,2,'contested',v_evidence_b.issuer,
     'synthetic-verifier','synthetic-key','ES256','digital_signature','synthetic-cross-chain',
     v_evidence_b.document_sha256,repeat('1',64),repeat('2',64),repeat('3',64),repeat('5',64),
     clock_timestamp(),clock_timestamp()+interval '2 minutes',clock_timestamp());
   RAISE EXCEPTION 'receipt chain crossed evidence records';
 EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;

 BEGIN
   INSERT INTO private.nexa_external_issuer_verified_receipts(
     evidence_id,previous_receipt_id,previous_receipt_sha256,sequence_no,event_kind,
     issuer_identity,independent_verifier_identity,verifier_key_id,signing_algorithm,
     verification_method,external_event_id,document_sha256,source_reference_sha256,
     proof_reference_sha256,signed_payload_sha256,compact_jws_sha256,
     assertion_issued_at,assertion_expires_at,externally_verified_at)
   VALUES (v_evidence_a.id,v_root,v_root_digest,3,'revoked',v_evidence_a.issuer,
     'synthetic-verifier','synthetic-key','ES256','digital_signature','synthetic-sequence-gap',
     v_evidence_a.document_sha256,repeat('1',64),repeat('2',64),repeat('3',64),repeat('6',64),
     clock_timestamp(),clock_timestamp()+interval '2 minutes',clock_timestamp());
   RAISE EXCEPTION 'receipt sequence gap accepted';
 EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;

 INSERT INTO private.nexa_external_issuer_verified_receipts(
   evidence_id,previous_receipt_id,previous_receipt_sha256,sequence_no,event_kind,
   issuer_identity,independent_verifier_identity,verifier_key_id,signing_algorithm,
   verification_method,external_event_id,document_sha256,source_reference_sha256,
   proof_reference_sha256,signed_payload_sha256,compact_jws_sha256,
   assertion_issued_at,assertion_expires_at,externally_verified_at)
 VALUES (v_evidence_a.id,v_root,v_root_digest,2,'contested',v_evidence_a.issuer,
   'synthetic-verifier','synthetic-key','ES256','digital_signature','synthetic-contested',
   v_evidence_a.document_sha256,repeat('1',64),repeat('2',64),repeat('3',64),repeat('7',64),
   clock_timestamp(),clock_timestamp()+interval '2 minutes',clock_timestamp())
 RETURNING id INTO v_contested;

 BEGIN
   INSERT INTO private.nexa_external_issuer_verified_receipts(
     evidence_id,previous_receipt_id,previous_receipt_sha256,sequence_no,event_kind,
     issuer_identity,independent_verifier_identity,verifier_key_id,signing_algorithm,
     verification_method,external_event_id,document_sha256,source_reference_sha256,
     proof_reference_sha256,signed_payload_sha256,compact_jws_sha256,
     assertion_issued_at,assertion_expires_at,externally_verified_at)
   VALUES (v_evidence_a.id,v_root,v_root_digest,2,'revoked',v_evidence_a.issuer,
     'synthetic-verifier','synthetic-key','ES256','digital_signature','synthetic-branch',
     v_evidence_a.document_sha256,repeat('1',64),repeat('2',64),repeat('3',64),repeat('8',64),
     clock_timestamp(),clock_timestamp()+interval '2 minutes',clock_timestamp());
   RAISE EXCEPTION 'receipt chain branch accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;

 BEGIN
   UPDATE private.nexa_external_issuer_verified_receipts
    SET external_event_id='synthetic-mutated' WHERE id=v_contested;
   RAISE EXCEPTION 'verified receipt mutation accepted';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='verified receipt mutation accepted' THEN RAISE; END IF;
   IF SQLERRM<>'historical evidence decisions are append-only' THEN RAISE; END IF;
 END;

 BEGIN
   PERFORM private.nexa_apply_verified_legacy_mapping();
   RAISE EXCEPTION 'verified receipt contract activated historical mapping';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

 SELECT jsonb_build_object(
   'consultations',(SELECT count(*) FROM public.consultation_history),
   'audit',(SELECT count(*) FROM public.audit_cases),
   'core',(SELECT count(*) FROM public.nexa_core_cases),
   'clinical_digest',(SELECT md5(string_agg(id||':'||clinical_text,'|' ORDER BY id))
                      FROM public.consultation_history))
 INTO v_after;
 IF v_before IS DISTINCT FROM v_after THEN
   RAISE EXCEPTION 'verified receipt tests changed clinical data';
 END IF;
END $nexa_verified_receipts$;

SELECT 'EXTERNAL_ISSUER_VERIFIED_RECEIPT_CONTRACT_PASS' AS result;

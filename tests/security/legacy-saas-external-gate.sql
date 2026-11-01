\set ON_ERROR_STOP on
-- Run after the structural/mapping tests, in the same disposable database.
\ir ../../supabase/migrations/20261028191521_nexa_external_issuer_activation_gate.sql
\ir ../../supabase/migrations/20261028191521_nexa_external_issuer_activation_gate.sql
DO $nexa_external_gate$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_evidence private.nexa_historical_evidence%ROWTYPE;
  v_event uuid;
BEGIN
 SELECT * INTO v_evidence FROM private.nexa_historical_evidence
   WHERE entity_id='legacy-text-id-1' LIMIT 1;
 IF has_function_privilege('authenticated','private.nexa_apply_verified_legacy_mapping()','EXECUTE')
    OR has_function_privilege('anon','private.nexa_apply_verified_legacy_mapping()','EXECUTE') THEN
   RAISE EXCEPTION 'client role can invoke historical backfill';
 END IF;
 SELECT jsonb_build_object('consultations',(SELECT count(*) FROM public.consultation_history),
   'audit',(SELECT count(*) FROM public.audit_cases),'core',(SELECT count(*) FROM public.nexa_core_cases),
   'clinical_digest',(SELECT md5(string_agg(id||':'||clinical_text,'|' ORDER BY id)) FROM public.consultation_history))
 INTO v_before;
 BEGIN
   PERFORM private.nexa_apply_verified_legacy_mapping();
   RAISE EXCEPTION 'untrusted administrative ledger released mapping';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
   INSERT INTO private.nexa_external_issuer_proof_events(
     evidence_id,event_kind,claimed_issuer_identity,document_sha256,method,source_reference,proof_reference,recorded_by)
   VALUES (v_evidence.id,'submitted',v_evidence.issuer,repeat('0',64),'institutional_registry',
           'synthetic-source','synthetic-proof',v_evidence.verified_by);
   RAISE EXCEPTION 'mismatched document hash accepted';
 EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
 BEGIN
   INSERT INTO private.nexa_external_issuer_proof_events(
     evidence_id,event_kind,claimed_issuer_identity,document_sha256,method,source_reference,proof_reference,recorded_by)
   VALUES (v_evidence.id,'submitted','wrong-issuer',v_evidence.document_sha256,
           'institutional_registry','synthetic-source','synthetic-proof',v_evidence.verified_by);
   RAISE EXCEPTION 'mismatched issuer identity accepted';
 EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
 INSERT INTO private.nexa_external_issuer_proof_events(
   evidence_id,event_kind,claimed_issuer_identity,document_sha256,method,source_reference,proof_reference,recorded_by)
 VALUES (v_evidence.id,'submitted',v_evidence.issuer,v_evidence.document_sha256,
         'institutional_registry','synthetic-source','synthetic-proof',v_evidence.verified_by)
 RETURNING id INTO v_event;
 INSERT INTO private.nexa_external_issuer_proof_events(
   evidence_id,previous_event_id,event_kind,claimed_issuer_identity,document_sha256,method,
   source_reference,proof_reference,recorded_by)
 VALUES (v_evidence.id,v_event,'contested',v_evidence.issuer,v_evidence.document_sha256,
         'institutional_registry','synthetic-source','synthetic-proof',v_evidence.verified_by);
 BEGIN
   UPDATE private.nexa_external_issuer_proof_events SET proof_reference='changed' WHERE id=v_event;
   RAISE EXCEPTION 'append-only proof event mutated';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='append-only proof event mutated' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM private.nexa_apply_verified_legacy_mapping();
   RAISE EXCEPTION 'pending proof events released mapping';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 SELECT jsonb_build_object('consultations',(SELECT count(*) FROM public.consultation_history),
   'audit',(SELECT count(*) FROM public.audit_cases),'core',(SELECT count(*) FROM public.nexa_core_cases),
   'clinical_digest',(SELECT md5(string_agg(id||':'||clinical_text,'|' ORDER BY id)) FROM public.consultation_history))
 INTO v_after;
 IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'external proof gate changed clinical data'; END IF;
END $nexa_external_gate$;
SELECT 'EXTERNAL_ISSUER_ACTIVATION_GATE_PASS' AS result;

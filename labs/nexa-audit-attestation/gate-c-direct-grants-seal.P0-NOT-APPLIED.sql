-- NEXA Gate C — LAB ONLY. NOT APPLIED. Not a production migration.
-- This intentionally DENIES direct access; it does NOT implement mediation.
-- Run only after separate authorization, on reviewed synthetic schema, with
-- a dedicated restricted installer that owns these disposable LAB objects.
-- Never apply to hosted Supabase or an existing non-disposable cluster.
BEGIN;
DO $guard$
DECLARE
  t text;
  f text;
BEGIN
  IF current_database() !~ '^nexa_gate_c_lab_[a-z0-9_]+$'
     OR inet_server_addr() IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='STOP_NOT_UNIX_SOCKET_LAB';
  END IF;
  IF current_user <> 'nexa_gc_install_lab'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname=current_user AND NOT rolsuper AND NOT rolbypassrls
         AND NOT rolcreaterole AND NOT rolcreatedb
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='STOP_RESTRICTED_INSTALLER_NOT_PROVEN';
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'private.nexa_gate_c_consent_evidence_lab',
    'private.nexa_gate_c_review_evidence_lab',
    'private.nexa_gate_c_checkpoint_lab',
    'private.nexa_gate_c_audit_binding_lab',
    'private.nexa_gate_c_verified_source_events_lab'
  ] LOOP
    IF pg_catalog.to_regclass(t) IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42P01', MESSAGE='STOP_LAB_TABLE_MISSING';
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.nexa_gate_c_checkpoint_candidate(uuid,uuid,bigint)',
    'public.nexa_gate_c_commit_candidate(uuid,uuid,text,jsonb,jsonb)',
    'public.nexa_gate_c_materialize_verified_evidence_lab(uuid,uuid)'
  ] LOOP
    IF pg_catalog.to_regprocedure(f) IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42883', MESSAGE='STOP_LAB_RPC_MISSING';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_catalog.pg_roles
      WHERE rolname IN ('anon','authenticated','service_role')) <> 3 THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='STOP_LAB_ROLES_MISSING';
  END IF;
END $guard$;

-- Original #165 candidate grants direct SELECT/INSERT/EXECUTE to service_role.
-- Remove those rights on NEW LAB objects only; do not modify original files.
REVOKE ALL ON TABLE
 private.nexa_gate_c_consent_evidence_lab,
 private.nexa_gate_c_review_evidence_lab,
 private.nexa_gate_c_checkpoint_lab,
 private.nexa_gate_c_audit_binding_lab,
 private.nexa_gate_c_verified_source_events_lab
 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
 public.nexa_gate_c_checkpoint_candidate(uuid,uuid,bigint),
 public.nexa_gate_c_commit_candidate(uuid,uuid,text,jsonb,jsonb),
 public.nexa_gate_c_materialize_verified_evidence_lab(uuid,uuid)
 FROM PUBLIC, anon, authenticated, service_role;

DO $verify$
DECLARE
  role_rec record;
  t text;
  f text;
  owner_oid oid;
BEGIN
  FOR role_rec IN SELECT oid,rolname,rolsuper,rolbypassrls
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon','authenticated','service_role')
  LOOP
    IF role_rec.rolsuper OR role_rec.rolbypassrls THEN
      RAISE EXCEPTION USING ERRCODE='42501',
        MESSAGE='STOP_EFFECTIVE_BYPASS_ROLE';
    END IF;
    FOREACH t IN ARRAY ARRAY[
      'private.nexa_gate_c_consent_evidence_lab',
      'private.nexa_gate_c_review_evidence_lab',
      'private.nexa_gate_c_checkpoint_lab',
      'private.nexa_gate_c_audit_binding_lab',
      'private.nexa_gate_c_verified_source_events_lab'
    ] LOOP
      SELECT relowner INTO owner_oid FROM pg_catalog.pg_class
        WHERE oid=t::pg_catalog.regclass;
      IF owner_oid=role_rec.oid OR
         pg_catalog.pg_has_role(role_rec.oid,owner_oid,'MEMBER') OR
         pg_catalog.has_table_privilege(role_rec.oid,
           t::pg_catalog.regclass,
           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      THEN
        RAISE EXCEPTION USING ERRCODE='42501',
          MESSAGE='STOP_EFFECTIVE_LAB_TABLE_ACCESS';
      END IF;
    END LOOP;
    FOREACH f IN ARRAY ARRAY[
      'public.nexa_gate_c_checkpoint_candidate(uuid,uuid,bigint)',
      'public.nexa_gate_c_commit_candidate(uuid,uuid,text,jsonb,jsonb)',
      'public.nexa_gate_c_materialize_verified_evidence_lab(uuid,uuid)'
    ] LOOP
      IF pg_catalog.has_function_privilege(role_rec.oid,
        f::pg_catalog.regprocedure,'EXECUTE') THEN
        RAISE EXCEPTION USING ERRCODE='42501',
          MESSAGE='STOP_EFFECTIVE_LAB_RPC_EXECUTE';
      END IF;
    END LOOP;
  END LOOP;
END $verify$;
COMMIT;

-- This file is NOT a positive Gate C test. No mediator rights are granted.
-- C01-C10 and N01-N09 remain NOT_RUN. No consent/ACK/AI authorization.

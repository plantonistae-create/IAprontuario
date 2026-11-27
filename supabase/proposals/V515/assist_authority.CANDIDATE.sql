-- NEXA V5.15 CANDIDATE — NOT APPLIED. NEVER RUN AGAINST HOSTED SUPABASE WITHOUT A SEPARATE, SPECIFIC AUTHORIZATION.
-- Supabase adaptation of the V5.14 LAB issuer: identity = auth.uid() (the verified JWT of the caller), clinical access = public.profiles + private.clinical_slots
-- (table/column names are taken from the Gate C candidate SQL of PR #165 and are UNVERIFIED against the hosted schema: verify before any use).
-- Evidence != authorization. A physician declaration is stored as immutable EVIDENCE (digest only); the grant is a separate server decision for purpose 'assistance'
-- (or 'clinical_backup'). Audit, training, Core export and any other purpose have NO issuance path. Wrappers are SECURITY DEFINER with a fixed search_path,
-- executable only by `authenticated`; the tables are in a non-exposed schema with RLS enabled and no policy (deny by default).
BEGIN;
CREATE SCHEMA IF NOT EXISTS nexa_assist;
-- V5.20 ACL HARDENING: hosted `public` carries default privileges that grant broad rights on NEW objects to anon/authenticated/service_role, so nothing here
-- relies on defaults. (1) revoke from EVERY API role by name (service_role has BYPASSRLS and is NOT covered by `PUBLIC`); (2) neutralise future defaults inside
-- nexa_assist; (3) revoke explicitly on each new object; (4) a fail-closed verification block aborts the whole transaction if any API role still has a right.
REVOKE ALL ON SCHEMA nexa_assist FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA nexa_assist REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA nexa_assist REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA nexa_assist REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE nexa_assist.attestations (
  attestation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  statement_digest text NOT NULL CHECK (statement_digest ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (owner_id, encounter_id, statement_digest)
);
CREATE TABLE nexa_assist.grants (
  grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('assistance','clinical_backup')),
  attestation_id uuid NOT NULL REFERENCES nexa_assist.attestations,
  policy_version text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz, revoked_by text, revoked_reason text CHECK (char_length(revoked_reason) <= 200),
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '24 hours')
);
CREATE INDEX nexa_assist_grants_lookup ON nexa_assist.grants (owner_id, encounter_id, purpose);
CREATE TABLE nexa_assist.events (
  event_id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT statement_timestamp(),
  actor uuid, encounter_id uuid, kind text NOT NULL, purpose text, outcome text NOT NULL
);
ALTER TABLE nexa_assist.attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexa_assist.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexa_assist.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA nexa_assist FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA nexa_assist FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION nexa_assist.deny_change() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog AS $$ BEGIN RAISE EXCEPTION 'ASSIST_RECORD_IMMUTABLE'; END $$;
CREATE TRIGGER attestations_immutable BEFORE UPDATE OR DELETE ON nexa_assist.attestations FOR EACH ROW EXECUTE FUNCTION nexa_assist.deny_change();
CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE ON nexa_assist.events FOR EACH ROW EXECUTE FUNCTION nexa_assist.deny_change();
CREATE FUNCTION nexa_assist.grants_guard() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ASSIST_RECORD_IMMUTABLE'; END IF;
  IF (NEW.grant_id,NEW.owner_id,NEW.encounter_id,NEW.purpose,NEW.attestation_id,NEW.policy_version,NEW.issued_at,NEW.expires_at)
     IS DISTINCT FROM (OLD.grant_id,OLD.owner_id,OLD.encounter_id,OLD.purpose,OLD.attestation_id,OLD.policy_version,OLD.issued_at,OLD.expires_at)
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN RAISE EXCEPTION 'ASSIST_RECORD_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER grants_guard BEFORE UPDATE OR DELETE ON nexa_assist.grants FOR EACH ROW EXECUTE FUNCTION nexa_assist.grants_guard();

CREATE FUNCTION nexa_assist.me() RETURNS uuid LANGUAGE plpgsql STABLE SET search_path TO pg_catalog AS $$
DECLARE u uuid := auth.uid();
BEGIN IF u IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF; RETURN u; END $$;
CREATE FUNCTION nexa_assist.active(p_owner uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path TO pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN private.clinical_slots cs ON cs.profile_id = p.id
                 WHERE p.id = p_owner AND p.access_status = 'active' AND p.clinical_access = true)
$$;
CREATE FUNCTION nexa_assist.deny(p_owner uuid, p_enc uuid, p_kind text, p_purpose text, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO pg_catalog AS $$
BEGIN
  INSERT INTO nexa_assist.events(actor,encounter_id,kind,purpose,outcome) VALUES (p_owner,p_enc,p_kind,left(p_purpose,40),'denied_'||lower(p_reason));
  RETURN jsonb_build_object('authorized',false,'reason',p_reason,'external_ai_authorized',false);   -- returned, not raised, so the denial row commits
END $$;
CREATE FUNCTION nexa_assist.live_grant(p_owner uuid, p_enc uuid, p_purpose text) RETURNS nexa_assist.grants LANGUAGE sql STABLE SET search_path TO pg_catalog AS $$
  SELECT g FROM nexa_assist.grants g WHERE g.owner_id=p_owner AND g.encounter_id=p_enc AND g.purpose=p_purpose AND g.revoked_at IS NULL
    AND g.expires_at > statement_timestamp() AND nexa_assist.active(p_owner) ORDER BY g.issued_at DESC LIMIT 1
$$;

CREATE FUNCTION public.nexa_assist_attest(p_encounter uuid, p_statement_digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $$
DECLARE me uuid := nexa_assist.me(); aid uuid;
BEGIN
  IF p_encounter IS NULL OR p_statement_digest IS NULL OR p_statement_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  IF NOT nexa_assist.active(me) THEN RETURN nexa_assist.deny(me,p_encounter,'attest',NULL,'CLINICAL_ACCESS_REQUIRED'); END IF;
  INSERT INTO nexa_assist.attestations(owner_id,encounter_id,statement_digest) VALUES (me,p_encounter,p_statement_digest) ON CONFLICT DO NOTHING;
  SELECT attestation_id INTO aid FROM nexa_assist.attestations WHERE owner_id=me AND encounter_id=p_encounter AND statement_digest=p_statement_digest;
  INSERT INTO nexa_assist.events(actor,encounter_id,kind,outcome) VALUES (me,p_encounter,'attest','recorded');
  RETURN jsonb_build_object('attestation_id',aid,'evidence_only',true,'external_ai_authorized',false);
END $$;

CREATE FUNCTION public.nexa_assist_issue(p_encounter uuid, p_purpose text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $$
DECLARE me uuid := nexa_assist.me(); g nexa_assist.grants; aid uuid;
BEGIN
  IF p_encounter IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  IF p_purpose IS NULL OR p_purpose NOT IN ('assistance','clinical_backup') THEN RETURN nexa_assist.deny(me,p_encounter,'issue',p_purpose,'PURPOSE_NOT_ISSUABLE'); END IF;
  IF NOT nexa_assist.active(me) THEN RETURN nexa_assist.deny(me,p_encounter,'issue',p_purpose,'CLINICAL_ACCESS_REQUIRED'); END IF;
  SELECT attestation_id INTO aid FROM nexa_assist.attestations WHERE owner_id=me AND encounter_id=p_encounter ORDER BY recorded_at DESC LIMIT 1;
  IF aid IS NULL THEN RETURN nexa_assist.deny(me,p_encounter,'issue',p_purpose,'ATTESTATION_REQUIRED'); END IF;
  IF p_purpose='clinical_backup' AND (nexa_assist.live_grant(me,p_encounter,'assistance')).grant_id IS NULL THEN RETURN nexa_assist.deny(me,p_encounter,'issue',p_purpose,'ASSISTANCE_GRANT_REQUIRED'); END IF;
  g := nexa_assist.live_grant(me,p_encounter,p_purpose);
  IF g.grant_id IS NULL AND EXISTS (SELECT 1 FROM nexa_assist.grants WHERE owner_id=me AND encounter_id=p_encounter AND revoked_at IS NOT NULL AND revoked_by IS DISTINCT FROM me::text) THEN
    RETURN nexa_assist.deny(me,p_encounter,'issue',p_purpose,'GRANT_REVOKED_BY_REVIEW');
  END IF;
  IF g.grant_id IS NULL THEN
    INSERT INTO nexa_assist.grants(owner_id,encounter_id,purpose,attestation_id,policy_version,expires_at)
      VALUES (me,p_encounter,p_purpose,aid,'assist-policy-v515-candidate',statement_timestamp()+interval '12 hours') RETURNING * INTO g;
    INSERT INTO nexa_assist.events(actor,encounter_id,kind,purpose,outcome) VALUES (me,p_encounter,'issue',p_purpose,'issued');
  END IF;
  RETURN jsonb_build_object('authorized',true,'grant_id',g.grant_id,'owner_id',g.owner_id,'purpose',g.purpose,'encounter_id',g.encounter_id,'expires_at',g.expires_at,'server_now',statement_timestamp(),'policy_version',g.policy_version,'external_ai_authorized',false);
END $$;

CREATE FUNCTION public.nexa_assist_verify(p_encounter uuid, p_purpose text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$
DECLARE me uuid := nexa_assist.me(); g nexa_assist.grants;
BEGIN
  IF p_purpose IS NULL OR p_purpose NOT IN ('assistance','clinical_backup') THEN RETURN jsonb_build_object('authorized',false,'reason','PURPOSE_NOT_ISSUABLE'); END IF;
  g := nexa_assist.live_grant(me,p_encounter,p_purpose);
  IF g.grant_id IS NULL THEN RETURN jsonb_build_object('authorized',false,'reason','NO_LIVE_GRANT'); END IF;
  RETURN jsonb_build_object('authorized',true,'grant_id',g.grant_id,'owner_id',g.owner_id,'purpose',g.purpose,'encounter_id',g.encounter_id,'expires_at',g.expires_at,'server_now',statement_timestamp(),'policy_version',g.policy_version);
END $$;

CREATE FUNCTION public.nexa_assist_revoke(p_grant uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $$
DECLARE me uuid := nexa_assist.me(); g nexa_assist.grants; n int;
BEGIN
  SELECT * INTO g FROM nexa_assist.grants WHERE grant_id=p_grant AND owner_id=me;
  IF g.grant_id IS NULL THEN RETURN jsonb_build_object('revoked',false,'reason','GRANT_NOT_FOUND'); END IF;
  UPDATE nexa_assist.grants SET revoked_at=statement_timestamp(), revoked_by=me::text, revoked_reason=left(coalesce(p_reason,''),200)
    WHERE owner_id=me AND encounter_id=g.encounter_id AND revoked_at IS NULL AND (grant_id=g.grant_id OR (g.purpose='assistance' AND purpose='clinical_backup'));
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO nexa_assist.events(actor,encounter_id,kind,purpose,outcome) VALUES (me,g.encounter_id,'revoke',g.purpose,'revoked_'||n);
  RETURN jsonb_build_object('revoked',n>0,'grants_revoked',n);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA nexa_assist FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.nexa_assist_attest(uuid,text), public.nexa_assist_issue(uuid,text), public.nexa_assist_verify(uuid,text), public.nexa_assist_revoke(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nexa_assist_attest(uuid,text), public.nexa_assist_issue(uuid,text), public.nexa_assist_verify(uuid,text), public.nexa_assist_revoke(uuid,text) TO authenticated;

-- Fail-closed verification (aborts the transaction => nothing is applied). Checks effective privileges, which include PUBLIC and default-privilege grants.
DO $v$
DECLARE r text; bad text := '';
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','service_role'] LOOP
    IF has_function_privilege(r,'public.nexa_assist_attest(uuid,text)','EXECUTE') OR has_function_privilege(r,'public.nexa_assist_issue(uuid,text)','EXECUTE')
       OR has_function_privilege(r,'public.nexa_assist_verify(uuid,text)','EXECUTE') OR has_function_privilege(r,'public.nexa_assist_revoke(uuid,text)','EXECUTE')
    THEN bad := bad||' EXEC:'||r; END IF;
  END LOOP;
  IF NOT (has_function_privilege('authenticated','public.nexa_assist_attest(uuid,text)','EXECUTE') AND has_function_privilege('authenticated','public.nexa_assist_issue(uuid,text)','EXECUTE')
       AND has_function_privilege('authenticated','public.nexa_assist_verify(uuid,text)','EXECUTE') AND has_function_privilege('authenticated','public.nexa_assist_revoke(uuid,text)','EXECUTE'))
  THEN bad := bad||' EXEC:authenticated-missing'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_schema_privilege(r,'nexa_assist','USAGE') OR has_schema_privilege(r,'nexa_assist','CREATE') THEN bad := bad||' SCHEMA:'||r; END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='nexa_assist' AND c.relkind IN ('r','p','v','m','S','f')
               AND (has_any_column_privilege(r,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))
    THEN bad := bad||' OBJECT:'||r; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='nexa_assist' AND has_function_privilege(r,p.oid,'EXECUTE'))
    THEN bad := bad||' NEXA_ASSIST_FN:'||r; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='nexa_assist' AND c.relkind='r' AND NOT c.relrowsecurity)
  THEN bad := bad||' RLS_OFF'; END IF;
  IF bad <> '' THEN RAISE EXCEPTION 'NEXA_ASSIST_ACL_VERIFICATION_FAILED:%', bad; END IF;
END $v$;
COMMIT;
-- ROLLBACK (NON-DESTRUCTIVE only): supabase/proposals/V533/rollback.M1.NON-DESTRUCTIVE.sql (REVOKE; keeps every attestation, grant and event). Never DROP this schema: its records are authorization evidence.

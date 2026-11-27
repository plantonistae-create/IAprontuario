-- V5.23 CANDIDATE — NOT APPLIED. Remote clinical audio backup store for the `audio-backup` Edge function (purpose 'clinical_backup'; never AI egress, never training).
-- V5.25: + session_keys (WRAPPED per-session data keys for envelope v2, immutable) and read-side wrappers (list/total) used for multi-device recovery and the admin summary.
-- Trust model: ONLY the Edge function (service_role) can reach these tables/functions. The function authenticates the physician, verifies a live server grant for
-- ('clinical_backup', encounter) under the CALLER's JWT, and then passes owner = the verified auth.uid(). No policy exists for anon/authenticated: RLS is FORCED, so a direct
-- PostgREST call by any signed-in user sees nothing and writes nothing. Chunks are stored only as AES-256-GCM envelopes (key wrapped by the managed KMS), never as audio.
-- Adapted from the lab-validated labs/nexa-audio-backup/postgres.lab.sql: per-user DB roles and the `sources` table are replaced by the server-side grant check.
-- Rollback: NON-DESTRUCTIVE (keeps every stored byte): supabase/proposals/V525/rollback.NON-DESTRUCTIVE.sql (revokes execution, disables writes). A destructive DROP is deliberately NOT the documented rollback.
BEGIN;
CREATE SCHEMA IF NOT EXISTS nexa_audio_backup;
REVOKE ALL ON SCHEMA nexa_audio_backup FROM PUBLIC;

CREATE TABLE nexa_audio_backup.chunks (
  owner_id uuid NOT NULL, encounter_id uuid NOT NULL, session_id uuid NOT NULL,
  source_version bigint NOT NULL CHECK (source_version > 0),
  sequence integer NOT NULL CHECK (sequence BETWEEN 0 AND 7200),
  envelope jsonb NOT NULL,
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  size integer NOT NULL CHECK (size BETWEEN 1 AND 33554432),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK ((envelope->>'schema' IN ('nexa-backup-v1','nexa-backup-v2') AND envelope->>'sha256' = digest AND envelope->>'size' = size::text) IS TRUE),   -- v2 = per-session data key (V5.25)
  PRIMARY KEY (owner_id, encounter_id, session_id, source_version, sequence)
);
CREATE TABLE nexa_audio_backup.manifests (
  owner_id uuid NOT NULL, encounter_id uuid NOT NULL, session_id uuid NOT NULL,
  source_version bigint NOT NULL CHECK (source_version > 0),
  mime text NOT NULL CHECK (mime ~ '^audio/(webm|mp4|ogg|wav)(;codecs=[a-z0-9.,-]{1,32})?$'),
  chunk_count integer NOT NULL CHECK (chunk_count BETWEEN 1 AND 7201),
  chunks jsonb NOT NULL CHECK (jsonb_typeof(chunks) = 'array' AND jsonb_array_length(chunks) = chunk_count),
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  committed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (owner_id, encounter_id, session_id, source_version)
);
CREATE TABLE nexa_audio_backup.session_keys (
  owner_id uuid NOT NULL, encounter_id uuid NOT NULL, session_id uuid NOT NULL, source_version bigint NOT NULL CHECK (source_version > 0),
  wrapped jsonb NOT NULL CHECK (jsonb_typeof(wrapped) = 'object' AND (wrapped ? 'keyId') AND (wrapped ? 'blob')),   -- KMS-wrapped data key ONLY; the plaintext key never reaches the database
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (owner_id, encounter_id, session_id, source_version)
);
ALTER TABLE nexa_audio_backup.chunks ENABLE ROW LEVEL SECURITY;    ALTER TABLE nexa_audio_backup.chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE nexa_audio_backup.manifests ENABLE ROW LEVEL SECURITY; ALTER TABLE nexa_audio_backup.manifests FORCE ROW LEVEL SECURITY;
ALTER TABLE nexa_audio_backup.session_keys ENABLE ROW LEVEL SECURITY; ALTER TABLE nexa_audio_backup.session_keys FORCE ROW LEVEL SECURITY;
REVOKE ALL ON nexa_audio_backup.chunks, nexa_audio_backup.manifests, nexa_audio_backup.session_keys FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nexa_audio_backup.lock_session(o uuid, e uuid, s uuid, v bigint) RETURNS void LANGUAGE sql SET search_path TO pg_catalog AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(concat_ws(':',o,e,s,v),0)) $$;
CREATE FUNCTION nexa_audio_backup.guard_chunk() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog AS $$
BEGIN
  PERFORM nexa_audio_backup.lock_session(NEW.owner_id,NEW.encounter_id,NEW.session_id,NEW.source_version);
  IF EXISTS (SELECT FROM nexa_audio_backup.manifests m WHERE (m.owner_id,m.encounter_id,m.session_id,m.source_version)=(NEW.owner_id,NEW.encounter_id,NEW.session_id,NEW.source_version)) THEN RETURN NULL; END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION nexa_audio_backup.derive_manifest() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog AS $$
DECLARE n integer; lo integer; hi integer;
BEGIN
  PERFORM nexa_audio_backup.lock_session(NEW.owner_id,NEW.encounter_id,NEW.session_id,NEW.source_version);
  SELECT count(*)::int, min(sequence), max(sequence),
         jsonb_agg(jsonb_build_object('sequence',sequence,'sha256',digest,'size',size) ORDER BY sequence),
         encode(sha256(convert_to(string_agg(sequence||':'||digest||':'||size,',' ORDER BY sequence),'UTF8')),'hex')
    INTO n,lo,hi,NEW.chunks,NEW.digest
    FROM nexa_audio_backup.chunks c WHERE (c.owner_id,c.encounter_id,c.session_id,c.source_version)=(NEW.owner_id,NEW.encounter_id,NEW.session_id,NEW.source_version);
  IF n IS NULL OR n <> NEW.chunk_count OR lo <> 0 OR hi <> n - 1 THEN RETURN NULL; END IF;   -- gaps / wrong count: no manifest
  RETURN NEW;
END $$;
CREATE TRIGGER protect_finalized_session BEFORE INSERT ON nexa_audio_backup.chunks FOR EACH ROW EXECUTE FUNCTION nexa_audio_backup.guard_chunk();
CREATE TRIGGER build_manifest_from_persisted_chunks BEFORE INSERT ON nexa_audio_backup.manifests FOR EACH ROW EXECUTE FUNCTION nexa_audio_backup.derive_manifest();
CREATE FUNCTION nexa_audio_backup.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog AS $$ BEGIN RAISE EXCEPTION 'AUDIO_BACKUP_IMMUTABLE'; END $$;
CREATE TRIGGER chunks_immutable BEFORE UPDATE OR DELETE ON nexa_audio_backup.chunks FOR EACH ROW EXECUTE FUNCTION nexa_audio_backup.immutable();
CREATE TRIGGER manifests_immutable BEFORE UPDATE OR DELETE ON nexa_audio_backup.manifests FOR EACH ROW EXECUTE FUNCTION nexa_audio_backup.immutable();
CREATE TRIGGER session_keys_immutable BEFORE UPDATE OR DELETE ON nexa_audio_backup.session_keys FOR EACH ROW EXECUTE FUNCTION nexa_audio_backup.immutable();

-- Public wrappers (PostgREST reaches only `public`). SECURITY DEFINER, fixed search_path, executable by service_role ONLY.
CREATE FUNCTION public.nexa_audio_put_chunk(p_owner uuid, p_encounter uuid, p_session uuid, p_version bigint, p_sequence integer, p_envelope jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $$
DECLARE k integer;
BEGIN
  INSERT INTO nexa_audio_backup.chunks(owner_id,encounter_id,session_id,source_version,sequence,envelope,digest,size)
  VALUES (p_owner,p_encounter,p_session,p_version,p_sequence,p_envelope,p_envelope->>'sha256',(p_envelope->>'size')::int)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS k = ROW_COUNT; RETURN k = 1;
END $$;
CREATE FUNCTION public.nexa_audio_get_chunk(p_owner uuid, p_encounter uuid, p_session uuid, p_version bigint, p_sequence integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$
  SELECT envelope FROM nexa_audio_backup.chunks WHERE (owner_id,encounter_id,session_id,source_version,sequence)=(p_owner,p_encounter,p_session,p_version,p_sequence) $$;
CREATE FUNCTION public.nexa_audio_get_manifest(p_owner uuid, p_encounter uuid, p_session uuid, p_version bigint)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$
  SELECT jsonb_build_object('mime',mime,'chunk_count',chunk_count,'chunks',chunks,'digest',digest,'committed_at',committed_at)
    FROM nexa_audio_backup.manifests WHERE (owner_id,encounter_id,session_id,source_version)=(p_owner,p_encounter,p_session,p_version) $$;
CREATE FUNCTION public.nexa_audio_finalize(p_owner uuid, p_encounter uuid, p_session uuid, p_version bigint, p_count integer, p_mime text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $$
DECLARE k integer; m jsonb;
BEGIN
  INSERT INTO nexa_audio_backup.manifests(owner_id,encounter_id,session_id,source_version,mime,chunk_count) VALUES (p_owner,p_encounter,p_session,p_version,p_mime,p_count) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS k = ROW_COUNT;
  m := public.nexa_audio_get_manifest(p_owner,p_encounter,p_session,p_version);
  IF m IS NULL THEN RAISE EXCEPTION 'BACKUP_INCOMPLETE_SESSION'; END IF;
  IF (m->>'chunk_count')::int <> p_count OR m->>'mime' <> p_mime THEN RAISE EXCEPTION 'BACKUP_MANIFEST_CONFLICT'; END IF;
  RETURN m || jsonb_build_object('duplicate', k <> 1);
END $$;
CREATE FUNCTION public.nexa_audio_put_session_key(p_owner uuid, p_encounter uuid, p_session uuid, p_version bigint, p_wrapped jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $$
DECLARE k integer;
BEGIN
  INSERT INTO nexa_audio_backup.session_keys(owner_id,encounter_id,session_id,source_version,wrapped) VALUES (p_owner,p_encounter,p_session,p_version,p_wrapped) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS k = ROW_COUNT; RETURN k = 1;
END $$;
CREATE FUNCTION public.nexa_audio_get_session_key(p_owner uuid, p_encounter uuid, p_session uuid, p_version bigint)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$
  SELECT wrapped FROM nexa_audio_backup.session_keys WHERE (owner_id,encounter_id,session_id,source_version)=(p_owner,p_encounter,p_session,p_version) $$;
-- multi-device recovery: the OWNER's finalized sessions (metadata only: no chunk, no key, no content)
CREATE FUNCTION public.nexa_audio_list_manifests(p_owner uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('encounter_id',encounter_id,'session_id',session_id,'source_version',source_version,'mime',mime,'chunk_count',chunk_count,
         'total_bytes',(SELECT coalesce(sum((c->>'size')::bigint),0) FROM jsonb_array_elements(chunks) c),'digest',digest,'committed_at',committed_at) ORDER BY committed_at DESC),'[]'::jsonb)
    FROM (SELECT * FROM nexa_audio_backup.manifests WHERE owner_id = p_owner ORDER BY committed_at DESC LIMIT 200) m $$;
REVOKE ALL ON FUNCTION nexa_audio_backup.lock_session(uuid,uuid,uuid,bigint), nexa_audio_backup.guard_chunk(), nexa_audio_backup.derive_manifest(), nexa_audio_backup.immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nexa_audio_put_chunk(uuid,uuid,uuid,bigint,integer,jsonb), public.nexa_audio_get_chunk(uuid,uuid,uuid,bigint,integer),
  public.nexa_audio_get_manifest(uuid,uuid,uuid,bigint), public.nexa_audio_finalize(uuid,uuid,uuid,bigint,integer,text),
  public.nexa_audio_put_session_key(uuid,uuid,uuid,bigint,jsonb), public.nexa_audio_get_session_key(uuid,uuid,uuid,bigint), public.nexa_audio_list_manifests(uuid) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA nexa_audio_backup TO service_role;
GRANT EXECUTE ON FUNCTION public.nexa_audio_put_chunk(uuid,uuid,uuid,bigint,integer,jsonb), public.nexa_audio_get_chunk(uuid,uuid,uuid,bigint,integer),
  public.nexa_audio_get_manifest(uuid,uuid,uuid,bigint), public.nexa_audio_finalize(uuid,uuid,uuid,bigint,integer,text),
  public.nexa_audio_put_session_key(uuid,uuid,uuid,bigint,jsonb), public.nexa_audio_get_session_key(uuid,uuid,uuid,bigint), public.nexa_audio_list_manifests(uuid) TO service_role;
COMMIT;

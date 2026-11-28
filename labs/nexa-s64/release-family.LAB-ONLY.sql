-- S6.4 REVIEW CANDIDATE. ONLY a fresh disposable S6.3 lab; no production migration.
-- Independent verifier is a trusted service with independent credentials, not a client.
-- Its direct database call is still trusted; this does not implement database Ed25519 verification.
BEGIN;
DO $$
BEGIN
 IF current_database() <> 'nexa_s63_lab' OR to_regclass('s63.deliveries') IS NULL THEN
   RAISE EXCEPTION 'S64_DISPOSABLE_LAB_REQUIRED';
 END IF;
 IF EXISTS (SELECT FROM s63.deliveries) OR EXISTS (SELECT FROM s63.dataset_groups) THEN
   RAISE EXCEPTION 'S64_FRESH_EMPTY_LAB_REQUIRED';
 END IF;
END $$;
CREATE ROLE s64_verifiers NOLOGIN NOSUPERUSER NOBYPASSRLS;
SET LOCAL ROLE s63_owner;
GRANT USAGE ON SCHEMA s63 TO s64_verifiers;
CREATE TABLE s63.release_routes (
 worker name PRIMARY KEY, verifier name NOT NULL UNIQUE CHECK(worker<>verifier)
);
-- Registry is trusted bootstrap only; a request cannot create or rename a family.
CREATE TABLE s63.dataset_registry (
 dataset text PRIMARY KEY CHECK(dataset ~ '^synthetic-[a-z0-9-]{1,40}$'),
 family uuid NOT NULL
);
CREATE TABLE s63.family_groups (
 family uuid NOT NULL, patient_group uuid NOT NULL, purpose s63.purpose NOT NULL,
 PRIMARY KEY(family,patient_group)
);
DO $$
DECLARE rel text;
BEGIN
 FOREACH rel IN ARRAY ARRAY['release_routes','dataset_registry','family_groups'] LOOP
  EXECUTE format('ALTER TABLE s63.%I ENABLE ROW LEVEL SECURITY',rel);
  EXECUTE format('ALTER TABLE s63.%I FORCE ROW LEVEL SECURITY',rel);
  EXECUTE format('CREATE POLICY lab_owner ON s63.%I TO s63_owner USING (true) WITH CHECK (true)',rel);
  EXECUTE format('REVOKE ALL ON TABLE s63.%I FROM PUBLIC,s63_workers,s63_reviewers,s63_issuers,s64_verifiers',rel);
 END LOOP;
END $$;
-- These registries cannot change after bootstrap; do not reset a family to evade a split.
CREATE FUNCTION s63.s64_registry_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'S64_REGISTRY_IMMUTABLE'; END $$;
CREATE TRIGGER s64_routes_immutable BEFORE UPDATE OR DELETE ON s63.release_routes FOR EACH ROW EXECUTE FUNCTION s63.s64_registry_immutable();
CREATE TRIGGER s64_datasets_immutable BEFORE UPDATE OR DELETE ON s63.dataset_registry FOR EACH ROW EXECUTE FUNCTION s63.s64_registry_immutable();
CREATE TRIGGER s64_family_groups_immutable BEFORE UPDATE OR DELETE ON s63.family_groups FOR EACH ROW EXECUTE FUNCTION s63.s64_registry_immutable();
-- Acquisition is still owner-bound. Only its independent mapped verifier may commit or approve ingestion.
CREATE OR REPLACE FUNCTION s63.commit_delivery(request uuid,gid uuid,revision integer,expected_head s63.digest,
  snapshot s63.digest,key_id s63.digest,derivative_set s63.digest,artifact s63.digest,n integer,proof_expires timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r s63.requests; m s63.materials; g s63.grants; entry_count integer; expected s63.digest; family_id uuid;
BEGIN
  SELECT * INTO r FROM s63.requests WHERE id=request;
  SELECT * INTO m FROM s63.materials WHERE (owner_id,encounter_id)=(r.owner_id,r.encounter_id)
    AND EXISTS (SELECT 1 FROM s63.release_routes rr WHERE rr.worker=s63.materials.worker AND rr.verifier=session_user) FOR UPDATE;
  IF NOT FOUND OR m.head<>r.head OR r.head IS DISTINCT FROM expected_head OR proof_expires IS NULL OR NOT isfinite(proof_expires) OR proof_expires<=clock_timestamp() OR proof_expires>clock_timestamp()+interval '15 seconds' THEN RETURN false; END IF;
  IF NOT ((r.task='asr' AND r.modality='text') OR (r.task<>'asr' AND r.modality='structured')) THEN RETURN false; END IF;
  SELECT * INTO g FROM s63.live_grant(r,clock_timestamp());
  IF (g.id,g.revision) IS DISTINCT FROM (gid,revision) THEN RETURN false; END IF;
  PERFORM 1 FROM s63.signing_keys WHERE id=key_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT count(*),s63.sha(string_agg(d.source_digest||':'||d.digest,',' ORDER BY x.seq)) INTO entry_count,expected
    FROM s63.derivations d JOIN s63.records x ON (x.owner_id,x.encounter_id,x.record_digest)=(r.owner_id,r.encounter_id,d.source_digest)
    WHERE d.request_id=r.id AND s63.task_for(x.kind)=r.task AND d.reviewer<>g.issuer;
  IF entry_count<>n OR n<1 OR expected IS DISTINCT FROM derivative_set OR n<>(
    SELECT count(*) FROM s63.records x WHERE (x.owner_id,x.encounter_id)=(r.owner_id,r.encounter_id) AND s63.task_for(x.kind)=r.task
  ) THEN RETURN false; END IF;

  SELECT d.family INTO family_id FROM s63.dataset_registry d WHERE d.dataset=r.dataset;
  IF family_id IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(family_id::text||'|'||m.patient_group::text,0));
  IF EXISTS (SELECT 1 FROM s63.family_groups WHERE family=family_id AND patient_group=m.patient_group AND purpose<>r.purpose)
     OR EXISTS (SELECT 1 FROM s63.deliveries d WHERE d.request_id=request)
     OR proof_expires<=clock_timestamp() OR g.expires_at<=clock_timestamp() THEN RETURN false; END IF;
  INSERT INTO s63.family_groups VALUES(family_id,m.patient_group,r.purpose) ON CONFLICT DO NOTHING;
  INSERT INTO s63.deliveries(request_id,grant_id,grant_revision,snapshot_digest,proof_key,derivatives_digest,artifact_digest,rows)
    VALUES(request,g.id,g.revision,snapshot,key_id,derivative_set,artifact,n);
  INSERT INTO s63.delivery_events(request_id,action) VALUES(request,'delivered');
  RETURN true;
END
$$;
CREATE OR REPLACE FUNCTION s63.approve_ingestion(request uuid,artifact s63.digest) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r s63.requests; m s63.materials; g s63.grants; key_id s63.digest;
BEGIN
  SELECT * INTO r FROM s63.requests WHERE id=request;
  SELECT * INTO m FROM s63.materials WHERE (owner_id,encounter_id)=(r.owner_id,r.encounter_id)
    AND EXISTS (SELECT 1 FROM s63.release_routes rr WHERE rr.worker=s63.materials.worker AND rr.verifier=session_user) FOR UPDATE;
  IF NOT FOUND OR m.head<>r.head THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM s63.dataset_registry d JOIN s63.family_groups fg ON fg.family=d.family WHERE d.dataset=r.dataset AND fg.patient_group=m.patient_group AND fg.purpose=r.purpose) THEN RETURN false; END IF;
  SELECT * INTO g FROM s63.live_grant(r,clock_timestamp());
  SELECT d.proof_key INTO key_id FROM s63.deliveries d WHERE d.request_id=request AND d.artifact_digest=artifact
    AND d.blocked_at IS NULL AND (d.grant_id,d.grant_revision)=(g.id,g.revision);
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM s63.signing_keys WHERE id=key_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND OR g.expires_at<=clock_timestamp() THEN RETURN false; END IF;
  INSERT INTO s63.delivery_events(request_id,action) VALUES(request,'ingestion_approved');
  RETURN true;
END
$$;
REVOKE EXECUTE ON FUNCTION s63.commit_delivery(uuid,uuid,integer,s63.digest,s63.digest,s63.digest,s63.digest,s63.digest,integer,timestamptz),
 s63.approve_ingestion(uuid,s63.digest) FROM PUBLIC,s63_workers,s63_reviewers,s63_issuers;
GRANT EXECUTE ON FUNCTION s63.commit_delivery(uuid,uuid,integer,s63.digest,s63.digest,s63.digest,s63.digest,s63.digest,integer,timestamptz),
 s63.approve_ingestion(uuid,s63.digest) TO s64_verifiers;
-- No grant on acquire to verifier; the service verifies signed acquisition proof through its isolated interface.
-- Do not hand verifier credentials to acquisition worker. No proof of physical isolation in this candidate.
COMMIT;

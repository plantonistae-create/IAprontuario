-- Synthetic isolated PostgreSQL only. No hosted RPC, M1–M4 changes or grants to API roles.
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'nexa_s63_lab' THEN
    RAISE EXCEPTION 'S63_DISPOSABLE_DATABASE_REQUIRED';
  END IF;
END
$$;
CREATE ROLE s63_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE s63_workers NOLOGIN;
CREATE ROLE s63_reviewers NOLOGIN;
CREATE ROLE s63_issuers NOLOGIN;
CREATE SCHEMA s63 AUTHORIZATION s63_owner;
SET LOCAL ROLE s63_owner;
REVOKE ALL ON SCHEMA s63 FROM PUBLIC;
GRANT USAGE ON SCHEMA s63 TO s63_workers,s63_reviewers,s63_issuers;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE DOMAIN s63.digest AS text CHECK (VALUE ~ '^[0-9a-f]{64}$');
CREATE TYPE s63.task AS ENUM ('asr','documentation','radar');
CREATE TYPE s63.purpose AS ENUM ('evaluation','training');
CREATE TYPE s63.modality AS ENUM ('text','structured','audio');

CREATE TABLE s63.materials (
  owner_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  patient_group uuid NOT NULL,
  worker name NOT NULL,
  classification text NOT NULL DEFAULT 'synthetic' CHECK (classification = 'synthetic'),
  head s63.digest NOT NULL DEFAULT repeat('0',64),
  records integer NOT NULL DEFAULT 0 CHECK (records BETWEEN 0 AND 256),
  PRIMARY KEY (owner_id,encounter_id)
);
CREATE TABLE s63.records (
  owner_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  seq integer NOT NULL CHECK (seq BETWEEN 1 AND 256),
  kind text NOT NULL CHECK (kind IN ('transcript_final','transcript_corrected','clinical_fields','physician_edit','radar')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536),
  payload_digest s63.digest NOT NULL,
  parent_digest s63.digest NOT NULL,
  record_digest s63.digest NOT NULL,
  PRIMARY KEY (owner_id,encounter_id,seq),
  UNIQUE (owner_id,encounter_id,record_digest),
  FOREIGN KEY (owner_id,encounter_id) REFERENCES s63.materials
);
CREATE TABLE s63.requests (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  head s63.digest NOT NULL,
  task s63.task NOT NULL,
  purpose s63.purpose NOT NULL,
  modality s63.modality NOT NULL,
  policy text NOT NULL CHECK (policy='s63-synthetic-v1'),
  dataset text NOT NULL CHECK (dataset ~ '^synthetic-[a-z0-9-]{1,40}$'),
  FOREIGN KEY (owner_id,encounter_id) REFERENCES s63.materials
);
CREATE TABLE s63.approvals (
  request_id uuid PRIMARY KEY REFERENCES s63.requests,
  reviewer name NOT NULL,
  basis text NOT NULL CHECK (basis ~ '^fixture:[a-z0-9-]{1,64}$'),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (isfinite(starts_at) AND isfinite(expires_at) AND expires_at > starts_at),
  UNIQUE (request_id,reviewer)
);
CREATE TABLE s63.grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES s63.approvals,
  owner_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  head s63.digest NOT NULL,
  task s63.task NOT NULL,
  purpose s63.purpose NOT NULL,
  modality s63.modality NOT NULL,
  policy text NOT NULL,
  basis text NOT NULL,
  issuer name NOT NULL,
  reviewer name NOT NULL CHECK (reviewer <> issuer),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  revoked_at timestamptz,
  UNIQUE (owner_id,encounter_id,head,task,purpose,modality,policy)
);
CREATE TABLE s63.grant_events (
  grant_id uuid NOT NULL REFERENCES s63.grants,
  revision integer NOT NULL,
  action text NOT NULL CHECK (action IN ('granted','revoked')),
  actor name NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (grant_id,revision)
);
CREATE TABLE s63.derivations (
  request_id uuid NOT NULL REFERENCES s63.requests,
  source_digest s63.digest NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=8192),
  digest s63.digest NOT NULL,
  transformation text NOT NULL CHECK (transformation='s63-deid-fixture-v1'),
  reviewer name NOT NULL,
  PRIMARY KEY (request_id,source_digest)
);
CREATE TABLE s63.dataset_groups (
  dataset text NOT NULL,
  patient_group uuid NOT NULL,
  purpose s63.purpose NOT NULL,
  PRIMARY KEY (dataset,patient_group)
);
CREATE TABLE s63.signing_keys (
  id s63.digest PRIMARY KEY,
  revoked_at timestamptz
);
CREATE TABLE s63.deliveries (
  request_id uuid PRIMARY KEY REFERENCES s63.requests,
  grant_id uuid NOT NULL REFERENCES s63.grants,
  grant_revision integer NOT NULL,
  snapshot_digest s63.digest NOT NULL,
  proof_key s63.digest NOT NULL REFERENCES s63.signing_keys,
  derivatives_digest s63.digest NOT NULL,
  artifact_digest s63.digest NOT NULL,
  rows integer NOT NULL CHECK (rows > 0),
  delivered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  blocked_at timestamptz
);
CREATE TABLE s63.delivery_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES s63.deliveries,
  action text NOT NULL CHECK (action IN ('delivered','blocked','ingestion_approved')),
  actor name NOT NULL DEFAULT session_user,
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- The NOLOGIN owner mediates access only through the functions below.
DO $$
DECLARE rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['materials','records','requests','approvals','grants','grant_events',
                             'derivations','dataset_groups','signing_keys','deliveries','delivery_events'] LOOP
    EXECUTE format('ALTER TABLE s63.%I ENABLE ROW LEVEL SECURITY',rel);
    EXECUTE format('ALTER TABLE s63.%I FORCE ROW LEVEL SECURITY',rel);
    EXECUTE format('CREATE POLICY lab_owner ON s63.%I TO s63_owner USING (true) WITH CHECK (true)',rel);
  END LOOP;
END
$$;
CREATE FUNCTION s63.sha(value text) RETURNS s63.digest
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT encode(sha256(convert_to(value,'UTF8')),'hex')::s63.digest
$$;

-- Only the lab bootstrap uses this fixture function. Its lock matches the rights/decision lock.
CREATE FUNCTION s63.append_fixture(o uuid,e uuid,k text,p jsonb) RETURNS s63.digest
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE m s63.materials; pd s63.digest; rd s63.digest;
BEGIN
  SELECT * INTO STRICT m FROM s63.materials WHERE (owner_id,encounter_id)=(o,e) FOR UPDATE;
  pd := s63.sha(p::text);
  rd := s63.sha(concat_ws('|',o,e,m.records+1,k,pd,m.head));
  INSERT INTO s63.records VALUES(o,e,m.records+1,k,p,pd,m.head,rd);
  UPDATE s63.materials SET (head,records)=(rd,m.records+1) WHERE (owner_id,encounter_id)=(o,e);
  RETURN rd;
END
$$;

CREATE FUNCTION s63.task_for(k text) RETURNS s63.task LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE WHEN k IN ('transcript_final','transcript_corrected') THEN 'asr'::s63.task
              WHEN k IN ('clinical_fields','physician_edit') THEN 'documentation'::s63.task
              WHEN k='radar' THEN 'radar'::s63.task END
$$;
CREATE FUNCTION s63.live_grant(r s63.requests, instant timestamptz) RETURNS s63.grants
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT g FROM s63.grants g
   WHERE (g.owner_id,g.encounter_id,g.head,g.task,g.purpose,g.modality,g.policy)
       = (r.owner_id,r.encounter_id,r.head,r.task,r.purpose,r.modality,r.policy)
     AND g.revoked_at IS NULL AND g.starts_at<=instant AND g.expires_at>instant
$$;

CREATE FUNCTION s63.approve_right(id uuid,basis text,starts timestamptz,expires timestamptz) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO s63.approvals VALUES(id,session_user,basis,starts,expires)
$$;
CREATE FUNCTION s63.issue_right(request uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r s63.requests; a s63.approvals; gid uuid; actual_head s63.digest;
BEGIN
  SELECT * INTO STRICT r FROM s63.requests WHERE id=request;
  SELECT head INTO STRICT actual_head FROM s63.materials
    WHERE (owner_id,encounter_id)=(r.owner_id,r.encounter_id) FOR UPDATE;
  SELECT * INTO a FROM s63.approvals WHERE request_id=request;
  IF r.head<>actual_head OR a.reviewer IS NULL OR a.reviewer=session_user OR a.expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'S63_RIGHT_REVIEW_REQUIRED';
  END IF;
  INSERT INTO s63.grants(approval_id,owner_id,encounter_id,head,task,purpose,modality,policy,basis,issuer,reviewer,starts_at,expires_at)
    VALUES(request,r.owner_id,r.encounter_id,r.head,r.task,r.purpose,r.modality,r.policy,a.basis,session_user,a.reviewer,a.starts_at,a.expires_at)
    RETURNING id INTO gid;
  INSERT INTO s63.grant_events(grant_id,revision,action,actor) VALUES(gid,1,'granted',session_user);
  RETURN gid;
END
$$;

CREATE FUNCTION s63.revoke_right(grant_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g s63.grants;
BEGIN
  SELECT * INTO STRICT g FROM s63.grants WHERE id=grant_id;
  PERFORM 1 FROM s63.materials WHERE (owner_id,encounter_id)=(g.owner_id,g.encounter_id) FOR UPDATE;
  UPDATE s63.grants SET revoked_at=clock_timestamp(),revision=revision+1 WHERE id=grant_id AND revoked_at IS NULL
    RETURNING * INTO g;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO s63.grant_events(grant_id,revision,action,actor) VALUES(g.id,g.revision,'revoked',session_user);
  WITH blocked AS (
    UPDATE s63.deliveries d SET blocked_at=g.revoked_at WHERE d.grant_id=g.id AND d.blocked_at IS NULL RETURNING d.request_id
  ) INSERT INTO s63.delivery_events(request_id,action) SELECT request_id,'blocked' FROM blocked;
  RETURN g.revision;
END
$$;

CREATE FUNCTION s63.review_derivative(request uuid,source s63.digest,derived jsonb) RETURNS s63.digest
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r s63.requests; m s63.materials; rd s63.records; h s63.digest;
BEGIN
  SELECT * INTO STRICT r FROM s63.requests WHERE id=request;
  SELECT * INTO STRICT m FROM s63.materials WHERE (owner_id,encounter_id)=(r.owner_id,r.encounter_id) FOR UPDATE;
  SELECT * INTO rd FROM s63.records WHERE (owner_id,encounter_id,record_digest)=(r.owner_id,r.encounter_id,source);
  IF rd.seq IS NULL OR r.head<>m.head OR s63.task_for(rd.kind)<>r.task OR r.modality='audio' THEN
    RAISE EXCEPTION 'S63_DERIVATIVE_SCOPE';
  END IF;
  h := s63.sha(derived::text);
  INSERT INTO s63.derivations VALUES(request,source,derived,h,'s63-deid-fixture-v1',session_user);
  RETURN h;
END
$$;

-- One STABLE statement: rights, head and all rows use the same MVCC snapshot.
CREATE FUNCTION s63.acquire(request uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object(
    'request',to_jsonb(r),'classification',m.classification,'head',m.head,'count',m.records,
    'grant',jsonb_build_object('id',g.id,'revision',g.revision,'issuer',g.issuer,'reviewer',g.reviewer),
    'records',(SELECT jsonb_agg(jsonb_build_object(
      'seq',x.seq,'kind',x.kind,'payload_canonical',x.payload::text,'payload_digest',x.payload_digest,
      'parent_digest',x.parent_digest,'record_digest',x.record_digest) ORDER BY x.seq)
      FROM s63.records x WHERE (x.owner_id,x.encounter_id)=(r.owner_id,r.encounter_id)),
    'derivatives',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'source_digest',d.source_digest,'payload_canonical',d.payload::text,'digest',d.digest,
      'transformation',d.transformation,'reviewer',d.reviewer) ORDER BY x.seq),'[]'::jsonb)
      FROM s63.derivations d JOIN s63.records x ON (x.owner_id,x.encounter_id,x.record_digest)=(r.owner_id,r.encounter_id,d.source_digest)
      WHERE d.request_id=r.id)
  )
  FROM s63.requests r JOIN s63.materials m USING(owner_id,encounter_id)
  CROSS JOIN LATERAL s63.live_grant(r,statement_timestamp()) g
  WHERE r.id=request AND m.worker=session_user AND m.head=r.head AND m.records>0
    AND g.id IS NOT NULL
    AND ((r.task='asr' AND r.modality='text') OR (r.task<>'asr' AND r.modality='structured'))
$$;

CREATE FUNCTION s63.commit_delivery(request uuid,gid uuid,revision integer,expected_head s63.digest,
  snapshot s63.digest,key_id s63.digest,derivative_set s63.digest,artifact s63.digest,n integer,proof_expires timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r s63.requests; m s63.materials; g s63.grants; entry_count integer; expected s63.digest;
BEGIN
  SELECT * INTO r FROM s63.requests WHERE id=request;
  SELECT * INTO m FROM s63.materials WHERE (owner_id,encounter_id)=(r.owner_id,r.encounter_id)
    AND worker=session_user FOR UPDATE;
  IF NOT FOUND OR m.head<>r.head OR r.head<>expected_head OR proof_expires<=clock_timestamp() THEN RETURN false; END IF;
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

  PERFORM pg_advisory_xact_lock(hashtextextended(r.dataset||'|'||m.patient_group::text,0));
  IF EXISTS (SELECT 1 FROM s63.dataset_groups WHERE dataset=r.dataset AND patient_group=m.patient_group AND purpose<>r.purpose)
     OR EXISTS (SELECT 1 FROM s63.deliveries d WHERE d.request_id=request)
     OR proof_expires<=clock_timestamp() OR g.expires_at<=clock_timestamp() THEN RETURN false; END IF;
  INSERT INTO s63.dataset_groups VALUES(r.dataset,m.patient_group,r.purpose) ON CONFLICT DO NOTHING;
  INSERT INTO s63.deliveries(request_id,grant_id,grant_revision,snapshot_digest,proof_key,derivatives_digest,artifact_digest,rows)
    VALUES(request,g.id,g.revision,snapshot,key_id,derivative_set,artifact,n);
  INSERT INTO s63.delivery_events(request_id,action) VALUES(request,'delivered');
  RETURN true;
END
$$;
CREATE FUNCTION s63.approve_ingestion(request uuid,artifact s63.digest) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r s63.requests; m s63.materials; g s63.grants; key_id s63.digest;
BEGIN
  SELECT * INTO r FROM s63.requests WHERE id=request;
  SELECT * INTO m FROM s63.materials WHERE (owner_id,encounter_id)=(r.owner_id,r.encounter_id)
    AND worker=session_user FOR UPDATE;
  IF NOT FOUND OR m.head<>r.head THEN RETURN false; END IF;
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

GRANT EXECUTE ON FUNCTION s63.acquire(uuid),
 s63.commit_delivery(uuid,uuid,integer,s63.digest,s63.digest,s63.digest,s63.digest,s63.digest,integer,timestamptz),
 s63.approve_ingestion(uuid,s63.digest) TO s63_workers;
GRANT EXECUTE ON FUNCTION s63.approve_right(uuid,text,timestamptz,timestamptz),
 s63.review_derivative(uuid,s63.digest,jsonb) TO s63_reviewers;
GRANT EXECUTE ON FUNCTION s63.issue_right(uuid),s63.revoke_right(uuid) TO s63_issuers;
COMMIT;

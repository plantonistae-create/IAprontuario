-- NEXA V4.59: CANDIDATE ONLY. NEVER APPLY TO HOSTED DB WITHOUT NEW APPROVAL.
-- The historical text PK id and encounter UUID values remain unchanged.
-- This transaction is designed for a disposable PostgreSQL 16 lab first.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.consultation_history IN ACCESS EXCLUSIVE MODE;

DO $preflight$
DECLARE
  pk_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO pk_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.consultation_history'::regclass AND contype = 'p';

  IF pk_definition NOT IN ('PRIMARY KEY (id)', 'PRIMARY KEY (user_id, id)')
     OR pk_definition IS NULL THEN
    RAISE EXCEPTION 'V459_STOP_UNKNOWN_PRIMARY_KEY';
  END IF;
  IF EXISTS (SELECT 1 FROM public.consultation_history WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'V459_STOP_NULL_OWNER_REQUIRES_SEPARATE_ADJUDICATION';
  END IF;
  IF EXISTS (SELECT 1 FROM public.consultation_history
             GROUP BY user_id, id HAVING count(*) > 1) OR
     EXISTS (SELECT 1 FROM public.consultation_history
             GROUP BY user_id, encounter_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'V459_STOP_OWNER_SCOPED_DUPLICATES';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
             WHERE contype = 'f' AND confrelid = 'public.consultation_history'::regclass) THEN
    RAISE EXCEPTION 'V459_STOP_UNREVIEWED_FOREIGN_KEY';
  END IF;
  IF to_regclass('public.audit_log') IS NULL OR
     NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                 WHERE attrelid = 'public.audit_log'::regclass
                   AND attname = 'user_id' AND NOT attisdropped) OR
     NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                 WHERE attrelid = 'public.audit_log'::regclass
                   AND attname = 'consultation_id' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'V459_STOP_AUDIT_LOG_CONTRACT_UNVERIFIED';
  END IF;
  -- A unique audit index keyed only by consultation_id would recreate an
  -- existence oracle when two owners use the same id. Fail closed.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_index x
    WHERE x.indrelid = 'public.audit_log'::regclass AND x.indisunique
      AND pg_get_indexdef(x.indexrelid) ~ E'\\mconsultation_id\\M'
      AND pg_get_indexdef(x.indexrelid) !~ E'\\muser_id\\M'
  ) THEN
    RAISE EXCEPTION 'V459_STOP_AUDIT_LOG_GLOBAL_UNIQUENESS';
  END IF;
  IF pk_definition = 'PRIMARY KEY (id)' AND
     to_regclass('public.consultation_history_encounter_id_uidx') IS NULL THEN
    RAISE EXCEPTION 'V459_STOP_ORIGINAL_ENCOUNTER_INDEX_MISSING';
  END IF;
  IF to_regclass('public.consultation_history_owner_encounter_uidx') IS NOT NULL AND
     pg_get_indexdef(to_regclass('public.consultation_history_owner_encounter_uidx'))
       NOT LIKE '%(user_id, encounter_id)%' THEN
    RAISE EXCEPTION 'V459_STOP_INDEX_NAME_COLLISION';
  END IF;
END;
$preflight$;

-- Preserve values; change ONLY the uniqueness scope. RLS/policies/grants/JWT
-- and the audit + sync_version triggers remain exactly as deployed.
ALTER TABLE public.consultation_history ALTER COLUMN user_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS consultation_history_owner_encounter_uidx
  ON public.consultation_history (user_id, encounter_id);
DO $pk$
DECLARE pk_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO pk_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.consultation_history'::regclass AND contype = 'p';
  IF pk_definition = 'PRIMARY KEY (id)' THEN
    ALTER TABLE public.consultation_history DROP CONSTRAINT consultation_history_pkey;
    ALTER TABLE public.consultation_history
      ADD CONSTRAINT consultation_history_pkey PRIMARY KEY (user_id, id);
  ELSIF pk_definition <> 'PRIMARY KEY (user_id, id)' OR pk_definition IS NULL THEN
    RAISE EXCEPTION 'V459_STOP_PRIMARY_KEY_CHANGED_DURING_TRANSACTION';
  END IF;
END;
$pk$;
DROP INDEX IF EXISTS public.consultation_history_encounter_id_uidx;

DO $postcheck$
BEGIN
  -- No other UNIQUE index may continue enforcing cross-owner identity.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_index x
    WHERE x.indrelid = 'public.consultation_history'::regclass
      AND x.indisunique
      AND pg_get_indexdef(x.indexrelid) !~ E'\\muser_id\\M'
  ) THEN
    RAISE EXCEPTION 'V459_STOP_GLOBAL_UNIQUE_REMAINING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.consultation_history'::regclass AND contype='p'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (user_id, id)'
  ) OR to_regclass('public.consultation_history_encounter_id_uidx') IS NOT NULL OR
     to_regclass('public.consultation_history_owner_encounter_uidx') IS NULL OR
     pg_get_indexdef(to_regclass('public.consultation_history_owner_encounter_uidx'))
       NOT LIKE '%(user_id, encounter_id)%' THEN
    RAISE EXCEPTION 'V459_STOP_POSTCHECK_FAILED';
  END IF;
END;
$postcheck$;
COMMIT;

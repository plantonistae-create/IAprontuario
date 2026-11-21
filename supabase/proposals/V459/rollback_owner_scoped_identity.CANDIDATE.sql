-- NEXA V4.59: CANDIDATE ROLLBACK ONLY. Requires separate authorization.
-- If any two owners now share an id or encounter_id, restoring global
-- uniqueness is impossible without deleting/rekeying data: STOP, never delete.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.consultation_history IN ACCESS EXCLUSIVE MODE;
DO $preflight$
DECLARE pk_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO pk_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.consultation_history'::regclass AND contype = 'p';
  IF pk_definition NOT IN ('PRIMARY KEY (id)', 'PRIMARY KEY (user_id, id)')
     OR pk_definition IS NULL THEN
    RAISE EXCEPTION 'V459_ROLLBACK_UNKNOWN_PRIMARY_KEY';
  END IF;
  IF EXISTS (SELECT 1 FROM public.consultation_history
             GROUP BY id HAVING count(*) > 1) OR
     EXISTS (SELECT 1 FROM public.consultation_history
             GROUP BY encounter_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'V459_ROLLBACK_BLOCKED_GLOBAL_DUPLICATES';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
             WHERE contype='f' AND confrelid='public.consultation_history'::regclass) THEN
    RAISE EXCEPTION 'V459_ROLLBACK_UNREVIEWED_FOREIGN_KEY';
  END IF;
END;
$preflight$;
CREATE UNIQUE INDEX IF NOT EXISTS consultation_history_encounter_id_uidx
  ON public.consultation_history (encounter_id);
DO $pk$
DECLARE pk_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO pk_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid='public.consultation_history'::regclass AND contype='p';
  IF pk_definition = 'PRIMARY KEY (user_id, id)' THEN
    ALTER TABLE public.consultation_history DROP CONSTRAINT consultation_history_pkey;
    ALTER TABLE public.consultation_history
      ADD CONSTRAINT consultation_history_pkey PRIMARY KEY (id);
  ELSIF pk_definition <> 'PRIMARY KEY (id)' OR pk_definition IS NULL THEN
    RAISE EXCEPTION 'V459_ROLLBACK_PRIMARY_KEY_CHANGED';
  END IF;
END;
$pk$;
DROP INDEX IF EXISTS public.consultation_history_owner_encounter_uidx;
-- user_id remains NOT NULL intentionally. No user rows are changed.
COMMIT;

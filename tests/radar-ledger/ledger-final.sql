BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $test$ BEGIN
  IF (SELECT count(*) FROM public.nexa_radar_question_events)<>502
     OR (SELECT max(sequence) FROM public.nexa_radar_question_events)<>502
     OR (SELECT count(DISTINCT sequence) FROM public.nexa_radar_question_events)<>502
     OR (SELECT count(*) FROM public.nexa_radar_question_events WHERE sequence BETWEEN 1 AND 200)<>200
     OR (SELECT count(*) FROM public.nexa_radar_question_events WHERE sequence BETWEEN 201 AND 400)<>200
     OR (SELECT count(*) FROM public.nexa_radar_question_events WHERE sequence BETWEEN 401 AND 502)<>102
  THEN RAISE EXCEPTION 'Concurrent events, sequence or pagination mismatch'; END IF;
  BEGIN
    UPDATE public.nexa_radar_question_events SET current_status='dismissed' WHERE sequence=1;
    RAISE EXCEPTION 'Retroactive update unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.nexa_radar_question_events WHERE sequence=1;
    RAISE EXCEPTION 'Event deletion unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
COMMIT;

DO $test$ BEGIN
  IF has_table_privilege('authenticated','public.nexa_radar_question_events','INSERT')
     OR has_table_privilege('authenticated','public.nexa_radar_question_events','UPDATE')
     OR has_table_privilege('authenticated','public.nexa_radar_question_events','DELETE')
     OR has_table_privilege('anon','public.nexa_radar_question_events','SELECT')
     OR has_function_privilege('anon',
        'public.append_nexa_radar_question_event(uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,uuid,text,integer)',
        'EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.nexa_radar_question_events'::regclass
                    AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'Ledger grants or RLS are unsafe'; END IF;
END $test$;

UPDATE public.organization_memberships SET status='revoked'
  WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $test$ BEGIN
  IF (SELECT count(*) FROM public.nexa_radar_question_events)<>0
  THEN RAISE EXCEPTION 'Revoked owner still reads ledger'; END IF;
  BEGIN
    PERFORM public.append_nexa_radar_question_event(
      '00000000-0000-4000-8000-000000000603','synthetic-radar-encounter',
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'q_revoked','dyspnea','appeared',NULL,'to_ask',NULL,'high',
      'engine_recalculation','engine','radar-temporal-v1',NULL,NULL,1);
    RAISE EXCEPTION 'Revoked owner still writes ledger';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
COMMIT;

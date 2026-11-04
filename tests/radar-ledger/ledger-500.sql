BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $test$
DECLARE n integer; eid uuid; result bigint;
BEGIN
  IF auth.uid() <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid THEN
    RAISE EXCEPTION 'Local actor context absent';
  END IF;
  FOR n IN 1..500 LOOP
    eid := ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
    result:=public.append_nexa_radar_question_event(
      eid,'synthetic-radar-encounter','11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      CASE WHEN n=498 OR n=500 THEN 'q_1' WHEN n=499 THEN 'q_2' ELSE 'q_'||n END,
      'dyspnea',CASE WHEN n=498 THEN 'removed' WHEN n=499 THEN 'manual_answer'
        WHEN n=500 THEN 'reopened' ELSE 'appeared' END,
      CASE WHEN n>=498 THEN 'to_ask' ELSE NULL END,
      CASE WHEN n=498 THEN NULL WHEN n=499 THEN 'clarified' ELSE 'to_ask' END,
      CASE WHEN n>=498 THEN 'moderate' ELSE NULL END,
      CASE WHEN n=498 THEN NULL ELSE 'moderate' END,
      CASE WHEN n=498 THEN 'no_longer_suggested' WHEN n=499 THEN 'clinician_answer'
        WHEN n=500 THEN 'manual_reopen' ELSE 'engine_recalculation' END,
      CASE WHEN n>=499 THEN 'human' ELSE 'engine' END,
      'radar-temporal-v1',NULL,NULL,1);
    IF result<>n THEN RAISE EXCEPTION 'Sequence mismatch at %: %',n,result; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.nexa_radar_question_events)<>500
     OR (SELECT count(DISTINCT sequence) FROM public.nexa_radar_question_events)<>500
     OR (SELECT count(*) FROM public.nexa_radar_question_events WHERE sequence BETWEEN 1 AND 200)<>200
     OR (SELECT count(*) FROM public.nexa_radar_question_events WHERE sequence BETWEEN 201 AND 400)<>200
     OR (SELECT count(*) FROM public.nexa_radar_question_events WHERE sequence BETWEEN 401 AND 500)<>100
  THEN RAISE EXCEPTION 'Page, count or uniqueness mismatch'; END IF;
  result:=public.append_nexa_radar_question_event(
    '00000000-0000-4000-8000-000000000500','synthetic-radar-encounter',
    '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
    'q_1','dyspnea','reopened','to_ask','to_ask','moderate','moderate',
    'manual_reopen','human','radar-temporal-v1',NULL,NULL,1);
  IF result<>500 OR (SELECT count(*) FROM public.nexa_radar_question_events)<>500
  THEN RAISE EXCEPTION 'Idempotent replay failed'; END IF;
  BEGIN
    PERFORM public.append_nexa_radar_question_event(
      '00000000-0000-4000-8000-000000000500','synthetic-radar-encounter',
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'q_1','chest_pain','reopened','to_ask','to_ask','moderate','moderate',
      'manual_reopen','human','radar-temporal-v1',NULL,NULL,1);
    RAISE EXCEPTION 'Changed replay unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF (SELECT current_status FROM public.nexa_radar_question_events
      WHERE question_id='q_1' ORDER BY sequence DESC LIMIT 1)<>'to_ask'
     OR (SELECT current_status FROM public.nexa_radar_question_events
      WHERE question_id='q_2' ORDER BY sequence DESC LIMIT 1)<>'clarified'
  THEN RAISE EXCEPTION 'Manual reconstruction failed'; END IF;
END $test$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
DO $test$ BEGIN
  IF (SELECT count(*) FROM public.nexa_radar_question_events)<>0
  THEN RAISE EXCEPTION 'Foreign organization read'; END IF;
  BEGIN
    PERFORM public.append_nexa_radar_question_event(
      '00000000-0000-4000-8000-000000000601','synthetic-radar-encounter',
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'q_foreign','dyspnea','appeared',NULL,'to_ask',NULL,'high',
      'engine_recalculation','engine','radar-temporal-v1',NULL,NULL,1);
    RAISE EXCEPTION 'Foreign organization write';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
DO $test$ BEGIN
  IF (SELECT count(*) FROM public.nexa_radar_question_events)<>500
  THEN RAISE EXCEPTION 'Authorized reviewer cannot read full chronology'; END IF;
  BEGIN
    PERFORM public.append_nexa_radar_question_event(
      '00000000-0000-4000-8000-000000000602','synthetic-radar-encounter',
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'q_review','dyspnea','appeared',NULL,'to_ask',NULL,'high',
      'engine_recalculation','engine','radar-temporal-v1',NULL,NULL,1);
    RAISE EXCEPTION 'Reviewer unexpectedly wrote clinical event';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
DO $test$ BEGIN
  IF (SELECT count(*) FROM public.nexa_radar_question_events)<>0
  THEN RAISE EXCEPTION 'Unrelated active account read ledger'; END IF;
END $test$;
COMMIT;

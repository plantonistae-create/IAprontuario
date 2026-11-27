-- S6.2 synthetic proof only. No DDL, DML, clinical tables, or actual exports.
-- Runs using the installed M2 digest helpers, with all rows created by VALUES/CTEs.
BEGIN READ ONLY;
WITH RECURSIVE scope AS (
 SELECT '11111111-1111-4111-8111-111111111111'::uuid o,
        '22222222-2222-4222-8222-222222222222'::uuid e,
        '33333333-3333-4333-8333-333333333333'::uuid other
), fixture(seq,kind,payload) AS (
 VALUES (1::bigint,'transcript_final','{"text":"Sintetico S6.2","measure":1.00}'::jsonb),
        (2::bigint,'provenance','{"provider":"synthetic","model":"fixture","model_version":"1","pipeline_version":"1"}'::jsonb)
), chain(seq,kind,payload,payload_digest,parent_digest,record_digest) AS (
 SELECT f.seq,f.kind,f.payload,nexa_capture.sha(f.payload::text),repeat('0',64),
        nexa_capture.rec_digest(s.o,s.e,f.seq,f.kind,nexa_capture.sha(f.payload::text),repeat('0',64))
 FROM fixture f CROSS JOIN scope s WHERE f.seq=1
 UNION ALL
 SELECT f.seq,f.kind,f.payload,nexa_capture.sha(f.payload::text),c.record_digest,
        nexa_capture.rec_digest(s.o,s.e,f.seq,f.kind,nexa_capture.sha(f.payload::text),c.record_digest)
 FROM chain c JOIN fixture f ON f.seq=c.seq+1 CROSS JOIN scope s
), cases(name,want) AS (
 VALUES ('valid',true),('wrong_owner',false),('wrong_encounter',false),
 ('payload_tampered',false),('parent_tampered',false),('missing_row',false),
 ('empty',false),('forged_head',false),('forged_count',false)
), inputs AS (
 SELECT x.name,c.seq,c.kind,
  CASE WHEN x.name='payload_tampered' AND c.seq=1 THEN '{"text":"alterado"}'::jsonb ELSE c.payload END payload,
  c.payload_digest,CASE WHEN x.name='parent_tampered' AND c.seq=2 THEN repeat('0',64) ELSE c.parent_digest END parent_digest,
  c.record_digest,CASE WHEN x.name='wrong_owner' THEN s.other ELSE s.o END o,
  CASE WHEN x.name='wrong_encounter' THEN s.other ELSE s.e END e
 FROM cases x CROSS JOIN chain c CROSS JOIN scope s
 WHERE x.name<>'empty' AND NOT(x.name='missing_row' AND c.seq=1)
), ordered AS (
 SELECT *,row_number() OVER(PARTITION BY name ORDER BY seq) expected_seq,
 lag(record_digest,1,repeat('0',64)) OVER(PARTITION BY name ORDER BY seq) expected_parent
 FROM inputs
), checked AS (
 SELECT name,count(*) n,(array_agg(record_digest ORDER BY seq DESC))[1] head,
 bool_and(seq=expected_seq AND parent_digest=expected_parent AND payload_digest=nexa_capture.sha(payload::text)
 AND record_digest=nexa_capture.rec_digest(o,e,seq,kind,payload_digest,parent_digest)) intact
 FROM ordered GROUP BY name
), result AS (
 SELECT x.name,x.want,coalesce(c.n>0 AND c.intact
 AND c.n=CASE WHEN x.name='forged_count' THEN 3 ELSE 2 END
 AND c.head=CASE WHEN x.name='forged_head' THEN repeat('f',64) ELSE (SELECT record_digest FROM chain WHERE seq=2) END,false) got
 FROM cases x LEFT JOIN checked c USING(name)
)
SELECT name,want,got,(want=got) AS pass FROM result
UNION ALL SELECT 'canonical_numeric_scale',true,
 (SELECT payload::text LIKE '%1.00%' AND payload_digest=nexa_capture.sha(payload::text) FROM chain WHERE seq=1),
 (SELECT payload::text LIKE '%1.00%' AND payload_digest=nexa_capture.sha(payload::text) FROM chain WHERE seq=1)
ORDER BY name;
COMMIT;

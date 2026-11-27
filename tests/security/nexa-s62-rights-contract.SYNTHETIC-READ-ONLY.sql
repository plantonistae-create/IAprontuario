-- S6.2 synthetic rights decision contract, NOT an authority or production migration.
-- No real grants, profiles, patients, or database writes. All values are synthetic.
BEGIN READ ONLY;
WITH context AS (
 SELECT 'owner-a'::text o,'enc-a'::text e,'head-a'::text h,
        '2026-11-27 12:00:00+00'::timestamptz now_at,2::int current_revision
), cases(name,want,owner_id,encounter_id,snapshot_head,task,purpose,revision,approved,revoked,not_yet_valid,expired,deidentified,reviewed,source_permitted,proof_verified,release_rechecked) AS (
 VALUES
 ('evaluation_allowed',true,'owner-a','enc-a','head-a','asr','evaluation',2,true,false,false,false,true,false,true,true,true),
 ('training_allowed',true,'owner-a','enc-a','head-a','asr','training',2,true,false,false,false,true,true,true,true,true),
 ('wrong_owner',false,'owner-b','enc-a','head-a','asr','evaluation',2,true,false,false,false,true,true,true,true,true),
 ('wrong_encounter',false,'owner-a','enc-b','head-a','asr','evaluation',2,true,false,false,false,true,true,true,true,true),
 ('wrong_head',false,'owner-a','enc-a','head-b','asr','evaluation',2,true,false,false,false,true,true,true,true,true),
 ('wrong_task',false,'owner-a','enc-a','head-a','radar','training',2,true,false,false,false,true,true,true,true,true),
 ('unapproved_pair',false,'owner-a','enc-a','head-a','documentation','training',2,true,false,false,false,true,true,true,true,true),
 ('revoked',false,'owner-a','enc-a','head-a','asr','evaluation',2,true,true,false,false,true,true,true,true,true),
 ('stale_revision',false,'owner-a','enc-a','head-a','asr','evaluation',1,true,false,false,false,true,true,true,true,true),
 ('future_authorization',false,'owner-a','enc-a','head-a','asr','evaluation',2,true,false,true,false,true,true,true,true,true),
 ('expired',false,'owner-a','enc-a','head-a','asr','evaluation',2,true,false,false,true,true,true,true,true,true),
 ('no_approval',false,'owner-a','enc-a','head-a','asr','evaluation',2,false,false,false,false,true,true,true,true,true),
 ('no_deidentification',false,'owner-a','enc-a','head-a','asr','evaluation',2,true,false,false,false,false,true,true,true,true),
 ('no_training_review',false,'owner-a','enc-a','head-a','asr','training',2,true,false,false,false,true,false,true,true,true),
 ('source_not_permitted',false,'owner-a','enc-a','head-a','asr','training',2,true,false,false,false,true,true,false,true,true),
 ('unverified_proof',false,'owner-a','enc-a','head-a','asr','evaluation',2,true,false,false,false,true,true,true,false,true),
 ('no_release_recheck',false,'owner-a','enc-a','head-a','asr','evaluation',2,true,false,false,false,true,true,true,true,false),
 ('documentation_eval_allowed',true,'owner-a','enc-a','head-a','documentation','evaluation',2,true,false,false,false,true,false,true,true,true)
), approved_pairs(task,purpose) AS (
 VALUES ('asr','evaluation'),('asr','training'),('documentation','evaluation')
), decision AS (
 SELECT c.name,c.want,coalesce(c.owner_id=x.o AND c.encounter_id=x.e AND c.snapshot_head=x.h
 AND c.revision=x.current_revision AND c.approved AND NOT c.revoked
 AND (CASE WHEN c.not_yet_valid THEN x.now_at+interval '1 second' ELSE x.now_at-interval '1 day' END)<=x.now_at
 AND (CASE WHEN c.expired THEN x.now_at ELSE x.now_at+interval '1 day' END)>x.now_at
 AND c.deidentified AND c.source_permitted AND c.proof_verified AND c.release_rechecked
 AND EXISTS(SELECT 1 FROM approved_pairs a WHERE a.task=c.task AND a.purpose=c.purpose)
 AND (c.purpose<>'training' OR c.reviewed),false) got
 FROM cases c CROSS JOIN context x
)
SELECT name,want,got,(want=got) AS pass FROM decision ORDER BY name;
COMMIT;

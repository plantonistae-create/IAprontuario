-- Safe recovery: disable new browser transcript writes without deleting
-- existing clinical transcripts. Turn OFF NEXA_TRANSCRIPT_PROVENANCE_RESPONSE
-- in Edge Function runtime first.
BEGIN;
REVOKE INSERT ON TABLE public.encounter_transcript_versions FROM authenticated;
COMMIT;
-- Never DROP this table in an automated rollback: it may contain clinical text.

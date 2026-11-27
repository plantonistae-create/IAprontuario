# NEXA V5.33 — Server rollout runbook (NOTHING IN THIS FILE HAS BEEN EXECUTED)

Base: `main` c4caef5b56e9b442673975acac69779beae2f953 (PR #188 merged; frontend, `sw.js`, `nexa-ui-v3.js` byte-identical to 0eabf172; `vaultPilot.enabled=false`, `remotePreservation=false`, `assistAuthority=false`, `audioRetention.enabled=false`).
Gate C: NO-GO 0/19. Physical iPhone/Android PASS: NOT_RUN. Pilot dormant. The nine legacy anon-executable RPCs are hardened separately; this runbook revokes nothing.

## Files and full SHA-256 (all on `main` unless marked)
| Step | File | sha256 |
|---|---|---|
| M1 | supabase/proposals/V515/assist_authority.CANDIDATE.sql | 9404f31418f233e3b34d188627fa0fd8faffa7969205cbc278ce4b7ecc5a55a3 |
| M2 | supabase/proposals/V523/capture.CANDIDATE.sql | e56d25af023a17871f7a70b263aff19e19e939c1a38155e37b7de54eac90a4c6 |
| M3 | supabase/proposals/V523/audio_backup.CANDIDATE.sql | 850c85dcbd4ec158737267bf2b3999ef154b8b91e7b7372aece10e307073ff41 |
| M4 | supabase/proposals/V525/admin_preservation.CANDIDATE.sql | e9a610fd75e51a5ba47a694017835ee603dba322c4fa6685734148baedc32843 |
| re-enable | supabase/proposals/V525/reenable.sql | bcd22757652a3dfbd2c5f356e9219d362ed8d9787e6dafef817c14f2b89015aa |
| rollback | supabase/proposals/V525/rollback.NON-DESTRUCTIVE.sql | 80e8b127cd8a4104e1f78a14b750e7082fdf23978890d2451af791ef1c23ff00 |
| verify (pre/post every step, read-only) | supabase/ops/V533/sql/post-apply-verify.V527.READ-ONLY.sql | 52a0e34611bc074737fbe55afe6635ac4139080701911d8ddf08a101322a82de |
| RPC inspection (done, ref.) | supabase/ops/V533/sql/anon-rpc-definitions.V531.READ-ONLY.sql | 32d7724fc798e4bb0849fdf6daf8e7c1272695ae269a83d6ab210b51060669e5 |
Verify with `shasum -a 256 <file>` against `main` before pasting anything into the SQL editor. A mismatch aborts the whole sequence.

## Per-step protocol (applies to M1→M2→M3→M4)
1. PRE: run the verify SQL (read-only). Expected: baseline of 14 pre-existing SECURITY DEFINER hashes unchanged (the nine reviewed RPCs match the V526 MD5s), objects of this step `NOT-APPLIED`, previous steps `PASS`, `P99 PASS`. Any FAIL → STOP.
2. APPLY: paste the step file unchanged (it is one `BEGIN…COMMIT` with an internal fail-closed block). SQL error → transaction rolled back, STOP.
3. POST: run the verify SQL again. Expected: this step's rows `PASS` (ACL, RLS/FORCE RLS, schema usage), baseline unchanged, no new anon-executable SECURITY DEFINER. Any FAIL → run `rollback.NON-DESTRUCTIVE.sql` block for the step (REVOKE only; no data dropped), STOP, report.
4. Checkpoint: paste PRE and POST outputs to the operator before the next step.

## Edge deploy (after M1–M3, `NEXA_AUDIO_BACKUP` unset = OFF)
Functions changed in this package: `process-consultation`, `realtime-call`, `realtime-radar`, `consultation-speakers` (CORS now accepts `x-nexa-encounter-id`; new assist gate, default `off` = no behavior change) and new `audio-backup` (503 `AUDIO_BACKUP_DISABLED` unless `NEXA_AUDIO_BACKUP=enabled`).
Deploy only these five, from main c4caef5. Do not set `NEXA_ASSIST_GATE`, `NEXA_ASSIST_APPROVED_PROVIDERS`, `NEXA_AUDIO_BACKUP`. Checkpoint E1: OPTIONS on each function returns the new allow-header; unauthenticated POST on `audio-backup` returns 503/401, never 200; a normal consultation from the published app still works (no flag change). Rollback: redeploy previous function versions (kept by operator before deploy; record version ids at E0).

## AWS (prepare only; provisioning needs its own authorization)
Region sa-east-1. One symmetric KMS key (no alias; adapter pins the full ARN), automatic rotation on (anual; +US$1/mo for the 1st and 2nd rotation), one IAM user `nexa-edge-kms`, no console access, one access key, policy `aws/iam-policy.nexa-edge-kms.json` (kms:Encrypt/kms:Decrypt on the key ARN only, with required `nexa_aad_sha256` encryption context), key policy `aws/kms-key-policy.json`, budget `aws/budget.json` (US$10/month, KMS only; alert at 80%). Rotate the access key every 90 days; plan to replace it with temporary credentials (AssumeRoleWithWebIdentity or Roles Anywhere) once an OIDC issuer is proven — the adapter already accepts a session token.
Edge secrets (names only): `NEXA_KMS_PROVIDER=aws`, `NEXA_AWS_REGION=sa-east-1`, `NEXA_AWS_KMS_KEY_ARN`, `NEXA_AWS_ACCESS_KEY_ID`, `NEXA_AWS_SECRET_ACCESS_KEY`, `NEXA_AUDIO_BACKUP_ENVELOPE=v2`; `NEXA_AUDIO_BACKUP=enabled` is set LAST.
Checkpoint K1: synthetic wrap/unwrap through `audio-backup` with a synthetic user and synthetic bytes; unwrap with a wrong AAD must fail (`LAB_CUSTODY_FAILED`); IAM policy simulator denies every other action; CloudTrail shows only Encrypt/Decrypt. Kill switch: unset `NEXA_AUDIO_BACKUP` (immediate 503; local vault unaffected).

## Order
S1 done (merge). S2 M1→M2→M3 (protocol above). S3 Edge deploy (E0–E1). S4 AWS + secrets + `NEXA_AUDIO_BACKUP=enabled` (K1). S5 M4. S6 smoke sintético ponta a ponta (2 aparelhos emulados + 1 real se disponível). S7 flags PR (`remotePreservation`, `assistAuthority`) only after iPhone PASS and proven remote recovery. Pilot activation and physical homologation are independent of S2–S5.
Retention: `audioRetention.enabled` stays false; 7 days proposed; purge needs freshly reconfirmed remote backup (tested), approved policy, and never the only recoverable copy. Bitrate unchanged.

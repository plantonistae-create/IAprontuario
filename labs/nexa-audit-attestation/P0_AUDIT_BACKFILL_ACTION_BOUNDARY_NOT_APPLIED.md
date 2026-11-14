# NEXA Gate C P0 — historical audit-backfill action boundary (OFFLINE, NOT APPLIED)

**Status:** candidate documentation only, not a change to the hosted Edge Function, to PostgreSQL, or to production. Issue #164; PR #167 Draft. Current Gate C **NO-GO**, C01–C10 **NOT_RUN**, local Codex N01–N09 **NOT_RUN**.

## Exact source of the independent egress

Source in Git: `supabase/functions/audit-backfill/index.ts`, blob `d35821b8bf0a191f22a3d7b09505f57ab02862d4` from the inspected PR branch. Its current `requireStaff` authenticates an active reviewer or admin, not necessarily the **physician author** of the source encounter.

| Existing action | Actual path visible in source | Required boundary |
| --- | --- | --- |
| `action=report` | `inventory()` reads `consultation_history` and `audit_cases` using `service_role`; sends an aggregate report to authenticated staff | Role-limited and privacy-limited **read-only** operation. It is **not consent** and its inventory must not authorize AI or writing |
| `action=run` | `confirmed:true` permits batch selection from `recoverable`; `coreFor` composes `physician_final` and `immutable_submission:true` from persisted fields; `deidentify` uses `executeCapability` with external OpenAI; `admin.from('audit_cases').insert()` writes using `service_role` | Must **STOP before external fetch and write** until every source has verifiable consent, physician author ACK, version/digest, owner scope and atomic idempotency, and a separately approved Gate C writer |

A clinician source row that matches `eligible(fields)` is **not** a durable review statement. `confirmed:true` is an administrative action request, not patient consent or a physician ACK. The existing deidentification occurs at the external AI provider, so the upstream prompt contains the original clinical fields: it cannot be described as *locally deidentified before egress*.

## Candidate scope: no retrofit or pseudo-authorization

- `audit-backfill.run` is independent from `submit-audit-case`, and must appear in the full pre-provider egress inventory.
- The new lab-only `audit-backfill-ingress.P0-NOT-DEPLOYED.mjs` handles `audit-backfill.report` versus `audit-backfill.run` as **server-selected** actions. The **staff actor** performing backfill and the **physician author** of each historical source are different security principals; reviewer/admin privileges cannot impersonate the clinical author or manufacture their consent.
- The proposed run request contains only routing metadata `{action:'run',expectedCount}` with count 1–25 for test scopes. The current hosted request shape `{action:'run',confirmed:true,limit}` is NOT implemented by this candidate and remains insufficient to authorize anything. `confirmed`, `fields`, `core_context`, client timestamps, `actorId`, and `tenantId` are rejected as authority.
- Each candidate historical row needs an owner/author source binding, current `sync_version`, server canonical digest `pg-jsonb-v1`, applicable policy version, evidence that no later edit undermines the reviewed snapshot, and **independently persisted** consent for `audit_deidentification`, which predates external egress and is not revoked. Distinct final physician review event must bind owner, row, `sync_version`, digest and server sync ACK.
- Source and evidence adapters are ONLY simulated in this module. In a real implementation, provenance, issuer/consumer privileges, source locks and idempotent claims must be proven in authorized isolated PostgreSQL; no mock grants rights. Historical records missing evidence are STOP: do not backfill consent/ACK from their content or metadata.
- `report` remains logically read-only and distinct from `run`. The candidate grants neither read permissions nor access to any report data; row data or patient content must not appear in a preflight response. Future privacy requirements for the report itself need dedicated review.

## What the new candidate actually returns

Even with seven-favorably-mocked properties and valid event objects, the run candidate returns `BACKFILL_RUN_PREFLIGHT_CANDIDATE_ONLY` and `externalAiAuthorized=false`, `auditSubmitAuthorized=false`, `adminWriteAuthorized=false`, `reportReadAuthorized=false`, `clinicalPayloadReleased=false`, `gateCVerified=false`, `eventDurabilityVerified=false`, `resetAuthorized=false`.

For report, `REPORT_READ_ONLY_CANDIDATE_ONLY` similarly grants no permission. Tests in `audit-backfill-ingress.P0.test.mjs` use fictitious UUIDs and no patient data. They do not call Supabase, an Edge Function or an external model, nor establish real trust.

## STOP / next authorized gates

1. Confirm historical source and physician author identity without using admin role as owner proxy.
2. Prove genuine consent for historical audit, purpose and revocation, not retroactively fabricated client timestamps.
3. Prove a final physician ACK of the exact synchronized snapshot with digest/version.
4. Prove concurrency, locking, idempotency and privileged database writer in isolated PostgreSQL **only under separate authorization**.
5. Determine any privacy/legal basis for historical case processing and external transfers before deployment.
6. Review actual hosted function drift only with authorization; Git sources are not proof of hosted code.

**No SQL, PostgreSQL session, reset locked, RLS/ACL modifications, paid IA, patient data, staging, merge/deploy or code change to any hosted function is authorized by this document.** Keep the NEXA visual identity and transcript final-only. Prescrição remains a separate repository.

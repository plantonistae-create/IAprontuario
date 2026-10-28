# NEXA 2.0 — Tenant authorization contract (staging only)

## Verified database behavior (2026-10-27)
- `admin_set_profile_access`: SECURITY DEFINER, owned by postgres, EXECUTE authenticated only; checks `profiles.is_admin` and active status, not organization membership. **Existing global-admin contract must be confirmed before changing.**
- `review_nexa_core_dataset_rights`: same global admin check; requires approved clinical audit and deidentification review but does not check tenant membership. Dataset-rights approval is separate from clinical review.
- `get_audit_queue_v2`: uses `private.can_audit_org(organization_id, auth.uid())`, which requires active staff and membership with owner/admin/reviewer role.
- The two SaaS migrations are recorded in staging; Edge Functions submit-audit-case v9 and core-dataset-export v6 are ACTIVE. This does not establish end-to-end authorization.

## Authorization decisions pending
1. Define an authoritative global platform-admin entitlement independent of user-editable metadata and institutional admin membership.
2. Preserve legacy global administrator operations until that entitlement is migrated and verified.
3. Add a **separate** institution-scoped user-management RPC, restricted to active admin/owner membership for both actor and target organization; forbid modifying global flags, cross-org users and multi-org users without explicit policy.
4. Gate dataset-rights review with explicit global dataset-governance entitlement or a separately scoped institutional permission; never infer training rights from clinical review or ordinary institutional administration.
5. Keep audit queue's existing tenant predicate unless authenticated negative tests demonstrate a bypass.

## Required synthetic tests (NOT YET RUN)
Actors: global platform admin, org-A admin, org-A physician, org-B physician/reviewer, inactive/unaffiliated user.

| Operation | Positive | Negative |
| --- | --- | --- |
| Scoped profile management | Admin A -> eligible A profile | Admin A -> B profile; global elevation; multi-org target |
| Global profile management | Authorized platform admin | Institutional admin, physician |
| Dataset rights | Explicit governance actor -> eligible approved case | Other org; reviewer without governance; revoked approval |
| Audit queue | Active reviewer sees own org | Physician/unaffiliated sees B |
| Export Edge Function | Explicitly eligible, deidentified approved case | Cross-tenant ID; unapproved case; revoked rights |

Use separate authenticated JWTs / equivalent role contexts, assert SQL/HTTP response **and unchanged database rows**, and verify legitimate operations still succeed. Never substitute postgres-role SQL for these tests. No real patient data.

## Execution status
- Completed: read-only SQL review of three priority RPC definitions and `private.can_audit_org`.
- Prepared: authorization contract and negative-test matrix.
- Not completed: authenticated test fixtures, test execution, schema corrections, staging application, production changes.
- Blockers: verify legitimate global-admin contract, inspect all callers and tenant membership schema, provision isolated synthetic identities.
- Next: implement a dedicated scoped RPC and tests against actual schema; validate on staging only; review dataset-export Edge Function.

## 2026-10-27 — Execution continuation (verified)

- **GitHub:** main remains `e9c039691122` at last inspected state. PR #92 remains Draft; no merge or production deploy.
- **Staging:** `phaitiijsjwrggdnoxiz` recorded migration `20261027125243_nexa_scoped_membership_revocation_candidate`; function exists, SECURITY DEFINER, empty search_path, EXECUTE authenticated=true, anon=false. Migration version filename reconciled.
- **Implemented:** revocation locks organization before membership row; only active owner/admin authorized, owner-only owner revocation, self/last-owner protections, idempotence, audit_log update action with correlation_id. Rollback file included.
- **Tests implemented:** `tests/security/scoped-revocation.contract.test.mjs` runs during normal npm test; `tests/security/staging-tenant-jwt.test.mjs` uses Auth user JWT sessions for cross-tenant, dataset, audit queue, positive idempotence and concurrent owner attempts; `scripts/prepare-staging-tenant-fixtures.mjs` provisions exclusively synthetic users/organizations/cases via staging Auth Admin and PostgreSQL with secrets from environment.
- **Tests executed:** SQL transaction compilation/rollback PASS; simulated authenticated role with nonexistent/unauthorized identity: revoke/admin-profile/dataset rights denied and audit queue empty; CI focused clinical/browser auth-anonymous jobs PASS at last observed. **These do not replace signed-JWT authorization tests.**
- **Blocking gap:** GitHub Actions `staging-auth-smoke` revealed empty staging login credentials and skipped its authenticated portion. This session cannot access the staging Auth Admin/service-role key or privileged DB connection needed to provision synthetic signed-JWT fixtures. Full JWT and concurrency suite **NOT RUN**, so no sign-off for production.
- **Next exact action:** Provision authorized staging-only secrets `NEXA_STAGING_SERVICE_ROLE_KEY`, `NEXA_STAGING_DB_URL`, `NEXA_STAGING_URL` and `NEXA_STAGING_PUBLISHABLE_KEY` securely in an approved test runner (never commit), run `node scripts/prepare-staging-tenant-fixtures.mjs`, pass the resulting local manifest as `NEXA_TENANT_FIXTURES_JSON`, run `npm run test:tenant-staging`, examine all positive/negative results and cleanup. Only then consider ready-for-review, staging sign-off, merge and verified production migration. Retain non-destructive rollback and production backup gate.

## 2026-10-27 — Authorized JWT runner and staging protection
- Existing `.github/workflows/nexa-ui-ci.yml` now includes `tenant-staging-real-jwt`, manually dispatched only by repository owner on the exact security branch, with GitHub environment `nexa-phase1-staging-tenant-tests`; no privileged secrets are exposed to ordinary PR jobs. An initial invalid job-context reference was corrected; routine CI resumed.
- Scripts now refuse database URLs not tied to Supabase project `phaitiijsjwrggdnoxiz`, write an incremental private manifest, and clean synthetic Auth, org, audit, profile and temporary cases in an always() step. No permanent test credentials are committed.
- Staging's five clinical access slots are occupied. JWT fixtures use only permitted active reviewer capabilities plus explicit tenant membership roles to avoid disrupting clinical users. This does **not** prove a positive path requiring `clinical_access=true`; that remains separate.
- Required GitHub environment secrets: `NEXA_STAGING_SERVICE_ROLE_KEY`, `NEXA_STAGING_DB_URL`, `NEXA_STAGING_PUBLISHABLE_KEY`. The fixture JSON is generated at runtime. Secrets availability and full JWT suite execution are **NOT VERIFIED**.
- Production release remains gated on actual JWT concurrency/authorization results, recovery checks and review. PR #92 stays Draft.
- Independent follow-on: draft PR #93 for versioned transcript storage; staging migration `20261027140151` deployed, clinical UI/server feature disabled by default.

### 2026-10-27 — Least-privilege fixture correction
- PR #92 fixture roles corrected: only `reviewerB` has global `is_reviewer`; doctors and institutional owners/admins remain non-reviewers, with `clinical_access=false` to preserve all five staging slots.
- Added explicit real-JWT suite assertions for no unintended global admin/reviewer privileges and no synthetic slot occupancy. Fixed the global-admin positive no-op test to preserve `is_reviewer=false`.
- Last implementation commit: `67ca26b6`. No privileged authenticated JWT test execution verified; PR #92 remains Draft, no merge or production RPC publication.
- PR #93 remains Draft; previous CI failed one VM cross-realm array comparison (fixed in a later commit); recent CI is pending. Transcript schema is staging-only, retention feature flag off by default.

### 2026-10-27 — Workflow #784 libpq correction
- Confirmed run 40531543669 failed because psql received a full URL as PGDATABASE and tried local socket. Replaced with PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE and SSL in both prepare and cleanup scripts; preserved project-ref checks.
- Regression guard: tests/security/staging-libpq-connection.test.mjs, executed before provisioning in workflow. Latest workflow commit 1075d3fc.
- Staging recovery: verified exactly ten synthetic Auth accounts created at 15:30 UTC by #784, ten personal orgs, ten memberships, zero consultations and zero clinical slots. Removed only those records in a guarded staging transaction. Read-back confirmed zero remaining synthetic Auth users from that run and zero qa-tenant organizations.
- Real-JWT workflow must be manually dispatched on updated PR #92 branch (Actions write dispatch unavailable in connector); normal PR CI for HEAD is running. No JWT homologation, production merge, or deploy claimed.


### 2026-10-27 — Root cause confirmed and staging migration implemented
- **Root cause:** `profiles_capability_state_check` rejected institution-scoped synthetic accounts with `access_status='active'`, `is_admin=false`, `is_reviewer=false`, `clinical_access=false`. The five clinical slots are already occupied; promoting fixtures to global reviewers/admins to satisfy the old check would invalidate the isolation tests.
- **Staging migration:** `20261027184850_nexa_active_institution_roles_without_global_capability` applied and verified. It keeps pending-account and nullability invariants while permitting active tenant-only identities. The DB grant inventory showed no direct UPDATE privilege on `public.profiles` for `authenticated`; privileged RPCs still enforce their own rights. Versioned SQL and guarded rollback added to PR #92.
- **Safe reproduction:** a rollback-only synthetic active-profile UPDATE succeeded; a deliberate pending-with-global-privilege UPDATE was rejected by the preserved check constraint.
- **Provisioning:** preflight gate now checks the migration before creating new Auth fixtures. Re-run of authenticated workflow #797 successfully provisioned synthetic users; the prior bootstrap failure is resolved.
- **Authenticated JWT results (run #797 re-run):** six of eight test cases passed, including cross-org denials, least privilege, owner concurrency and scoped revocation audit. Two positive-path tests failed because the synthetic global actor lacked a B-organization audit membership, and the older global-profile RPC refuses an active account with all capability flags false.
- **Corrections committed:** the global governance actor is granted an explicit scoped B reviewer membership **only in the synthetic fixture**; the positive global-profile test now uses a reversible disable operation and restores the original synthetic profile. These updates remain unverified by a new JWT run.
- **Orphan fixtures:** read-only staging inspection identified a separate synthetic run `4b06af3b9b` with 10 verified Auth identities, 10 personal organizations and 10 memberships, but no consultation history, audit cases or clinical slot occupancy. The protected workflow now includes exact-run preflight and Auth Admin cleanup. **Cleanup of this old run is prepared but not yet executed**, and must not be claimed complete.
- **Next mandatory gate:** manually dispatch the trusted workflow for PR #92 HEAD using the already configured GitHub Environment, verify full JWT suite and cleanup, inspect remaining fail logs if any. Do not merge/activate production until all required tests pass; PR stays Draft.


## 2026-10-28 — PR #92 verification checkpoint
- HEAD `cc6f2fa7`: isolated PostgreSQL legacy SaaS run `40682757568` PASS; NEXA UI CI run `40682757587` PASS. Revoked-source negative fixture included in PostgreSQL suite.
- Previous authenticated staging JWT run `40569456526`, commit `59864905`: `tenant-staging-real-jwt` 8 tests PASS, 0 failed, 0 skipped; synthetic fixture cleanup confirmed in job log. This is a **historical** signed-JWT result, not HEAD-level complete JWT sign-off. Full requested coverage (expiry, token revocation, evidence, exports, Edge Functions) not established.
- Read-only migration comparison: staging includes SaaS migrations `20261027112118`, `20261027112344`, `20261027125243`, `20261027140151`, `20261027184850`; production history does not include these. Reconcile against real legacy schema before applying migrations.
- Read-only production baseline: consultation_history 406, audit_cases 169, nexa_core_cases 6, profiles 3. No clinical records changed by this verification.
- Source-verification ledger still permits privileged synthetic/administrative entries; independently authenticated real issuer provenance remains unproven. A valid-looking ledger row is not independently verified proof.
- No verified production backup or isolated restoration evidence available in this checkpoint. No production migrations, merge, or deploy authorized until recovery and full security gates are demonstrably met.
- Next: re-run trusted staging JWT workflow at HEAD with authorized environment; add actual multi-session PostgreSQL concurrency tests; implement trusted external issuer proof ingestion; verify isolated production restoration.

## 2026-10-28 — Independent transaction races reproduced and corrected
- Initial PR HEAD `34d95f99`: trusted staging JWT run `40746216496` passed the existing 8/8 tests, with synthetic cleanup confirmed. Run `40747407239` at `89b1af02` passed 11/11, including anonymous access, denied foreign audit/Core reads and reuse of the original admin JWT after institutional membership revocation; cleanup confirmed. Direct table permission denial is an API isolation result, not independent proof of every RLS policy or a positive clinical flow.
- Added `tests/security/legacy-saas-concurrency.py` to the existing isolated PostgreSQL workflow. Independent connections and real transactions reproduced four missing evidence/decision/source ledger locks; a further test reproduced stale authorization under REPEATABLE READ. The unapplied candidate `20261027211000_nexa_legacy_verified_backfill.sql` now locks authorization ledgers and clinical ownership tables before validation, and requires READ COMMITTED. These are broad maintenance locks: schedule a controlled migration window; do not use this function on a request path.
- Local PostgreSQL 16.2: 10/10 cases passed, covering evidence revocation/contestation, source revocation, approver membership revocation, decision rescission versus backfill, competing ownership, two simultaneous backfills, rollback/retry, final-step failure atomicity and stale transaction snapshots. Isolated GitHub PostgreSQL run `40747645149` at `9a4d236c` passed. This does not establish a complete production-schema restoration or two concurrent institutional approval decisions.
- Expanded JWT suite to 13 cases with denied organization_id reassignment and physician Edge Function export. Run `40747637894` passed 12/13; export was blocked at Origin validation before reaching authorization. Final correction reuses the existing staging smoke origin `http://127.0.0.1:4173`, retains the strict DATASET_ADMIN_REQUIRED assertion and adds a request timeout. The final candidate requires a new trusted dispatch and verified cleanup; use the run attached to its exact SHA, not historical green runs.
- Read-only comparison reconfirmed divergent migration histories and schema contracts: production lacks organizations/memberships and tenant columns; staging has NOT NULL tenant columns and different policies/triggers. Global profile and dataset RPC definitions match; the audit queue differs and scoped revocation is staging-only. The existing additive synthetic legacy path passed; exact production schema/policy/grant compatibility remains a gate. No migration was applied to either hosted project in this cycle.
- Production read-only counts remain 406 consultations, 169 audits, 6 Core cases, 3 profiles. Supabase organization is Free; the connected tools expose no backup inventory or isolated backup restoration operation. No recovery point or production restore was demonstrated, and synthetic PostgreSQL tests are not production recovery evidence.
- External issuer verification remains unproven. Existing hash/integrity fields, independent administrative decisions and append-only source ledger are preparatory contracts, not externally authenticated issuer proof. Clinical positive paths with clinical_access=true, complete consultation/evidence/export authorization coverage and concurrent approval-decision semantics remain incomplete.
- PR #92 remains Draft; no merge or deploy. Next gates: verify exact final-SHA JWT/CI results and cleanup; complete remaining clinical/approval concurrency coverage; rehearse the additive path against an authorized isolated production schema/restoration; obtain trusted external issuer proof and demonstrate backup recovery before any production rollout.

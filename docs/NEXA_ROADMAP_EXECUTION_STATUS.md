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

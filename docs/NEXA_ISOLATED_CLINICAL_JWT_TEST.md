# PR #92 — Clinical JWT integration in a disposable local Supabase stack

Run from the repository root with Node 22 and `npm ci --ignore-scripts`:

```sh
node scripts/run-local-clinical-stack.mjs
```

The runner pins Supabase CLI 2.122.0 and starts an experimental local stack in
a new `/tmp/nexa-pr92-stack-*` project. It copies the repository Edge Function
sources into that temporary project, applies
`tests/security/isolated-clinical-local-schema.sql`, runs the target guard and
real-JWT integration suites, checks the database for zero synthetic residues,
then destroys the stack. Local macOS uses the native runtime without Docker;
Actions uses Docker. Neither mode uses a hosted Supabase account. The temporary
status JSON and fixture manifest have mode 0600. `NEXA_LOCAL_STACK_HOME` may
point to a dedicated `/tmp` directory to reuse downloaded runtime artifacts.

The runner refuses `SUPABASE_ACCESS_TOKEN` and the staging DB/service-role
variables. The target validator rejects the staging and production project
refs unconditionally, and local mode accepts only literal `127.0.0.1` URLs for
Auth, REST, Functions and PostgreSQL. It does not read `supabase/.temp/` or link
the local stack to either hosted project.

## Synthetic fixtures and coverage

Seven real Auth accounts are created with random passwords and a unique run
marker: clinical doctors A and B, a doctor without clinical access, an
institutional admin without clinical access, an authorized reviewer, a revoked
member and a user without an organization. An eighth actor is anonymous. Only
A and B receive synthetic clinical slots. Their JWTs come from real Auth
password login, and Auth verifies each token. No `auth.uid()` override or
service-role acting client is used in the integration suite.

The suite checks consultation SELECT/INSERT/UPDATE/DELETE, tenant assignment,
cross-tenant RLS, immutable `organization_id`, denials for nonclinical actors,
anonymous denial, membership revocation with the original JWT, audit-log
persistence, institution-scoped audit queue, and HTTP calls to the actual local
`core-dataset-export` Edge Function. The Edge gateway rejects missing and
invalid JWTs; the function rejects non-admin export and rechecks an admin's
changed `access_status` against the same token. An authorized admin reaches
`DATASET_EXPORT_NOT_CONFIGURED` because the disposable stack intentionally has
no export secret or approved dataset. This proves the permission gate, not a
positive training export.

The queue fixture uses the `get_audit_queue_v2`, `private.can_audit_org` and
`private.org_has_any_role` definitions observed read-only on staging on
2026-10-28. The repository's older audit migration lacks this tenant predicate.
This is an explicit contract fixture, not a claim that all staging schema or
its migration history was replayed. The consultation access, slot and
encounter and historical-evidence migrations are applied from this branch;
the tenant guard, policies and audit trigger reproduce the observed staging
definitions. The suite confirms the private evidence table exists and that
`authenticated` lacks direct SELECT privilege.

## Layer attribution and limits

| Result | Enforcing layer |
| --- | --- |
| Missing/malformed Edge JWT | Local API gateway JWT verification |
| Real Auth login and token verification | Supabase Auth |
| Direct audit/evidence table access | Data API schema/grants |
| Own or foreign consultation rows | PostgreSQL RLS plus tenant guard |
| Revoked membership with unchanged JWT | Live membership lookup in RLS |
| Audit queue membership | `private.can_audit_org` in privileged RPC |
| Dataset export denial | Edge profile check, then absent export configuration |

The private historical-evidence query is denied because `private` is not a
Data API schema; the test does not prove authenticity of an external issuer or
positive evidence access. The UI's “Baixar .txt” action exports the current
client-side note text; it is not a server-side assistential export contract, so
the JWT suite does not claim a positive assistential export. No training data
is generated. The `submit-audit-case` function, full legacy schema,
production backup/restoration and hosted Auth/Edge behavior remain separate
homologation gates. The PR must remain Draft.

If the integration process is interrupted after fixture creation, preserve
the temporary stack and run `scripts/run-local-clinical-jwt.mjs --cleanup-only`
with the same `NEXA_LOCAL_STATUS_JSON`, `NEXA_LOCAL_PSQL_BIN` and
`NEXA_LOCAL_FIXTURE_FILE`; then destroy only that named temporary stack. The
cleanup verifies Auth metadata and exact synthetic IDs before deletion.

The optional GitHub Actions workflow `nexa-clinical-local-jwt.yml` runs this
same local command with no staging or production secrets. GitHub-hosted runners
use the Docker runtime, which Supabase recommends where an engine is available;
the local macOS command keeps the native runtime. `NEXA_LOCAL_STACK_RUNTIME`
accepts only `native` or `docker` for an explicit override. A green local run is
not permission to merge, migrate or deploy.

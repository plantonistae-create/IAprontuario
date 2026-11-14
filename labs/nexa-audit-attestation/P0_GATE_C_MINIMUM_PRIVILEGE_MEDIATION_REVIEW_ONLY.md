# NEXA Gate C — P0 minimal-privilege mediation candidate (STATIC REVIEW ONLY)

**Authority:** V2.9.6 / C-LP-01. **Reference:** #165 HEAD \`994e172a1042a5fa8d9e319aa5868f5db5976ac7\`; #167 HEAD \`944e777405483e9bed3188205b3918959edce85b\`.  
**Status:** NOT DEPLOYABLE · NOT A MIGRATION · NOT AUTHORIZED FOR SQL EXECUTION · GATE C NO-GO · C01–C10 and N01–N09 NOT_RUN.

**Scope:** one technical candidate INSIDE the existing lab directory. Its code blocks are deliberately **non-executable review fragments** (not a continuous installation script). Do NOT concatenate them, apply them, bypass the local SQL STOPs, change the original lab SQL or grant these roles on hosted PostgreSQL. No evidence exists that the proposed roles are provisioned, that the local DB is clean, or that Auth.getUser() is bound to a DB session.

## 1. Existing trust gap (specific original SQL)

The two existing candidate SQL files declare the checkpoint, atomic commit and evidence materializer as **SECURITY INVOKER**. To work, the original versions grant \`service_role\` direct SELECT/INSERT on derived consent/review evidence, checkpoint and audit binding tables, plus EXECUTE on the public candidate functions. This is incompatible with the claim that *only* the materializer can produce evidence: the same caller can INSERT directly.

The local Mac working-tree variants reportedly add an unconditional STOP and remove these grants. **Their origin is NOT_PROVEN.** Neither variant may be modified or executed under this PR. Changing ownership and ACLs in a separate LAB must be authorized independently.

## 2. Proposed mutually separate LAB identities

| Proposed identity (not created here) | LOGIN? | Responsibility | Never receives |
| --- | --- | --- | --- |
| \`nexa_gc_install_lab\` | installation-only restricted login, provisioned by local operator | Transactional creation/grants on the disposable DB only | clinical API runtime, hosted credentials |
| \`nexa_gc_data_owner_lab\` | NOLOGIN, NOSUPERUSER, NOBYPASSRLS | Own **new** private evidence/checkpoint/binding tables and sealed synthetic-login map | membership to runtime roles, HTTP access |
| \`nexa_gc_mediator_owner_lab\` | NOLOGIN, NOSUPERUSER, NOBYPASSRLS | Own three tightly bounded mediation functions, NOT the underlying tables | direct login, table ownership, BYPASSRLS |
| \`nexa_gc_fixture_issuer_lab\` | separate local restricted login only after authorization | Insert explicit *synthetic* events in the private origin log | write in derived consent/review evidence, checkpoint, audit binding |
| \`nexa_gc_physician_a_lab\`, \`nexa_gc_physician_b_lab\` | separate LAB logins only after authorization | Invoke admitted, scoped checkpoint/review operations as synthetic A/B | SELECT/INSERT/UPDATE on private evidence, audit tables |
| \`nexa_gc_commit_caller_lab\` | separately authorized synthetic session | Invoke only the mediated post-AI commit *after* a validated synthetic receipt | direct INSERT/UPDATE on \`audit_cases\`, evidence or bindings |
| \`nexa_gc_reviewer_lab\` | separate synthetic login | Invoke only a specifically reviewed reviewer operation for C08 | blanket access to physicians' sources, evidence writer, submitter powers |
| \`nexa_gc_observer_lab\` | restricted login | Read aggregate counts/statuses via a sanitized observation interface | clinical payloads, event creation, locks or write |

**No runtime role may be a member of either NOLOGIN owner, of the installer, or of another runtime role with expanded rights.** Validate membership recursively, \`INHERIT\`, \`SET ROLE\`, \`CREATEROLE\`, \`BYPASSRLS\`, \`SUPERUSER\`, owner implicit rights, and schema CREATE. NOLOGIN is not a security boundary against a privileged member or a SECURITY DEFINER function.

### Synthetic identity is not patient authentication

In a **local PostgreSQL-only** test, \`session_user\` and an admin-sealed login-to-synthetic-actor mapping may distinguish independently authenticated synthetic connections. The mapped UUID is not an Auth.getUser() result and must **never** be accepted as patient consent, physician ACK or production authorization. The untrusted \`p_actor\` argument of the original invoker functions must not be exposed to an arbitrary caller. An Edge adapter in production would need a separately verified Auth.getUser() binding and a server-side admission check before the provider and again at commit. This PR does NOT provide one.

## 3. Deliberately gated mediation shape

The following **review fragment** illustrates a mediation boundary; it is NOT a deployable function and has an unconditional STOP. The synthetic login-mapping table and its administration are design dependencies, **not created** here.

\`\`\`sql
-- STATIC REVIEW FRAGMENT: NOT A MIGRATION / DO NOT EXECUTE.
-- Names and return shape follow the original Gate C checkpoint candidate.
-- Ownership must be transferred to nexa_gc_mediator_owner_lab only
-- after a separate approval and rights review.
CREATE OR REPLACE FUNCTION public.nexa_gc_mediated_checkpoint_review_only(
  p_encounter uuid, p_expected_version bigint
) RETURNS TABLE (
  receipt_id uuid, source_payload jsonb, payload_digest text, source_version bigint
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $nexa_p0$
DECLARE
  v_actor uuid;
BEGIN
  RAISE EXCEPTION 'GATE_C_NO_GO_REVIEW_ONLY'; -- unconditional, no runtime bypass

  -- UNREACHABLE REVIEW DESIGN: the mapping must be created/sealed
  -- by the isolated LAB installer; consumers must have no write access.
  SELECT m.actor_id INTO v_actor
    FROM private.nexa_gc_synthetic_login_bindings_lab AS m
   WHERE m.login_name = session_user AND m.enabled IS TRUE;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'SYNTHETIC_SESSION_NOT_AUTHENTICATED';
  END IF;

  -- Invokes original SECURITY INVOKER function *as the mediator owner*;
  -- caller does not get its underlying INSERT/SELECT privileges.
  -- RLS and permission compatibility NOT PROVEN; must STOP on errors.
  RETURN QUERY
    SELECT * FROM public.nexa_gate_c_checkpoint_candidate(
      v_actor, p_encounter, p_expected_version
    );
END;
$nexa_p0$;
\`\`\`

This fragment is deliberately insufficient to authorize external AI: even a hypothetical successful checkpoint is not a verified pre-egress consent receipt. The existing \`nexa_gate_c_materialize_verified_evidence_lab(p_actor,p_event_id)\` and \`nexa_gate_c_commit_candidate(p_actor,p_receipt,p_input_digest,p_deidentified_fields,p_deidentified_core)\` must **not** be directly granted to consumers. Separate mediators must: (a) derive actor identity from the trusted local boundary; (b) reverify source owner, clinical slot and consent/revocation; (c) validate event provenance and the exact server-synced version/digest; (d) reject all nonvalidated AI payloads; (e) execute in short transactions with the existing lock order; and (f) preserve terminal states. **The materializer and commit bridge are not implementable as trusted runtime operations from the current evidence, so no permissive wrappers are included.** Explicit STOP is safer than a mock that would appear authorized.

## 4. Minimum effective access contract (requires independent catalog proof)

| Object / operation | Mediator owner rights to examine | Consumer direct rights | Rationale / STOP |
| --- | --- | --- | --- |
| \`private\` | USAGE only, no CREATE | none | Schema USAGE != table rights |
| \`public.consultation_history\` | scoped SELECT + row-lock privileges; possible column UPDATE for FOR UPDATE only after review | none via this contract | SECURITY INVOKER needs underlying rights; owner-only/RLS still independently required |
| \`public.profiles\`, \`private.clinical_slots\` | SELECT and compatible FOR SHARE rights | none | Recheck active clinician + slot in transaction |
| \`private.nexa_gate_c_verified_source_events_lab\` | SELECT only | no INSERT/UPDATE/DELETE | Fixture issuer is isolated; events cannot be forged by consumer |
| Consent/review evidence tables | SELECT and INSERT **mediator only** | none | Materializer is sole derived-evidence producer |
| Checkpoint/binding tables | SELECT, INSERT **mediator only** | none | No direct fake receipts or rebinding |
| \`public.audit_cases\` | read/row-lock and INSERT for controlled pending case; UPDATE only if separately justified for existing reviewer contract | none | Lock order: key/advisory → audit case → source; terminal immutable |
| Original LAB functions | EXECUTE **mediator only**, after revoking broad grants | none | Original SECURITY INVOKER callable only through mediation |
| New mediated wrappers | EXECUTE per specifically approved A/B or post-AI role | EXECUTE only | Revoke PUBLIC by default in same transaction as creation |
| Reviewer interface | narrowly scoped reviewer EXECUTE | reviewer only | Do not inherit submitter or source-owner rights |
| Observer interface | metadata-only SELECT/EXECUTE | observer only | No clinical contents or direct table SELECT |

**Do not grant any generic INSERT/UPDATE/DELETE to \`service_role\` in derived-evidence tables.** An inherited or existing grant, role ownership, default PUBLIC EXECUTE, object ownership, BYPASSRLS, or membership may defeat the desired result even if explicit GRANT statements look narrow. Verify effective privileges, not merely textual ACL statements. No hosted \`service_role\` or existing global ACL may be modified in this exercise.

\`FOR SHARE\` and \`FOR UPDATE\` may need SELECT and UPDATE privileges on the respective relation/columns. **Do not grant broad UPDATE to consumer accounts just to make locks pass.** Any minimum column-level privilege granted to mediator must be separately inspected for misuse potential. The function owner must not own the data tables if owner-bypass of RLS would defeat required owner-only proof; the actual RLS behavior of mediator-owner queries remains a **blocking unknown**.

## 5. Review-only ACL sketch, deliberately NOT an install script

\`\`\`sql
-- FRAGMENTS FOR PRIVILEGE REVIEW ONLY; NOT EXECUTABLE AS A WHOLE.
-- Restricted to objects created inside the disposable Gate C LAB.
-- The INSTALLER must own/configure grant rights; no production roles.
REVOKE ALL ON FUNCTION public.nexa_gate_c_checkpoint_candidate(uuid,uuid,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.nexa_gate_c_materialize_verified_evidence_lab(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.nexa_gate_c_commit_candidate(uuid,uuid,text,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- Only a non-login mediator owner may invoke the original candidate functions.
GRANT EXECUTE ON FUNCTION public.nexa_gate_c_checkpoint_candidate(uuid,uuid,bigint)
  TO nexa_gc_mediator_owner_lab;
GRANT EXECUTE ON FUNCTION public.nexa_gate_c_materialize_verified_evidence_lab(uuid,uuid)
  TO nexa_gc_mediator_owner_lab;
GRANT EXECUTE ON FUNCTION public.nexa_gate_c_commit_candidate(uuid,uuid,text,jsonb,jsonb)
  TO nexa_gc_mediator_owner_lab;

-- A real installation would additionally revoke direct service_role DML
-- on each new LAB evidence/checkpoint/binding table, and grant only
-- granular mediator rights. These omitted DML/ownership steps are
-- unresolved until catalog, role membership and RLS have been reviewed.
\`\`\`

**Important:** revocation of direct \`service_role\` privileges is ineffective if it inherits ownership or other rights; SELECT/INSERT required by original SECURITY INVOKER must be granted only to the NOLOGIN mediator, not the consumer. The above is a reviewable target state, not proof that the real PostgreSQL permits it.

## 6. Mandatory static approval checks before even considering a physical LAB

1. Exact local schema provenance and disposable database identity; absence of any external route.
2. The operator's two original working-tree SQL STOPs remain byte-for-byte intact; never apply either original or overlay to bypass STOP.
3. Effective \`has_schema_privilege\`, \`has_table_privilege\`, \`has_function_privilege\` and column privilege inventory for installer/mediator/issuer/A/B/commit/reviewer/observer, as well as roles, recursive membership and default PUBLIC grants.
4. \`pg_proc.prosecdef\`, actual \`proowner\`, fixed \`search_path\`, object qualification and unsafe temporary-object shadowing; no arbitrary SQL dynamic dispatch.
5. Table ownership and actual row-level policies for consultation source, profiles, clinical slots, event log, audit cases, and new evidence. The mediator must not accidentally gain unrestricted access to other physicians' rows.
6. Functional denial of **direct** derived-evidence INSERT/UPDATE/DELETE and direct original function EXECUTE from A/B/commit/reviewer/observer; denial of unauthorized \`SET ROLE\` and escalation.
7. Locked/reviewed/terminal rows must be immutable; idempotence only for identical checkpoint/event IDs, digest and owner, with concurrency-safe locks (C07 two connections; C08 revisor in parallel).
8. Event producer synthetic only: distinguish fixture creation by local admin from legitimate patient consent, real Auth.getUser(), and final medical review ACK. No retroactive inference from legacy checkbox/timestamp.
9. No C01–C10 PASS until actual isolated PostgreSQL runs with independent synthetic sessions and sanitized evidence. N01–N09 remain NOT_RUN and require separate gates.
10. Distinct review/authorization needed to replace a hard STOP or add actual write-capable mediated functions. A green CI or a proposed OWNER role never implies deployment authorization.

## 7. Gate decision and scope control

**STOP / NOT AUTHORIZED:** no real event issuer, no verified Edge-auth-to-DB actor binding, no verified mediator RLS, no proven minimal SQL grants/locks, local SQL STOPs active, and no trustworthy physical network/database preflight. Thus only this static review file is added.

**No redundant LAB, mock, test suite, migration, hosted SQL, service call, staging, merge or deploy.** No source file from #165/#167 or any other Draft is modified. Production, main and local Mac working tree are outside this PR.

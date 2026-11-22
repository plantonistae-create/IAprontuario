# NEXA P0 — Physician ACK authority v1 (DRAFT / NOT DEPLOYED)

**Contract code plus offline synthetic tests only. Gate C NO-GO 0/19; C01–C10 and N01–N09 NOT_RUN.**

## Provenance
- Stacked from PR #176 HEAD 09803e2b47252cd32c49fef15fbe20d64e8521ac, without changing the existing ledger, consent/revocation code, RLS guards, HTTP 423 or final ACK STOP.
- Text readback e2e/p0-readback HEAD 448e7ef233df22829668e747f5953d5073dbf988 is a separate interface, not merged. Its package SHA includes processing_meta but is not pg-jsonb-v1; the client does not compare processing_meta locally.
- PR #179 HEAD b96d3d767ddd8f652ee0abea63ebe3032d7f1066 contains unexecuted retention contracts. No audio archive, grant, policy, or consent is presumed.
- Sanitized operator report about private schema-only from 10–11 Nov was used as background. No private dump content was accessed or shared.

## The added candidate contract
The isolated JS module exposes the server-only candidate stages receipt, issue, consume, with deliberately unimplemented persistence.

- Denies unknown request keys and client-supplied actor, clinical fields or authority claims.
- Requires reauthenticated backend user, verified owner and clinical slot, exact persisted sync_version and pg-jsonb-v1 digest.
- Requires server-owned terminal processing completion, immutable receipt readback, execution ID, provider/model version, and output digest bound to the same persisted revision.
- For challenge stages, additionally requires server-confirmed audio session completion and accounted chunks; reconciled and unchanged source; nonrevoked server-confirmed audit-purpose consent. Verified audio archival is required only when retention is in fact required.
- For consumption, checks issued-by-server challenge bound to actor, encounter, source row, sync version, digest, processing/audio/consent IDs, unused state, expiry and server-verifiable nonce, plus explicit physician confirmation.
- A complete mock fixture returns STOP; no mutation adapter is invoked. Each result has processingReceiptRecorded:false, challengeIssued:false, challengeConsumed:false, ackRecorded:false, externalAiAuthorized:false, auditAuthorized:false and gateCVerified:false.

The synthetic tests are **negative contract tests only**, not proof of valid database roles, real server evidence, actual consent or transaction atomicity.

## Minimum future database implementation (NOT INCLUDED)
1. Independently verify restricted function owner, narrow grants, full RLS and role boundary in a disposable PostgreSQL. Do not grant service_role automatic ownership or use a privileged definer to bypass RLS.
2. Commit a server-generated, immutable processing receipt only after the actual execution and persisted source reconciliation; bind owner, encounter, source row, sync_version, clinical digest, model and output; require authenticated independent readback.
3. Obtain genuinely server-verified audio completion manifest. Treat archival permission and storage integrity separately; do not require retention when there is no eligible retention purpose.
4. Issue a CSPRNG challenge on the server, storing its verifier, unique ID, expiry and exact owner/source/version/digest/receipt scope; the browser actionId remains idempotency only.
5. In ONE database transaction, lock challenge and source in a reviewed order, recheck privileges/consent/completeness/version/digest/nonce, consume the challenge and append the final review event to the **existing** ledger from #176. Use unique constraints, deterministic conflict resolution and rollback. Test replay, stale version, two actors, concurrent autosave and revocation.
6. Independently read the committed ACK back under owner-only permission before reporting a positive confirmation. ACK does not authorize first AI egress or audit dispatch.

## Hard stops preserved
- HTTP 423 GATE_C_NO_GO remains unchanged in the candidate Edge writer.
- FINAL_REVIEW_SERVER_COMPLETENESS_NOT_PROVEN remains an unconditional SQL STOP for final physician review.
- No hosted SQL, PostgreSQL, VM, CI, external AI, real patients, deploy or production changes occurred.
- No new consent ledger, no release authorization, no positive ACK response.

## Verification and STOP
Node.js 22 in the offline ChatGPT sandbox: syntax checks on authored module/test and 18/18 synthetic subtests PASS. No hosted CI. Only the exact GitHub blob/commit provenance should be used when reviewing this candidate.

**STOP_ACK_ATOMIC_AUTHORITY_NOT_PROVEN:** Actual server processing completion writer, authoritative audio proof, challenge issuer and atomic SQL consumer, restricted owner/RLS/ACL and Gate C cases remain unproven. Next action: review this Draft and, under a separate approval, implement/test the minimum SQL transaction in a disposable offline PostgreSQL without bypassing any guards.

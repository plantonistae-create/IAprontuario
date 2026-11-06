# NEXA — OpenAI infrastructure gate 8.9

**Scope:** offline, synthetic-only preparation. No key was created or rotated; no paid request, hosted migration, production write, clinical payload, Auth/JWT/RLS change, model change, or deploy was performed. The full protected checkpoint remains outside the repository at `~/Documents/ChatGPT/NEXA/NEXA_OPENAI_INFRA_CHECKPOINT_20261106.md`.

## Hosted dependency inventory (read only, 2026-11-06)

The eight named Edge Functions reference `OPENAI_API_KEY` directly or through bundled shared helpers. The inventory below compares the *actual hosted bundle files* with remote `main` at `51e2c950b50b08838b9bc9eb9262ba83b9b78b46`. Equality means identical source text for the listed bundle files; it does not attest runtime secrets, provider access, or clinical behavior.

| Function | Production version | Production vs main | Staging version | Staging vs main |
| --- | ---: | --- | ---: | --- |
| realtime-radar | 12 | 11/11 bundled files equal | 10 | entrypoint and concept catalog differ |
| realtime-call | 6 | entrypoint, shared capability helper and deno.json differ | 5 | entrypoint differs; staging preview helper absent in main |
| process-consultation | 24 | 8/8 bundled files equal | 14 | entrypoint and deno.json differ |
| clinical-assistant | 7 | hosted entrypoint absent in main | 7 | hosted entrypoint and staging-only files absent in main |
| clinical-plan | 8 | hosted entrypoint absent in main | 4 | hosted entrypoint and staging-only files absent in main |
| consultation-speakers | 1 | bundled speaker helper differs | 4 | bundled speaker helper differs |
| submit-audit-case | 9 | 6/6 bundled files equal | 12 | entrypoint differs |
| audit-backfill | 6 | bundled capability helper differs | 4 | entrypoint differs |

Production lists `OPENAI_API_KEY` and separately `OPENAI_ADMIN_KEY`. Staging lists neither. Neither environment lists `NEXA_VECTOR_STORE_ID` or `OPENAI_PROJECT_ID`. The hosted `clinical-assistant` requires the vector-store secret for private file search and returns a missing-library response when absent. The new OpenAI NEXA project has no vector store. Secret names and hosted versions were read; secret values and patient data were not.

The browser-authenticated OpenAI organization is `org-l5gc98PRIumcyvgT68IKPZpf`, containing `NEXA Production` (`proj_pdlp9hhuhMIOI3TOUMhxLcpt`). The connected OpenAI Developers integration points to a different organization, so it must not create the new NEXA key. The target organization had USD 0.00 credit, no payment method, no project API key, and no visible spend controls. Its BAA eligibility page said it was not eligible yet. The project's “Allow all models” policy does **not** prove request entitlement or clinical-data eligibility.

## Offline controls added by this PR

- `scripts/nexa-openai-migration-gate.mjs` accepts only fixed, sanitized metadata. It checks the intended organization and project, soft budget and 50/80/100 alerts, hard-stop absence, credential scope, staging, privacy, vector store, rollback, hosted baselines, and separation of the admin key. Unknown fields (including a key, transcript, encounter ID or raw log) fail closed. Passing predicates **never authorizes** rotation or clinical-data transfer; external evidence and human institutional decisions remain required.
- `scripts/nexa-openai-cost-reconcile.mjs` accepts only aggregate USD rows by UTC date, model, modality and capability. It reports missing WebRTC/audio billing, missing provider rows and arithmetic differences without claiming savings. It complements the seven-day partial price estimate in [PR #118](https://github.com/plantonistae-create/IAprontuario/pull/118); it does not copy, merge or modify that Draft PR.
- `npm run test:openai-infra` uses synthetic fixtures and no network or secret. The existing UI CI invokes it on the PR. Existing JWT/RLS tests are a separate gate: boolean metadata in the offline preflight does not simulate real Auth or certify RLS.

## Controlled rotation and rollback

1. **Before any rotation:** an authorized holder must verify the old production key is recoverable from an approved secret manager. Supabase shows a digest but does not supply the old plaintext. Record current function bundle versions and hashes; preserve `OPENAI_ADMIN_KEY` and other unrelated secrets.
2. Establish billing and soft project spend alerts without a hard stop; resolve clinical-data processing eligibility. Attest the new service key against the correct organization/project using an approved secure workflow. Verify required models, vector-store access and resource ownership with synthetic inputs under the separately authorized paid-call ceiling.
3. Place only the new test key in staging; run authenticated synthetic Radar, ASR/diarization, consultation processing, plan, assistant and audit tests, including tenant isolation and failure recovery. Reconcile the hosted bundles before any deployment; main is not a safe replacement for every hosted function.
4. Rotate production `OPENAI_API_KEY` only after those gates and a rollback rehearsal. Confirm function availability, aggregate usage in the intended project and no clinical regression. Update `OPENAI_PROJECT_ID` separately so the financial dashboard does not silently change scope. Never overwrite `OPENAI_ADMIN_KEY`.
5. On failure, restore the escrowed old key through the approved secret channel, verify its digest against the prior baseline, and perform a non-destructive technical smoke. If the old key cannot be restored, the cutover gate remains blocked.

**Current result:** blocked. No secret, billing, vector store, staging test, rollback rehearsal or privacy approval can be inferred from a green offline CI.

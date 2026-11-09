# NEXA — G45: single integrated offline homologation candidate (PREPARATION ONLY)

Status: **NOT EXECUTED / NO-GO FOR LIVE**. This document does not authorize deployment, hosted calls, merging or physical testing.

## Frozen inputs (independent Draft PRs, NOT a combined candidate)

- main checkpoint: `064757d2a39ad4c04c60b0034a8b35756b8eb089`
- #158 Core Shadow: `d0e763ea463d787643e9f8a5c9d185996df46812`; CI `42553973542` SUCCESS.
- #159 Radar: `d4e12186964bb26631c6c117a24aa7563b09e05e`; CI `42548679811` SUCCESS.
- #160 WebRTC/transcription: `15b7806679f1c161de82386674001d9d30f3aec4`; CI `42555662530` SUCCESS.
- #161 Cost aggregates: `33e8f58c5bacc6687d81e54731effc56a93a4b44`; CI `42550892214` SUCCESS.

All are separate Draft PRs against main. **No combined candidate has been built or tested.** CI success on each branch is not integration evidence.

## Preparation gates before a physical session

1. Assemble a **throwaway local worktree** from the pinned main commit and apply the exact four reviewed changes in a documented, deterministic order. Do not change or merge the source Draft branches. STOP on conflicts or changes to hosted functions, JWT/RLS/ACL, secrets, clinical engine, production URLs or data storage.
2. Save a local source manifest: main SHA, four PR SHAs, combined worktree tree SHA, hashes of harness files, dependency lockfile hash, and exact test commands. No real credentials.
3. Offline browser harness: intercept/deny all network traffic, including Supabase, CDN, analytics, telemetry and OpenAI; mock authentication, WebRTC peer/data channel, microphone and fetch using fixtures. **No real audio or paid endpoints.** If app boot needs external resources, STOP rather than silently allowing network.
4. Use a fresh browser profile with disposable synthetic data. Ensure no persisted sessions, service workers, real tokens, existing IndexedDB/localStorage, or links to production. The production PWA must not be opened.
5. Run the existing CI-equivalent unit/contract suites on the combined tree; then execute the browser matrix below. Record screenshots or structured synthetic logs without patient data.
6. Any failed gate is NO-GO; never override by asserting individual PR CI success.

## Single-session synthetic browser matrix

| ID | Action | PASS criterion | FAIL / STOP |
| --- | --- | --- | --- |
| B01 | Start synthetic consultation A; mock successful data-channel open and committed turn | No textual transcript displayed while recording; Radar can use only completed synthetic turns | Any transcript panel shown during recording |
| B02 | Send completed event twice and out of order | One immutable completion per item, ordered by commit | Duplicate/reordered final text |
| B03 | Stop A; start B; deliver late A callback | B receives no A text or Radar evidence | Cross-session contamination |
| B04 | Mock failed offer, timeout and closed channel | Deterministic local review path; no automatic paid retry | Unbounded retry or remote request |
| B05 | Mock user cancellation with and without provenance | Verified cancel stops; unverified provenance requires review | Implicit retry/fallback |
| B06 | Mock reconnection and late channel events | Old revision rejected, current revision accepted once | Stale callback accepted |
| B07 | Complete B and generate final summary | Text available only at permitted end-of-consultation step | Text visible before completion or missing from permitted final step |
| B08 | Clear consultation, reload disposable browser profile | No prior transcript, audio, stale timers or Radar evidence | Any residual prior consultation |
| R01 | Restore synthetic Radar ledger; change owner/encounter | Only allowed own ledger restored; contradictions remain reviewable | Foreign/invalid ledger accepted |
| R02 | Negate/confirm allergies, comorbidities, medicines and contradictory statements | Mandatory gaps persist until answered; contradicted claims not silently resolved | False negative or dismissed mandatory gap |
| C01 | Replay synthetic Core Shadow cohort with missed critical last frame | Promotion remains false; manual review required | Live promotion despite critical miss |
| C02 | Replay duplicate case IDs, speaker ambiguity, unexpected/missing alerts | Invalid/unsafe cases blocked; aggregates deterministic | False negative or unreviewed promotion |
| F01 | Reconcile synthetic aggregate with absent capability and unknown provider invoice | Coverage incomplete; no verified savings or fabricated billing | False claim of cost savings |
| F02 | Reconcile matched declared totals, null cost and zero consultations | Observational match distinguished from official invoice; no division by zero | False verified billing or fabricated per-consultation cost |
| X01 | Test rollback by discarding the local candidate and disposable profile | Original Draft branches/main untouched; no remote side effects | Any persistent or hosted mutation |

## Evidence and acceptance

Record per case: `case_id`, synthetic fixture ID, browser/runtime version, combined tree SHA, test command, `PASS|FAIL|BLOCKED`, timestamp and redacted error. Do not log tokens, audio, transcripts of real patients, or personally identifying data.

**GO to request separate physical-session authorization** only when: all B/R/C/F/X cases PASS on the same combined candidate; network denial is verified; the app starts offline without real credentials; source manifest is reproducible; rollback dry run passes; clinical critical misses are zero in the approved synthetic acceptance cohort; no unexpected UI transcript display; and the human reviewer has the consolidated evidence.

**NO-GO for production** until a separately authorized physical/browser validation, clinical sign-off, verified rollback and explicit deployment approval. Synthetic CI and declared cost reconciliation do not prove clinical safety, provider billing or real savings.

## Manual action (only after preparation gates)

One separately authorized, time-boxed browser homologation session on the isolated candidate, with a synthetic checklist. No installation or execution on the user's Mac/iPhone is authorized by this document.

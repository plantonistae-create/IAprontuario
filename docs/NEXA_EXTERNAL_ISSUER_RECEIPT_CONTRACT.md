# NEXA external issuer receipt contract

This candidate contract prepares independent document-authenticity verification without claiming that a real issuer has been integrated. It does not activate historical ownership mapping, and it must not be deployed to staging or production before an approved verifier, protected recovery rehearsal and full homologation exist.

## Trust boundary

`nexa-external-issuer-receipt.mjs` accepts only compact ES256 JWS receipts signed by an explicitly pinned public key. Trust configuration binds one issuer URL, audience, verifier identity and key ID to one P-256 public JWK. The verifier does not fetch keys or follow URLs, so an untrusted receipt cannot redirect key resolution. Private JWK material and duplicate trust identities are rejected.

The signed payload contains metadata and SHA-256 digests only. Its claim allowlist rejects extra fields, including free clinical text or patient identifiers. Assertions are short-lived, audience-bound, replay-identifiable and limited to a five-minute lifetime. The returned object omits the compact JWS and raw source/proof references.

This module proves only that a receipt matches a configured key. Selecting a real issuer, obtaining its public key through an authenticated governance process, protecting key rotation and establishing the legal meaning of its assertions remain external requirements.

## Persistence and lifecycle

Migration `20261101010336_nexa_external_issuer_verified_receipts.sql` adds a private append-only receipt ledger with:

- evidence, issuer and document-digest binding;
- independent verifier identity, key ID, algorithm and verification method;
- digests of the signed payload, compact JWS and protected references;
- external event replay protection;
- a single linear version chain;
- signed verification, revocation and contestation events;
- immutable history and no grants to `anon` or `authenticated`.

The database table is a persistence target, not a verifier. Direct insertion by an operator is not external authenticity proof. A future ingestion boundary must call the shared cryptographic verifier first and persist only its normalized result through a separately reviewed service identity.

Administrative approval remains separate in `private.nexa_historical_evidence_decisions`. Even a structurally valid receipt cannot call or release `private.nexa_apply_verified_legacy_mapping()`: the migration explicitly preserves its `42501` fail-closed behavior.

## Homologation gates before activation

1. Name and approve the real external authority and its assertion semantics.
2. Obtain and pin its public keys through an authenticated out-of-band process; document rotation and compromise response.
3. Implement an authenticated ingestion endpoint with replay-safe transactional persistence and bounded, redacted logging.
4. Demonstrate real valid, invalid, expired, rotated, revoked and contested receipts in an isolated environment.
5. Rehearse the migrations and rollback on an authorized production-schema restoration.
6. Verify backup recovery, immutable audit export and frontend compatibility.
7. Keep authenticity decisions separate from institutional approval and training/export rights.

Until all gates pass, the historical backfill remains disabled.

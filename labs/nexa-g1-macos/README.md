# NEXA G1 macOS - PREPARATION ONLY (NO-GO)

This folder is an independent local Supabase CLI workspace. It does NOT link to production or the existing staging project. No clinical schema, real users, tokens or migrations are included.

Files: supabase/config.toml (localhost-only reserved ports 55320-55324), preflight.mjs (read-only), rollback-plan.mjs (plan-only), manifest.json (SHA-256 pins), and offline regression tests in tests/nexa-g1-macos-package.test.mjs.

Do not run on your Mac yet. After SEPARATE authorization, a human can run these read-only checks from this folder:
    node preflight.mjs --selfcheck
    node preflight.mjs --inspect-host
    node rollback-plan.mjs --plan

The host preflight requires macOS, physical memory >=8 GiB, Docker allocated memory >=7 GiB, >=15 GiB free disk, tools already present, all ports 4173 and 55320-55324 free, local Unix Docker context, no dangerous credential/environment variable names, and dedicated EMPTY Docker bridge network named nexa-g1-macos-20261107 with internal=true, loopback host binding, and label org.nexa.g1=offline-only. It intentionally reports STOP when images are not independently verified as cached. No script creates the network, caches images or starts services.

WARNING: localhost binding is not a guarantee of no Internet egress. Docker internal network stops container outbound networking but does not stop the host CLI from downloading images or prevent additional Docker networks. After independent authorization, the operator must verify every actual container attachment and confirm no upstream requests, no remote links and no image download is possible. Never run supabase login/link, remote db commands, project setup, or the authenticated staging smoke with this lab.

Manifest SHA-256 checks prevent accidental file drift and symlinks; it is not a signature. Trust the GitHub Draft HEAD separately. The project root supabase/migrations contains real application migrations that MUST NOT be imported without a separate clinical/security review.

STOP for hash drift, untrusted Docker context, network not internal, port collision, missing RAM/disk, absent image cache evidence, linked project, secret-bearing environment, or unexpected user data. Do not bypass STOP. Rollback is purely a plan: later (after separate permission) stop ONLY this lab via supabase stop from this directory; preserve volumes by default, verify network ownership before removal, never use docker system prune or supabase stop --no-backup. No rollback is needed today.

Official references:
https://supabase.com/docs/guides/local-development
https://supabase.com/docs/guides/local-development/cli/config
https://supabase.com/docs/guides/local-development/cli-workflows
Project gates: ../../docs/NEXA_P0_WEBRTC_97_HOMOLOGATION_GATE_20261107.md and ../../docs/NEXA_P0_WEBRTC_98_RELEASE_DECISION_20261107.md

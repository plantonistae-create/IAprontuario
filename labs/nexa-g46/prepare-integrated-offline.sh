#!/usr/bin/env bash
# G46: local-only, disposable, no-fetch integration. PREPARATION ONLY.
set -Eeuo pipefail
export GIT_TERMINAL_PROMPT=0 GIT_CONFIG_NOSYSTEM=1
export npm_config_offline=true npm_config_audit=false npm_config_fund=false
export HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 ALL_PROXY=socks5://127.0.0.1:9
export NO_PROXY=localhost,127.0.0.1
unset GITHUB_TOKEN GH_TOKEN SUPABASE_SERVICE_ROLE_KEY OPENAI_API_KEY || true
MAIN=064757d2a39ad4c04c60b0034a8b35756b8eb089
PR158=d0e763ea463d787643e9f8a5c9d185996df46812
PR159=d4e12186964bb26631c6c117a24aa7563b09e05e
PR160=37640b4d60e71046ca677d4403e9dc18fdd66ef5
PR161=33e8f58c5bacc6687d81e54731effc56a93a4b44
[[ ${NEXA_G46_OFFLINE_ACK:-} == YES ]] || { echo 'STOP: set NEXA_G46_OFFLINE_ACK=YES after inspecting this script'; exit 2; }
[[ $# == 1 && -d $1 ]] || { echo 'Usage: NEXA_G46_OFFLINE_ACK=YES bash prepare-integrated-offline.sh /path/to/verified-local-repository'; exit 2; }
cd "$1"
[[ $(git rev-parse --is-inside-work-tree) == true ]] || exit 2
[[ -z $(git status --porcelain) ]] || { echo 'STOP: local repository has uncommitted changes'; exit 2; }
for sha in "$MAIN" "$PR158" "$PR159" "$PR160" "$PR161"; do
 git cat-file -e "$sha^{commit}" || { echo "STOP: missing pre-fetched commit $sha (no network fetch allowed)"; exit 2; }
done
[[ $(git rev-parse "$MAIN") == "$MAIN" ]] || exit 2
[[ $(git rev-parse "$PR160") == "$PR160" ]] || exit 2
root=$(mktemp -d "${TMPDIR:-/tmp}/nexa-g46.XXXXXXXX")
worktree="$root/candidate"
cleanup() {
 git -C "$1" worktree remove --force "$worktree" >/dev/null 2>&1 || true
}
trap 'echo "G46 STOP/EXIT: disposable worktree at $worktree; no production mutation"' EXIT
git worktree add --detach "$worktree" "$MAIN" >/dev/null
cd "$worktree"
git -c user.name='NEXA Synthetic Lab' -c user.email='offline.invalid@example.invalid' config rerere.enabled false
# Exact deterministic order. Stop on conflicts; never auto-resolve clinical or transcription code.
for entry in "158:$PR158" "159:$PR159" "160:$PR160" "161:$PR161"; do
 number=${entry%%:*}; sha=${entry#*:}
 echo "Integrating PR #$number at $sha"
 if ! git -c user.name='NEXA Synthetic Lab' -c user.email='offline.invalid@example.invalid' merge --no-ff --no-edit "$sha"; then
  git status --short
  echo "STOP: merge conflict on PR #$number; review manually, do not accept ours/theirs blindly"
  exit 3
 fi
done
# Never run application or network-dependent install commands in this preflight.
# Inspect changed paths against the pinned base.
git diff --name-only "$MAIN" HEAD > "$root/changed-paths.txt"
if grep -E '(^supabase/functions/|(^|/)(\.env|secrets)(/|$)|(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$)' "$root/changed-paths.txt"; then
 echo 'STOP: protected runtime/function/secret/dependency-lock change requires separate review'
 exit 4
fi
{
 echo 'schema_version=nexa-g46-integrated-preflight-v1'
 echo "base_main=$MAIN"
 echo "pr158=$PR158"
 echo "pr159=$PR159"
 echo "pr160=$PR160"
 echo "pr161=$PR161"
 echo "integrated_commit=$(git rev-parse HEAD)"
 echo "integrated_tree=$(git rev-parse HEAD^{tree})"
 echo "node=$(node --version)"
 echo "git=$(git --version)"
 echo "network_mode=proxy_denied_best_effort_NOT_FIREWALL_PROVEN"
 echo "status=INTEGRATED_NOT_BROWSER_HOMOLOGATED"
} > "$root/manifest.txt"
echo 'Executing selected local synthetic suites (no npm install; fail closed)'
node --test tests/nexa-radar-controller.test.cjs tests/nexa-radar-provenance-state.test.cjs tests/nexa-g7-webrtc-fallback-policy.test.mjs tests/nexa-g5-shadow-cohort.test.mjs tests/nexa-cost-aggregate-reconciliation.test.mjs > "$root/tests.log" 2>&1 || {
 tail -n 80 "$root/tests.log"
 echo 'STOP: synthetic test failure; no GO'
 exit 5
}
echo 'Synthetic suites PASS. Browser tests and network-denial firewall NOT verified.'
echo "Evidence: $root/manifest.txt, $root/tests.log, $root/changed-paths.txt"
echo 'Do not deploy, merge or use clinical data. Separate authorization required for physical homologation.'

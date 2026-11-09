#!/bin/bash
# NEXA G47: macOS preparation only. Does NOT execute tests or use network.
set -euo pipefail
export GIT_TERMINAL_PROMPT=0 GIT_CONFIG_NOSYSTEM=1
MAIN=064757d2a39ad4c04c60b0034a8b35756b8eb089
PR158=d0e763ea463d787643e9f8a5c9d185996df46812
PR159=d4e12186964bb26631c6c117a24aa7563b09e05e
PR160=a31513a8ea8843757a863696e9846d30275e5dc5
PR161=33e8f58c5bacc6687d81e54731effc56a93a4b44
if [ "$(uname -s)" != Darwin ]; then echo "STOP: macOS only"; exit 2; fi
if [ "${NEXA_G47_PREPARE_ACK:-}" != YES ]; then echo "STOP: preparation authorization required"; exit 2; fi
if [ "$#" -ne 1 ] || [ ! -d "$1" ]; then echo "Usage: NEXA_G47_PREPARE_ACK=YES bash prepare-macos-no-network-execution.sh /path/to/local/repo"; exit 2; fi
cd "$1"; SOURCE_REPO=$(pwd -P)
if [ "$(git rev-parse --is-inside-work-tree)" != true ] || [ -n "$(git status --porcelain)" ]; then
 echo "STOP: repository missing or dirty"; exit 2
fi
for sha in "$MAIN" "$PR158" "$PR159" "$PR160" "$PR161"; do
 if ! git cat-file -e "$sha^{commit}" 2>/dev/null; then echo "STOP: missing offline commit $sha; no fetch attempted"; exit 3; fi
done
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/nexa-g47.XXXXXXXX")
WORKTREE="$ROOT/candidate"
cleanup(){
 git -C "$SOURCE_REPO" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
 echo "Disposable candidate removed. Evidence directory: $ROOT"
}
trap cleanup EXIT
git worktree add --detach "$WORKTREE" "$MAIN" >/dev/null
cd "$WORKTREE"
printf '%s\n' "base=$MAIN" "pr158=$PR158" "pr159=$PR159" "pr160=$PR160" "pr161=$PR161" "host=macOS" "network_execution=NOT_PERFORMED" > "$ROOT/manifest.txt"
for entry in "158:$PR158" "159:$PR159" "160:$PR160" "161:$PR161"; do
 num=${entry%%:*}; sha=${entry#*:}
 if ! git -c user.name='NEXA Offline Lab' -c user.email='nexa-offline@invalid.example' -c rerere.enabled=false merge --no-ff --no-edit "$sha" >"$ROOT/merge-$num.log" 2>&1; then
  git status --short > "$ROOT/conflicts-$num.txt"
  echo "STOP: PR #$num conflicts; inspect $ROOT/conflicts-$num.txt. No automatic resolution."
  exit 4
 fi
done
git diff --name-only "$MAIN" HEAD > "$ROOT/changed-paths.txt"
if grep -E '(^supabase/functions/|(^|/)(\.env|secrets)(/|$)|(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$)' "$ROOT/changed-paths.txt"; then
 echo "STOP: protected runtime, secret or dependency changes"; exit 5
fi
printf 'combined_commit=%s\ncombined_tree=%s\nstatus=PREPARED_ONLY_NOT_TESTED\n' "$(git rev-parse HEAD)" "$(git rev-parse 'HEAD^{tree}')" >> "$ROOT/manifest.txt"
echo 'Candidate assembled, but no tests executed. macOS host firewall/network isolation NOT verified.'
echo 'STOP: do not run tests or browser here. A separately approved VM with no network interface is required.'
echo "Evidence: $ROOT/manifest.txt"

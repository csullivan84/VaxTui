#!/bin/sh
# scripts/check-no-sprawl.sh -- refuse run-output sprawl (owner request, 2026-11-25).
#
# Over `git ls-files`, fail on:
#   (a) a top-level file or folder that is neither upstream Shelley's nor in
#       FORK_EXTRAS below. Upstream's entries are UPSTREAM below, unioned with
#       `git ls-tree upstream/main` when that ref exists, so a local upstream
#       sync passes; CI has no upstream remote, so after a sync that adds a
#       top-level entry, add it to UPSTREAM.
#   (b) a committed *.log, *.pid, *.out, *.bak*, *.orig or *.rej anywhere.
# Run output (logs, handoffs, evidence, scratch) goes outside the repo, under
# ~/agent/draft/run/<campaign>/.
#
# Usage: sh scripts/check-no-sprawl.sh        (checks the index)
#        printf 'a\nb\n' | sh scripts/check-no-sprawl.sh -   (checks a list)

set -u
UPSTREAM=".clabot .github .gitignore .goreleaser.yml AGENTS.md AGENT_TESTING.md API.md ARCHITECTURE.md FILE_COMPLETION.md HOOKS.md LICENSE Makefile README.md bin claudetool client cmd commitnotes db demo.py docs dtach exeenv exescroll featureflags gitstate go.mod go.sum lazycue llm loop mcp modelproviders models modelsources pty scripts server siwc skills slug sockdial sqlc.yaml subpub templates test test_ci.sh test_manual.sh ui version"
FORK_EXTRAS="FORK.md committour f35.md lazy.md platformpath providerauth"
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$SELF")/.." || exit 1

if [ "${1:-}" != - ]; then
	# Planted violation first: the check must go red on a stray log and handoff.
	printf 'server/x.go\nrun.log\nHANDOFF.md\n' | sh "$SELF" - >/dev/null && { echo "FAIL  check-no-sprawl did not catch a planted violation"; exit 1; }
	git ls-files | sh "$SELF" -
	exit $?
fi

ALLOW=" $UPSTREAM $FORK_EXTRAS $(git ls-tree --name-only upstream/main 2>/dev/null | tr '\n' ' ') "
bad=0
while IFS= read -r f; do
	top=${f%%/*}
	case "$ALLOW" in *" $top "*) ;; *)
		echo "FAIL  top-level '$top' is neither upstream Shelley's nor in FORK_EXTRAS in scripts/check-no-sprawl.sh; run output goes under ~/agent/draft/run/<campaign>/"; bad=1 ;;
	esac
	case "$f" in *.log|*.pid|*.out|*.bak*|*.orig|*.rej)
		echo "FAIL  committed run output '$f'; keep it under ~/agent/draft/run/<campaign>/"; bad=1 ;;
	esac
done
[ "$bad" -eq 0 ] && echo "PASS  no run-output sprawl"
exit "$bad"

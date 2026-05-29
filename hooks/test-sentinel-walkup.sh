#!/usr/bin/env bash
# =============================================================================
# test-sentinel-walkup.sh — Verify the `disable_if_repo_file` lookup walks up
# to the repo root.
#
# Greptile #25 P1 regression: the original lookup only checked `./<name>` in
# the process cwd, which meant a sentinel placed at the documented location
# (the repo root) was ignored when the hook fired from any subdirectory. The
# fix walks upward looking for `.git` and resolves the sentinel relative to
# that root.
#
# This script exercises three scenarios:
#   1. Root cwd + sentinel at root + git marker → rule does NOT fire (exit 0)
#   2. Subdir cwd + sentinel at root + git marker → rule does NOT fire (exit 0)
#   3. Subdir cwd + NO sentinel + git marker → rule fires as normal (exit 2)
#
# Tests use an isolated temp dir (no real `.git` interaction) so the runner
# can be invoked from anywhere.
#
# Usage:  bash hooks/test-sentinel-walkup.sh
# Exit:   0 if all pass; 1 if any fail.
# =============================================================================
set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_RULE="$HOOKS_DIR/lib/eval-rule.sh"
SENTINEL_NAME=".no-make-no-mistakes-db-mutation"
RULE_ID="inline-db-mutation-mysql"

# A canonical mutation command that would otherwise be blocked by the rule.
BLOCKING_INPUT='{"tool_input":{"command":"mysql -u root -e \"DROP TABLE legacy\""}}'

TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

# Build a fake repo layout: tmpdir/.git (file), tmpdir/sub/dir/deeper/
mkdir -p "$TMPROOT/sub/dir/deeper"
# `.git` as a *file* (worktree-style) — matches `[ -e .git ]`.
echo "gitdir: /dev/null" > "$TMPROOT/.git"

PASS=0
FAIL=0

run_case() {
  local label="$1"
  local cwd="$2"
  local expected_exit="$3"
  local actual_exit=0
  # Run eval-rule with the BLOCKING_INPUT from $cwd. We use a subshell so the
  # cd doesn't leak.
  ( cd "$cwd" && printf '%s' "$BLOCKING_INPUT" | bash "$EVAL_RULE" "$RULE_ID" ) \
    >/dev/null 2>&1 || actual_exit=$?
  if [ "$actual_exit" = "$expected_exit" ]; then
    echo "  PASS  $label  (cwd=$cwd, exit=$actual_exit)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label  (cwd=$cwd, expected=$expected_exit actual=$actual_exit)"
    FAIL=$((FAIL + 1))
  fi
}

# -----------------------------------------------------------------------------
# Case 1: sentinel at repo root, cwd = repo root → rule does NOT fire.
# -----------------------------------------------------------------------------
touch "$TMPROOT/${SENTINEL_NAME}"
run_case "root-cwd + sentinel-at-root" "$TMPROOT" 0

# -----------------------------------------------------------------------------
# Case 2: sentinel at repo root, cwd = deep subdir → rule does NOT fire
# (this is the bug Greptile flagged — previously the rule would fire here).
# -----------------------------------------------------------------------------
run_case "subdir-cwd + sentinel-at-root" "$TMPROOT/sub/dir/deeper" 0

# -----------------------------------------------------------------------------
# Case 3: no sentinel anywhere, cwd = deep subdir → rule fires (exit 2).
# Confirms the walk-up doesn't FALSELY disable the rule when no sentinel
# exists.
# -----------------------------------------------------------------------------
rm -f "$TMPROOT/${SENTINEL_NAME}"
run_case "subdir-cwd + no-sentinel" "$TMPROOT/sub/dir/deeper" 2

# -----------------------------------------------------------------------------
# Case 4: no .git marker anywhere — fallback to cwd-only behavior, which
# preserves the pre-fix semantics for non-git deployments. Sentinel at cwd
# disables; sentinel at a parent does not.
# -----------------------------------------------------------------------------
NOGIT="$(mktemp -d)"
mkdir -p "$NOGIT/sub"
touch "$NOGIT/${SENTINEL_NAME}"
# cwd is the dir WITH the sentinel → rule disabled.
run_case "no-git + sentinel-at-cwd" "$NOGIT" 0
# cwd is a SUBDIR, no sentinel there, no git marker → rule fires (cwd
# fallback can't see parent without git anchor).
run_case "no-git + sentinel-at-parent-only" "$NOGIT/sub" 2
rm -rf "$NOGIT"

echo ""
TOTAL=$((PASS + FAIL))
echo "Sentinel walk-up: ${PASS} / ${TOTAL} passed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

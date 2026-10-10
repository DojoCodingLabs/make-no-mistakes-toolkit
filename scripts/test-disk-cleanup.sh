#!/usr/bin/env bash
# test-disk-cleanup.sh — the guards in disk-cleanup.sh that must not regress.
#
# Scope, stated up front so the coverage is not mistaken for more than it is:
# these exercise the argument-level refusals and the UNAVAILABLE-vs-clean
# distinction, which run without docker and without a delegate. The worktree
# classifier has its own suite; this file does not re-test it.
#
# Each assertion is written so that removing the guard it covers makes it FAIL.
# A suite that cannot fail proves nothing.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${SCRIPT_DIR}/disk-cleanup.sh"
PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  FAIL %s\n' "$1"; }

# Runs the target and captures both streams together, plus the exit status.
run_target() {
    OUT="$( "$TARGET" "$@" 2>&1 )"
    RC=$?
    return 0
}

assert_contains() {
    local label="$1" needle="$2"
    if printf '%s' "$OUT" | grep -qF -- "$needle"; then ok "$label"; else
        bad "$label — expected to find: ${needle}"
        printf '       got: %s\n' "$(printf '%s' "$OUT" | head -3)"
    fi
}

assert_not_contains() {
    local label="$1" needle="$2"
    if printf '%s' "$OUT" | grep -qF -- "$needle"; then
        bad "$label — should NOT contain: ${needle}"
    else ok "$label"; fi
}

assert_rc() {
    local label="$1" want="$2"
    if [ "$RC" -eq "$want" ]; then ok "$label"; else bad "$label — exit ${RC}, wanted ${want}"; fi
}

printf 'disk-cleanup guards\n'

# ── The two flags that reach branch deletion are refused, not passed through ──
# Removing a worktree is recoverable while its branch survives; deleting the
# branch is not. Both must be rejected before any stage runs.
#
# The MESSAGE assertion is the discriminating one, not the exit code. Verified
# by deleting the guard: `--branches` then falls through to the catch-all
# "Unknown option" and still exits 1, so the exit-code check passes on a build
# with no guard at all. Only the reason distinguishes them.
run_target worktrees --branches
assert_rc       'rejects --branches (non-zero exit)' 1
assert_contains 'rejects --branches (says why)' 'is not accepted'
assert_not_contains 'rejects --branches BEFORE running the stage' 'Stage 3'

run_target worktrees --force
assert_rc       'rejects --force (non-zero exit)' 1
assert_contains 'rejects --force (says why)' 'is not accepted'

# ── Negative control's positive twin: a valid option is NOT rejected ──────────
# Without this, a script that rejected every option would pass the two above.
run_target docker-volumes --repo-path "$SCRIPT_DIR"
assert_not_contains 'accepts a valid option' 'is not accepted'

# ── Three outcomes, and none of them may be mistaken for another ─────────────
# `already clean`, `UNAVAILABLE` and `dry run` answer three different questions,
# and collapsing any pair is this command's founding defect turned inward.
#
# THE ABSENCE IS MATERIALIZED, not assumed. This block used to run the script in
# place and rely on `worktree-cleanup.mjs` not existing in the checkout — so it
# passed for a reason outside its own control, and went red the moment the
# classifier shipped alongside the command. A test whose premise the repo can
# revoke is not testing the guard; it is testing the repo's contents.
DELEGATE_ABSENT="$(mktemp -d)"
DELEGATE_PRESENT="$(mktemp -d)"
trap 'rm -rf "$DELEGATE_ABSENT" "$DELEGATE_PRESENT"' EXIT
cp "$TARGET" "$DELEGATE_ABSENT/disk-cleanup.sh"
cp "$TARGET" "$DELEGATE_PRESENT/disk-cleanup.sh"

# A stub, not the real classifier: this file's subject is how disk-cleanup.sh
# REPORTS, and borrowing the real one would make the assertion depend on `gh`,
# on the host's worktrees, and on a second suite's behaviour.
cat > "$DELEGATE_PRESENT/worktree-cleanup.mjs" <<'STUB'
console.log('TOTAL  276 MB recoverable  (node_modules 276 MB)');
process.exit(0);
STUB

run_in() { local d="$1"; shift; OUT="$( "$d/disk-cleanup.sh" "$@" 2>&1 )"; RC=$?; return 0; }

# Absent: the stage could not run. Saying "already clean" here would report the
# disk tidy when nothing was measured at all.
run_in "$DELEGATE_ABSENT" node-modules --repo-path "$SCRIPT_DIR"
assert_contains     'missing delegate reports UNAVAILABLE' 'UNAVAILABLE'
assert_not_contains 'missing delegate does NOT claim already clean' 'already clean'
assert_rc           'missing delegate still exits 0 and reaches the summary' 0
assert_contains     'missing delegate still prints the summary' 'Summary'

# Present + dry run: the stage RAN and found work. In a dry run the before/after
# delta is zero by construction, so a report keyed only on that delta announces
# `already clean` two lines under the classifier's own recoverable figure. That
# shipped once and is the reason this case exists.
run_in "$DELEGATE_PRESENT" node-modules --repo-path "$SCRIPT_DIR"
assert_contains     'present delegate in dry run says it is a dry run' 'dry run'
assert_not_contains 'present delegate in dry run does NOT claim already clean' 'already clean'
assert_not_contains 'present delegate is not reported UNAVAILABLE' 'UNAVAILABLE'
assert_contains     "present delegate's recoverable figure survives" '276 MB recoverable'

# ── Dry run is the default ───────────────────────────────────────────────────
run_target worktrees --repo-path "$SCRIPT_DIR"
assert_contains 'defaults to dry run' 'Dry run'

# ── Bad input is refused rather than guessed at ──────────────────────────────
run_target all --target notanumber
assert_rc       'rejects a non-numeric --target' 1
assert_contains 'rejects a non-numeric --target (says why)' 'whole number of GB'

run_target nonsense-subcommand
assert_rc       'rejects an unknown subcommand' 1

run_target node-modules --repo-path /nonexistent-path-for-this-test
assert_rc       'rejects a --repo-path that does not exist' 1

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

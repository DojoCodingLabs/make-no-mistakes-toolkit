#!/usr/bin/env bash
# =============================================================================
# test-hooks.sh — Parametrized test runner for the rules manifest.
#
# Reads each rule's `tests` array from rules.json, materializes the input
# JSON in-process via jq, pipes it to eval-rule.sh, and asserts the exit
# code matches `expected_exit`. Optionally checks `expected_stderr_contains`.
#
# Why this design: test fixtures live in rules.json (a file), not as inline
# strings in this script. That way the test runner's command line only
# contains "jq ... | bash eval-rule.sh ..." — never the literal payload.
# This matters because installed PreToolUse hooks (user-level or other
# plugins) inspect the bash command line; if test fixtures lived inline,
# they'd trigger those hooks during testing.
#
# Usage:  bash hooks/test-hooks.sh
# Exit:   0 if all pass; 1 if any fail.
# =============================================================================
set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
RULES_JSON="$HOOKS_DIR/rules/rules.json"
EVAL_RULE="$HOOKS_DIR/lib/eval-rule.sh"

if [ ! -f "$RULES_JSON" ]; then
  echo "ERROR: $RULES_JSON not found. Run 'npm run build-rules' first." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required to run hook tests." >&2
  exit 1
fi

PASS=0
FAIL=0
FAIL_DETAILS=()

# Each line: "<rule_id> <test_index>"
PAIRS="$(jq -r '.[] | .id as $id | (.tests | to_entries[] | "\($id)\t\(.key)")' "$RULES_JSON")"

while IFS=$'\t' read -r RULE_ID TEST_IDX; do
  [ -z "$RULE_ID" ] && continue

  TEST_NAME="$(jq -r --arg id "$RULE_ID" --argjson idx "$TEST_IDX" \
    '.[] | select(.id == $id) | .tests[$idx].name // ("test_" + ($idx | tostring))' \
    "$RULES_JSON")"

  EXPECTED_EXIT="$(jq -r --arg id "$RULE_ID" --argjson idx "$TEST_IDX" \
    '.[] | select(.id == $id) | .tests[$idx].expected_exit // 0' "$RULES_JSON")"

  EXPECTED_STDERR="$(jq -r --arg id "$RULE_ID" --argjson idx "$TEST_IDX" \
    '.[] | select(.id == $id) | .tests[$idx].expected_stderr_contains // ""' \
    "$RULES_JSON")"

  # Materialize input as JSON. The whole .input object is the tool_input
  # envelope expected by eval-rule.sh's parse-input.sh.
  INPUT="$(jq -c --arg id "$RULE_ID" --argjson idx "$TEST_IDX" \
    '.[] | select(.id == $id) | .tests[$idx].input' "$RULES_JSON")"

  # Capture stderr separately so we can grep it for expected_stderr_contains.
  STDERR_FILE="$(mktemp)"
  ACTUAL_EXIT=0
  printf '%s' "$INPUT" | bash "$EVAL_RULE" "$RULE_ID" 2>"$STDERR_FILE" || ACTUAL_EXIT=$?

  STATUS="PASS"
  REASON=""

  if [ "$ACTUAL_EXIT" != "$EXPECTED_EXIT" ]; then
    STATUS="FAIL"
    REASON="exit expected=$EXPECTED_EXIT actual=$ACTUAL_EXIT"
  elif [ -n "$EXPECTED_STDERR" ]; then
    if ! grep -qF -- "$EXPECTED_STDERR" "$STDERR_FILE"; then
      STATUS="FAIL"
      REASON="stderr did not contain '$EXPECTED_STDERR'"
    fi
  fi

  if [ "$STATUS" = "PASS" ]; then
    PASS=$((PASS + 1))
    echo "  PASS  ${RULE_ID} / ${TEST_NAME}"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL  ${RULE_ID} / ${TEST_NAME}  --  ${REASON}"
    FAIL_DETAILS+=("${RULE_ID}/${TEST_NAME}: ${REASON}")
  fi

  rm -f "$STDERR_FILE"
done <<< "$PAIRS"

# =============================================================================
# Standalone hook tests — pre-bash-stale-push.sh
#
# This hook lives outside the rules manifest because its predicate is shell
# logic (calls `git` to compute behind-by count), not a regex. Each case
# stages an isolated git repo in a tempdir so the test is hermetic — we
# never depend on the toolkit repo's own branch state.
# =============================================================================
STALE_HOOK="$HOOKS_DIR/pre-bash-stale-push.sh"

if [ -x "$STALE_HOOK" ]; then
  # Helper: spin up two work trees ("upstream" + local clone) with the local
  # clone's HEAD `$1` commits behind origin/main.
  # Returns the local clone path on stdout.
  setup_stale_repo() {
    local behind="$1"
    local base
    base="$(mktemp -d)"
    (
      # Upstream working tree — we'll push commits here to simulate develop
      # moving forward.
      mkdir -p "$base/upstream" "$base/local"
      cd "$base/upstream" || exit 1
      git init -q --initial-branch=main
      git config user.email t@t.t
      git config user.name t
      git commit -q --allow-empty -m "base"

      # Local clone — HEAD points at the same base commit
      cd "$base" || exit 1
      git clone -q upstream local >/dev/null 2>&1
      cd "$base/local" || exit 1
      git config user.email t@t.t
      git config user.name t
      git checkout -q -b feature
      git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main

      # Advance upstream by N commits, then fetch into local so origin/main
      # is N ahead of our feature HEAD.
      cd "$base/upstream" || exit 1
      local i=0
      while [ "$i" -lt "$behind" ]; do
        git commit -q --allow-empty -m "upstream-$i"
        i=$((i + 1))
      done
      cd "$base/local" || exit 1
      git fetch -q origin
    )
    echo "$base/local"
  }

  run_stale_case() {
    local name="$1" command="$2" behind="$3" expected_warn="$4"
    local repo input stderr_file exit_code
    repo="$(setup_stale_repo "$behind")"
    input="$(jq -nc --arg c "$command" '{tool_input:{command:$c}}')"
    stderr_file="$(mktemp)"
    exit_code=0
    (cd "$repo" && printf '%s' "$input" | bash "$STALE_HOOK") 2>"$stderr_file" || exit_code=$?

    local status="PASS" reason=""
    if [ "$exit_code" != "0" ]; then
      status="FAIL"; reason="exit expected=0 actual=$exit_code"
    elif [ "$expected_warn" = "yes" ]; then
      if ! grep -qF "[make-no-mistakes:stale-push]" "$stderr_file"; then
        status="FAIL"; reason="expected warning, got none"
      fi
    else
      if grep -qF "[make-no-mistakes:stale-push]" "$stderr_file"; then
        status="FAIL"; reason="expected silence, got warning"
      fi
    fi

    if [ "$status" = "PASS" ]; then
      PASS=$((PASS + 1))
      echo "  PASS  stale-push / ${name}"
    else
      FAIL=$((FAIL + 1))
      echo "  FAIL  stale-push / ${name}  --  ${reason}"
      FAIL_DETAILS+=("stale-push/${name}: ${reason}")
    fi

    # setup_stale_repo returns "$base/local" — clean up the parent so we
    # also remove the upstream sibling, not just the local clone.
    rm -rf "$(dirname "$repo")" "$stderr_file"
  }

  # Case A: not a push command — must exit silently, no warning
  run_stale_case "skips-non-push-command" "ls -la" 100 "no"

  # Case B: force-push but branch is only 1 commit behind (≤ threshold of 5) — silent
  run_stale_case "skips-push-within-threshold" "git push --force-with-lease" 1 "no"

  # Case C: force-push and branch is 10 commits behind (> threshold) — warn
  run_stale_case "warns-on-stale-force-push" "git push --force-with-lease" 10 "yes"

  # Case D: --dry-run should always skip even when stale
  run_stale_case "skips-dry-run" "git push --force-with-lease --dry-run" 20 "no"

  # Case E: -f short form should be detected
  run_stale_case "detects-short-form-f-flag" "git push -f origin feature" 8 "yes"

  # Case F: non-force push (no --force / --force-with-lease / -f) — silent
  run_stale_case "skips-non-force-push" "git push origin feature" 50 "no"
else
  echo "  SKIP  stale-push (hook not executable at $STALE_HOOK)"
fi

echo ""
TOTAL=$((PASS + FAIL))
echo "Results: ${PASS} / ${TOTAL} passed"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failures:"
  for line in "${FAIL_DETAILS[@]}"; do
    echo "  - $line"
  done
  exit 1
fi
exit 0

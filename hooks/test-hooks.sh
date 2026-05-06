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

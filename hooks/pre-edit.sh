#!/usr/bin/env bash
# =============================================================================
# pre-edit.sh — PreToolUse dispatcher for Edit, Write, and MultiEdit tools.
#
# Identical pattern to pre-bash.sh; selects rules whose `applies_to` matches
# any of Edit / Write / MultiEdit. The matcher in hooks.json (Edit|Write|
# MultiEdit) routes all three tool kinds to this single dispatcher.
# =============================================================================
set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
RULES_JSON="$HOOKS_DIR/rules/rules.json"
EVAL_RULE="$HOOKS_DIR/lib/eval-rule.sh"

if [ ! -f "$RULES_JSON" ] || ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT_RAW="$(cat)"

EXIT_CODE=0
while IFS= read -r RULE_ID; do
  [ -z "$RULE_ID" ] && continue
  if ! printf '%s' "$INPUT_RAW" | bash "$EVAL_RULE" "$RULE_ID"; then
    EXIT_CODE=2
  fi
done < <(jq -r '
  .[]
  | select(
      (.applies_to | index("Edit"))
      or (.applies_to | index("Write"))
      or (.applies_to | index("MultiEdit"))
    )
  | .id
' "$RULES_JSON")

exit "$EXIT_CODE"

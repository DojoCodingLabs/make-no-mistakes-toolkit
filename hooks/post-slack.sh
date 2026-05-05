#!/usr/bin/env bash
# =============================================================================
# post-slack.sh — PostToolUse dispatcher for Slack message tools.
#
# Same dispatcher pattern, but PostToolUse runs AFTER the tool already
# executed — the message has already been sent. We can only emit warnings
# for the next message, never block the one just sent. Therefore we ignore
# any `block` action returned by eval-rule and always exit 0. All stderr
# warnings still surface to the user.
#
# Rules targeting Slack should usually have `action: warn` in rules.yaml.
# A rule with `action: block` here will print its message but won't change
# the outcome — keep that in mind when authoring rules for `applies_to: [Slack]`.
# =============================================================================
set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
RULES_JSON="$HOOKS_DIR/rules/rules.json"
EVAL_RULE="$HOOKS_DIR/lib/eval-rule.sh"

if [ ! -f "$RULES_JSON" ] || ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT_RAW="$(cat)"

while IFS= read -r RULE_ID; do
  [ -z "$RULE_ID" ] && continue
  # Discard exit code — PostToolUse cannot block a tool call that already ran.
  printf '%s' "$INPUT_RAW" | bash "$EVAL_RULE" "$RULE_ID" || true
done < <(jq -r '.[] | select(.applies_to | index("Slack")) | .id' "$RULES_JSON")

exit 0

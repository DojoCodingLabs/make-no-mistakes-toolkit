#!/usr/bin/env bash
# =============================================================================
# pre-bash.sh — PreToolUse dispatcher for the Bash tool.
#
# Reads tool_input JSON from stdin once, captures the raw payload, then for
# each rule whose `applies_to` includes "Bash", invokes eval-rule.sh with the
# same payload. Aggregates exit codes: if ANY rule blocks, exit 2; otherwise
# exit 0. All stderr from rules is preserved.
#
# This is a THIN dispatcher — all rule logic lives in hooks/lib/eval-rule.sh
# and the rule definitions live in hooks/rules/rules.yaml (compiled to
# rules.json by scripts/build-rules.mjs). Adding a new Bash rule is editing
# rules.yaml + running `npm run build-rules`, never editing this file.
# =============================================================================
set -uo pipefail

# Honor the documented kill switch — CLAUDE_DISABLE_PLUGIN_HOOKS=1 lets a
# user temporarily bypass all manifest rules without uninstalling the plugin.
if [ "${CLAUDE_DISABLE_PLUGIN_HOOKS:-0}" = "1" ]; then
  exit 0
fi

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
RULES_JSON="$HOOKS_DIR/rules/rules.json"
EVAL_RULE="$HOOKS_DIR/lib/eval-rule.sh"

if [ ! -f "$RULES_JSON" ] || ! command -v jq >/dev/null 2>&1; then
  # Manifest missing or jq absent — fail open. The hook should never block
  # the user because of an installation issue with the plugin itself.
  exit 0
fi

# Capture stdin once. Each rule invocation re-pipes this same payload.
INPUT_RAW="$(cat)"

# Stale-push warning hook — runs alongside the manifest rule loop and shares
# the same stdin payload. It is warn-only by contract (never exits non-zero
# in a way that should abort the dispatcher), but we also guard with `|| true`
# so a future bug in that script cannot turn into a hard block here.
if [ -x "$HOOKS_DIR/pre-bash-stale-push.sh" ]; then
  printf '%s' "$INPUT_RAW" | "$HOOKS_DIR/pre-bash-stale-push.sh" || true
fi

EXIT_CODE=0
while IFS= read -r RULE_ID; do
  [ -z "$RULE_ID" ] && continue
  if ! printf '%s' "$INPUT_RAW" | bash "$EVAL_RULE" "$RULE_ID"; then
    EXIT_CODE=2
  fi
done < <(jq -r '.[] | select(.applies_to | index("Bash")) | .id' "$RULES_JSON")

exit "$EXIT_CODE"

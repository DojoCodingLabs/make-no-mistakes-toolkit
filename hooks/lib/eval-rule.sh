#!/usr/bin/env bash
# =============================================================================
# eval-rule.sh — Evaluate a single rule from rules.json against the current
# tool_input (read from stdin in JSON form).
#
# Usage:
#   printf '%s' "$TOOL_INPUT_JSON" | bash eval-rule.sh <rule_id>
#
# Exit codes:
#   0  rule did not fire, OR rule fired with action=warn (warning to stderr)
#   2  rule fired with action=block
#
# Behavior:
#   1. Source parse-input.sh to extract INPUT_COMMAND/FILE_PATH/CONTENT/TEXT
#      from the tool_input JSON on stdin.
#   2. Look up the rule by id in rules.json. Missing rule = exit 0 (no-op).
#   3. If the rule has a bypass_marker and "// hook-bypass: <marker>" or
#      "# hook-bypass: <marker>" appears anywhere in the raw input, exit 0.
#   4. For each match condition (AND-chain): check pattern (if present) and
#      not_pattern (if present) on the chosen field. If any condition fails,
#      the rule does not fire — exit 0.
#   5. All conditions held → write the rule message to stderr and exit
#      according to action.
#
# Requires: jq, grep (BRE/ERE — POSIX). No yaml parser at runtime.
# =============================================================================
set -uo pipefail

# Honor the documented kill switch — defense in depth. The dispatchers also
# check this, but eval-rule.sh may be invoked directly (e.g., from tests or
# future tooling) so we re-check here to guarantee the env var disables ALL
# rule evaluation regardless of entry point.
if [ "${CLAUDE_DISABLE_PLUGIN_HOOKS:-0}" = "1" ]; then
  exit 0
fi

RULE_ID="${1:?Usage: $0 <rule_id>}"
HOOKS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RULES_JSON="$HOOKS_DIR/rules/rules.json"

if [ ! -f "$RULES_JSON" ]; then
  # Missing manifest is a configuration error, not the user's fault. Surface it
  # quietly so we don't block tool calls because of a build issue.
  echo "make-no-mistakes: rules.json not found at $RULES_JSON" >&2
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "make-no-mistakes: jq not installed; hooks disabled" >&2
  exit 0
fi

# Source parse-input.sh from the same lib dir we live in.
LIB_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "$LIB_DIR/parse-input.sh"

# Resolve the rule. If not found, no-op.
RULE_JSON="$(jq --arg id "$RULE_ID" '.[] | select(.id == $id)' "$RULES_JSON")"
if [ -z "$RULE_JSON" ]; then
  exit 0
fi

# Bypass check first — a single explicit acknowledgement short-circuits all
# pattern matching. We accept both "//" and "#" comment styles since rules
# apply to commands (shell, #) and code/content (slash-slash).
#
# `build-rules.mjs` enforces bypass_marker matches ^[a-z0-9-]+$, so the
# value is safe to interpolate directly into an ERE. We re-validate here as
# defense in depth — if the schema gate ever loosens, an attacker rule
# author could otherwise inject ERE special chars (., +, [, etc.) and
# either silently mismatch real bypass comments or trigger a grep error.
BYPASS_MARKER="$(printf '%s' "$RULE_JSON" | jq -r '.bypass_marker // empty')"
if [ -n "$BYPASS_MARKER" ]; then
  case "$BYPASS_MARKER" in
    *[!a-z0-9-]*)
      echo "make-no-mistakes: rule ${RULE_ID} has invalid bypass_marker (must be kebab-case); ignoring bypass." >&2
      ;;
    *)
      if printf '%s' "$INPUT_RAW" | grep -qE "(//|#)[[:space:]]*hook-bypass:[[:space:]]*${BYPASS_MARKER}\b"; then
        exit 0
      fi
      ;;
  esac
fi

# Iterate match conditions. ALL must hold for the rule to fire.
N_CONDITIONS="$(printf '%s' "$RULE_JSON" | jq '.match | length')"
i=0
while [ "$i" -lt "$N_CONDITIONS" ]; do
  COND="$(printf '%s' "$RULE_JSON" | jq ".match[$i]")"
  FIELD="$(printf '%s' "$COND" | jq -r '.field')"
  PATTERN="$(printf '%s' "$COND" | jq -r '.pattern // empty')"
  NOT_PATTERN="$(printf '%s' "$COND" | jq -r '.not_pattern // empty')"
  FLAGS="$(printf '%s' "$COND" | jq -r '.flags // empty')"

  # Resolve which input variable to inspect.
  case "$FIELD" in
    command)    VALUE="$INPUT_COMMAND" ;;
    file_path)  VALUE="$INPUT_FILE_PATH" ;;
    content)    VALUE="$INPUT_CONTENT" ;;
    text)       VALUE="$INPUT_TEXT" ;;
    old_string) VALUE="$INPUT_OLD_STRING" ;;
    *)
      # Unknown field — treat as condition failure (rule won't fire).
      exit 0
      ;;
  esac

  # Build grep flags. -E always (we author rules in ERE). -q for silent.
  GREP_OPTS="-Eq"
  case "$FLAGS" in
    *i*) GREP_OPTS="-Eqi" ;;
  esac

  # Check positive pattern: if specified, value must match.
  if [ -n "$PATTERN" ]; then
    if ! printf '%s' "$VALUE" | grep $GREP_OPTS -- "$PATTERN"; then
      exit 0
    fi
  fi

  # Check negative pattern: if specified, value must NOT match.
  if [ -n "$NOT_PATTERN" ]; then
    if printf '%s' "$VALUE" | grep $GREP_OPTS -- "$NOT_PATTERN"; then
      exit 0
    fi
  fi

  i=$((i + 1))
done

# All conditions held — rule fires.
ACTION="$(printf '%s' "$RULE_JSON" | jq -r '.action')"
MESSAGE="$(printf '%s' "$RULE_JSON" | jq -r '.message')"

# Header makes it easy to grep stderr for which rule fired. We deliberately
# do NOT print memory_ref — that field references private personal-memory
# filenames (~/.claude/.../memory/feedback_*.md) that are meaningless to other
# users of this public toolkit. The rule_id is the canonical cross-link.
{
  echo ""
  echo "[make-no-mistakes:${RULE_ID}] action=${ACTION}"
  printf '%s' "$MESSAGE"
} >&2

case "$ACTION" in
  block) exit 2 ;;
  warn)  exit 0 ;;
  *)     exit 0 ;;
esac

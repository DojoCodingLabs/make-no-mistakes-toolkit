#!/usr/bin/env bash
# =============================================================================
# parse-input.sh — Read tool_input JSON from stdin and export field vars.
#
# Used by hooks/{pre-bash,pre-edit,post-slack}.sh dispatchers and the rule
# evaluator. Extracts the four fields rules can target:
#
#   INPUT_RAW        — the full JSON payload (lazily kept for bypass scan)
#   INPUT_COMMAND    — tool_input.command          (Bash)
#   INPUT_FILE_PATH  — tool_input.file_path        (Edit, Write, MultiEdit)
#   INPUT_CONTENT    — tool_input.content
#                       OR tool_input.new_string   (Edit/MultiEdit fall back)
#   INPUT_TEXT       — tool_input.text             (Slack)
#                       OR tool_input.message      (Slack draft)
#                       OR tool_input.content      (Slack canvas)
#
# Designed to be sourced, not executed:
#   source "${HOOKS_LIB:-$(dirname "$0")/lib}/parse-input.sh"
#
# Requires `jq`. If jq is missing, fields are left empty rather than failing
# the hook — a missing parser shouldn't block the user.
# =============================================================================

# Read full stdin once. Hooks read stdin exactly once per invocation, and we
# need the JSON available for both field extraction and bypass-marker scans.
INPUT_RAW="$(cat)"

INPUT_COMMAND=""
INPUT_FILE_PATH=""
INPUT_CONTENT=""
INPUT_TEXT=""
INPUT_OLD_STRING=""

if command -v jq >/dev/null 2>&1; then
  INPUT_COMMAND="$(printf '%s' "$INPUT_RAW" \
    | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
  INPUT_FILE_PATH="$(printf '%s' "$INPUT_RAW" \
    | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)"
  INPUT_CONTENT="$(printf '%s' "$INPUT_RAW" \
    | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null || true)"
  INPUT_TEXT="$(printf '%s' "$INPUT_RAW" \
    | jq -r '.tool_input.text // .tool_input.message // .tool_input.content // empty' 2>/dev/null || true)"
  # Edit / MultiEdit: expose tool_input.old_string. For MultiEdit, where
  # old_string lives inside an `edits[]` array, flatten every old_string
  # into a single newline-joined value so a single regex check covers
  # both shapes. Empty for non-Edit tool calls.
  INPUT_OLD_STRING="$(printf '%s' "$INPUT_RAW" \
    | jq -r '.tool_input.old_string // ([.tool_input.edits[]?.old_string | strings] | join("\n")) // empty' 2>/dev/null || true)"
fi

export INPUT_RAW INPUT_COMMAND INPUT_FILE_PATH INPUT_CONTENT INPUT_TEXT INPUT_OLD_STRING

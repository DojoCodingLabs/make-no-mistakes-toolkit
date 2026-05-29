#!/bin/bash
# Shared input parser for the cross-cutting PreToolUse hooks (DOJ-4571).
# Sourced — never executed directly. Populates the following globals in the
# caller's shell:
#
#   HOOK_INPUT_RAW   raw JSON received on stdin (cached)
#   TOOL_NAME        $.tool_name
#   FILE_PATH        $.tool_input.file_path
#   PROPOSED         Write→content, Edit→new_string, MultiEdit→\n-joined
#                    edits[].new_string
#
# Fail-open semantics: on missing `jq` or malformed JSON, the caller's
# script should exit 0 (warn-then-pass). This file sets all globals to
# empty in those cases and lets the caller decide how to react.
#
# Usage:
#   source "$(dirname "$0")/lib/jq-input.sh"
#   cc_parse_hook_input || exit 0   # fail-open
#
# Conventions: no `set -e` here (sourced into scripts that manage their own
# `set -u`); functions return non-zero on errors so callers can branch.

CC_JQ_INPUT_LOADED=1

# Read stdin once and cache. Subsequent calls reuse the cached value so
# multi-step extractors don't drain the pipe.
cc_read_stdin() {
  if [[ -z "${HOOK_INPUT_RAW:-}" ]]; then
    HOOK_INPUT_RAW="$(cat)"
  fi
}

# Populate TOOL_NAME, FILE_PATH, PROPOSED. Returns 0 on success.
# Returns 1 if jq is missing (caller should warn + exit 0).
# Returns 2 if jq parse fails on tool_name/file_path (caller should
# warn + exit 0).
cc_parse_hook_input() {
  TOOL_NAME=""
  FILE_PATH=""
  PROPOSED=""

  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi

  cc_read_stdin

  if [[ -z "$HOOK_INPUT_RAW" ]]; then
    return 2
  fi

  TOOL_NAME=$(printf '%s' "$HOOK_INPUT_RAW" | jq -r '.tool_name // empty' 2>/dev/null) || return 2
  FILE_PATH=$(printf '%s' "$HOOK_INPUT_RAW" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || return 2

  case "$TOOL_NAME" in
    Write)
      PROPOSED=$(printf '%s' "$HOOK_INPUT_RAW" | jq -r '.tool_input.content // empty' 2>/dev/null) || PROPOSED=""
      ;;
    Edit)
      PROPOSED=$(printf '%s' "$HOOK_INPUT_RAW" | jq -r '.tool_input.new_string // empty' 2>/dev/null) || PROPOSED=""
      ;;
    MultiEdit)
      PROPOSED=$(printf '%s' "$HOOK_INPUT_RAW" | jq -r '[.tool_input.edits[]?.new_string // empty] | join("\n")' 2>/dev/null) || PROPOSED=""
      ;;
    *)
      PROPOSED=""
      ;;
  esac

  return 0
}

# Convenience: returns 0 if a bypass marker is present anywhere in the
# raw hook input. Bypass syntax matches three common comment leaders so
# the marker can live in whichever comment shape the target file uses:
#
#   "# hook-bypass: <marker>"  — Bash / YAML / TOML / Python / SQL alt
#   "// hook-bypass: <marker>" — JS / TS / JSONC
#   "-- hook-bypass: <marker>" — SQL / Haskell / Lua
#
# The trailing terminator class accepts whitespace, end-of-string, a
# closing JSON quote, or a backslash. The backslash case matters because
# the hook input arrives as a JSON-serialized envelope: an embedded
# newline in tool_input.content is encoded as the literal two-char
# sequence "\n", so the bytes immediately after the marker look like
# "marker\n...". Without the backslash terminator, the regex would not
# match common usage where the bypass comment is followed by a newline.
cc_has_bypass_marker() {
  local marker="$1"
  [[ -z "$marker" ]] && return 1
  cc_read_stdin
  # ERE quoting note: backslash inside a bracket class needs to be escaped
  # to a literal "\" in the shell single-quoted regex.
  printf '%s' "$HOOK_INPUT_RAW" | grep -qE "(#|//|--)[[:space:]]*hook-bypass:[[:space:]]*${marker}([[:space:]\\\"]|$)"
}

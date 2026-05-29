#!/bin/bash
# Consumer-repo config loader for the cross-cutting PreToolUse hooks
# (DOJ-4571). Sourced — never executed directly.
#
# Populates:
#   CONFIG_FOUND     "1" if .claude/config/cross-cutting-hooks.json exists,
#                    "0" otherwise (caller should exit 0 — opt-in semantics)
#   CONFIG_JSON      raw JSON content of the config file, or "{}"
#   CONFIG_VERSION   the .version integer from the config, or 0
#
# Fail-open: missing jq, malformed JSON, or unsupported version → caller
# should warn-then-pass. Same convention as jq-input.sh.
#
# Repo-root detection order:
#   1. $CLAUDE_PROJECT_ROOT (set by Claude Code)
#   2. Walk up from $FILE_PATH's directory until a .git directory is found
#   3. Walk up from $PWD until a .git directory is found
#
# Usage:
#   source "$(dirname "$0")/lib/load-config.sh"
#   cc_load_config || exit 0   # fail-open
#   [[ "$CONFIG_FOUND" != "1" ]] && exit 0
#
# Optional helpers:
#   cc_surface_enabled <surface>        — 0 if .<surface>.enabled === true
#   cc_surface_defer_to_local <surface> — 0 if .<surface>.defer_to_local_hook === true

CC_LOAD_CONFIG_LOADED=1

CONFIG_FOUND="0"
CONFIG_JSON="{}"
CONFIG_VERSION=0
CONFIG_PATH=""

cc_find_repo_root() {
  local d
  if [[ -n "${CLAUDE_PROJECT_ROOT:-}" && -d "${CLAUDE_PROJECT_ROOT}/.git" ]]; then
    printf '%s' "$CLAUDE_PROJECT_ROOT"
    return 0
  fi

  if [[ -n "${FILE_PATH:-}" ]]; then
    d="$(dirname "$FILE_PATH")"
    while [[ "$d" != "/" && "$d" != "." && ! -d "$d/.git" ]]; do
      d="$(dirname "$d")"
    done
    if [[ -d "$d/.git" ]]; then
      printf '%s' "$d"
      return 0
    fi
  fi

  d="$PWD"
  while [[ "$d" != "/" && ! -d "$d/.git" ]]; do
    d="$(dirname "$d")"
  done
  if [[ -d "$d/.git" ]]; then
    printf '%s' "$d"
    return 0
  fi

  return 1
}

cc_load_config() {
  CONFIG_FOUND="0"
  CONFIG_JSON="{}"
  CONFIG_VERSION=0
  CONFIG_PATH=""

  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi

  local repo_root
  repo_root="$(cc_find_repo_root)" || return 0   # no repo root → opt-out
  CONFIG_PATH="${repo_root}/.claude/config/cross-cutting-hooks.json"

  if [[ ! -f "$CONFIG_PATH" ]]; then
    return 0   # file missing → CONFIG_FOUND stays "0", caller exits 0
  fi

  if ! CONFIG_JSON="$(cat "$CONFIG_PATH" 2>/dev/null)"; then
    return 2
  fi

  if ! printf '%s' "$CONFIG_JSON" | jq -e . >/dev/null 2>&1; then
    # Malformed JSON — emit a warning and fail-open
    echo "[cross-cutting-hooks] WARN: malformed config at ${CONFIG_PATH}; failing open." >&2
    CONFIG_JSON="{}"
    return 2
  fi

  CONFIG_VERSION=$(printf '%s' "$CONFIG_JSON" | jq -r '.version // 0' 2>/dev/null)
  if [[ "$CONFIG_VERSION" != "1" ]]; then
    echo "[cross-cutting-hooks] WARN: unsupported version=${CONFIG_VERSION} at ${CONFIG_PATH} (expected 1); failing open." >&2
    return 2
  fi

  CONFIG_FOUND="1"
  return 0
}

# Return 0 (true) if surface's .enabled is true, else 1.
cc_surface_enabled() {
  local surface="$1"
  local value
  value=$(printf '%s' "$CONFIG_JSON" | jq -r ".${surface}.enabled // false" 2>/dev/null)
  [[ "$value" == "true" ]]
}

# Return 0 (true) if surface's .defer_to_local_hook is true, else 1.
cc_surface_defer_to_local() {
  local surface="$1"
  local value
  value=$(printf '%s' "$CONFIG_JSON" | jq -r ".${surface}.defer_to_local_hook // false" 2>/dev/null)
  [[ "$value" == "true" ]]
}

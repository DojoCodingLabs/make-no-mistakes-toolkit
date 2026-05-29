#!/bin/bash
# Cure 4b cross-cutting hook (DOJ-4571 #1): block writes/edits to any
# config file that introduce `${...KEY|SECRET|TOKEN|PASSWORD|...}`
# placeholders without the cure-shape suffix (`_FILE`, `_PATH`, or
# per-repo extras).
#
# Generalized from
# dojo-agent-openclaw-plugin/.claude/hooks/pre-write-no-cleartext-secret-in-openclaw-json.sh
# (DOJ-4554). Scope expansion: any JSON/YAML/TOML/env config file (not
# just openclaw.json) — many runtimes substitute `${VAR}` at boot and
# write the SUBSTITUTED file back to disk, which leaks the secret to
# every subprocess and crash log.
#
# Surface: `cleartext_secrets` (see schemas/cross-cutting-hooks.schema.json)
# Bypass:  add `# hook-bypass: cross-cutting-cleartext-secret` or
#          `// hook-bypass: cross-cutting-cleartext-secret` to the proposed
#          content (typically a comment near the offending placeholder).
#
# Fail-open on missing jq, malformed input, missing/disabled config,
# `defer_to_local_hook: true`, or `CLAUDE_DISABLE_PLUGIN_HOOKS=1`.

set -u

HOOK_NAME="pre-write-no-cleartext-secret-in-config.sh"
BYPASS_MARKER="cross-cutting-cleartext-secret"
SURFACE="cleartext_secrets"

# Global kill-switch honored by all toolkit hooks.
if [[ "${CLAUDE_DISABLE_PLUGIN_HOOKS:-}" == "1" ]]; then
  exit 0
fi

LIB_DIR="$(dirname "$0")/lib"
# shellcheck source=lib/jq-input.sh
source "${LIB_DIR}/jq-input.sh"
# shellcheck source=lib/load-config.sh
source "${LIB_DIR}/load-config.sh"

if ! cc_parse_hook_input; then
  echo "[${HOOK_NAME}] WARN: input parse failed; failing open." >&2
  exit 0
fi

# Tool-name filter.
case "$TOOL_NAME" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

# Bypass marker honored before any other work.
if cc_has_bypass_marker "$BYPASS_MARKER"; then
  exit 0
fi

# Config gate: opt-in per repo + per surface.
cc_load_config || exit 0
[[ "$CONFIG_FOUND" != "1" ]] && exit 0
cc_surface_enabled "$SURFACE" || exit 0

if cc_surface_defer_to_local "$SURFACE"; then
  echo "[${HOOK_NAME}] info: defer_to_local_hook=true; local 4a hook owns this surface in this repo." >&2
  exit 0
fi

# File-path filter — config-shaped files only.
# Match basename suffixes: .json, .jsonc, .yaml, .yml, .toml
# Plus the conventional env-file patterns: .env, .env.*, *.env
case "$FILE_PATH" in
  *.json|*.jsonc|*.yaml|*.yml|*.toml) ;;
  */.env|*/.env.*|.env|.env.*|*.env) ;;
  *) exit 0 ;;
esac

if [[ -z "$PROPOSED" ]]; then
  exit 0
fi

# ─── Built-in high-impact secret patterns ───────────────────────────────────
# Tail patterns (must appear after an optional [A-Z_]* prefix and before an
# optional [A-Z0-9_]* suffix). Mirror the DOJ-4554 PR #266 review fixes for
# numbered/versioned secrets: ${DB_PASSWORD_1}, ${JWT_SECRET_V2}, etc.
BUILTIN_TAILS='SERVICE_ROLE|JWT_SECRET|PRIVATE_KEY|CLIENT_SECRET|ADMIN_TOKEN|PASSWORD|ENCRYPTION_KEY|SIGNING_SECRET'

# Per-repo extras (additive only — never removes built-ins).
EXTRA_PATTERNS_PIPE=""
if command -v jq >/dev/null 2>&1; then
  EXTRA_PATTERNS_PIPE=$(printf '%s' "$CONFIG_JSON" | jq -r "(.${SURFACE}.extra_block_patterns // []) | join(\"|\")" 2>/dev/null) || EXTRA_PATTERNS_PIPE=""
fi

TAILS="$BUILTIN_TAILS"
if [[ -n "$EXTRA_PATTERNS_PIPE" ]]; then
  TAILS="${TAILS}|${EXTRA_PATTERNS_PIPE}"
fi

# Quoting note (DOJ-4571 review P2 + P3, dojo-code-reviewer): use single
# quotes around the static literal part of the regex so backslashes pass
# straight through to grep without bash re-interpretation. The dynamic
# ${TAILS} group is interpolated via a separate double-quoted segment.
# This is significantly more readable than the previous quad-backslash
# escaping (\\\$\\{...) and matches the convention in the rest of the
# toolkit's bash codebase.
HIGH_IMPACT_RE='\$\{[A-Z_]*('"${TAILS}"')[A-Z0-9_]*\}'

# ─── Cure-shape suffixes (placeholders ending in these are OK) ──────────────
BUILTIN_SUFFIXES="_FILE|_PATH"
EXTRA_SUFFIXES_PIPE=""
if command -v jq >/dev/null 2>&1; then
  EXTRA_SUFFIXES_PIPE=$(printf '%s' "$CONFIG_JSON" | jq -r "(.${SURFACE}.extra_cure_suffixes // []) | join(\"|\")" 2>/dev/null) || EXTRA_SUFFIXES_PIPE=""
fi

CURE_SUFFIXES="$BUILTIN_SUFFIXES"
if [[ -n "$EXTRA_SUFFIXES_PIPE" ]]; then
  CURE_SUFFIXES="${CURE_SUFFIXES}|${EXTRA_SUFFIXES_PIPE}"
fi

# Same single-quote-plus-interpolation convention as HIGH_IMPACT_RE.
CURE_RE='('"${CURE_SUFFIXES}"')\}$'

# ─── Scan proposed content ──────────────────────────────────────────────────
MATCHES=""
if echo "$PROPOSED" | grep -qE "$HIGH_IMPACT_RE"; then
  ALL=$(echo "$PROPOSED" | grep -oE '\$\{[A-Z][A-Z0-9_]*\}')
  FILTERED=""
  while IFS= read -r tok; do
    [[ -z "$tok" ]] && continue
    if echo "$tok" | grep -qE "$HIGH_IMPACT_RE" && ! echo "$tok" | grep -qE "$CURE_RE"; then
      FILTERED="${FILTERED}${tok} "
    fi
  done <<<"$ALL"
  MATCHES=$(echo "$FILTERED" | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/  */ /g; s/^ //; s/ $//')
fi

if [[ -z "$MATCHES" ]]; then
  exit 0
fi

cat >&2 <<EOF
BLOCKED [${HOOK_NAME}]: config file write introduces \${...} placeholder(s)
that the runtime will substitute and write to disk in CLEARTEXT.

Attempted file: ${FILE_PATH}
Offending:      ${MATCHES}

Why this hook exists (DOJ-4571 / DOJ-4554 / DOJ-4208):
  Many runtimes (gateway boot, Helm renders, docker-compose, K8s
  ConfigMaps) substitute \${VAR} placeholders at startup from the
  process environment and persist the SUBSTITUTED file back to the
  container filesystem. Any secret referenced as a \${...} placeholder
  ends up readable by every subprocess and dumped into crash logs.

How to fix:
  - Use *_FILE / *_PATH placeholders that point at secret-volume mounts.
  - Read the secret at runtime with a small helper (e.g. readSecretFile()).
  - For non-secret placeholders (PUBLIC keys, URLs), explicitly allowlist
    them via .claude/config/cross-cutting-hooks.json → cleartext_secrets
    → extra_cure_suffixes, or rename to make the cure-shape obvious.

Bypass (use sparingly, comment why):
  Add "# hook-bypass: ${BYPASS_MARKER}" (or "// hook-bypass: ...") to the
  proposed content near the placeholder.

Defer to local 4a hook:
  Set cleartext_secrets.defer_to_local_hook = true in
  .claude/config/cross-cutting-hooks.json.
EOF

exit 2

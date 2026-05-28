#!/bin/bash
# Cure 4b cross-cutting hook (DOJ-4571 #3): enforce single-version-step
# bumps on any pinned dependency declared in the per-repo config.
#
# Generalized from
# dojo-agent-openclaw-plugin/.claude/hooks/pre-write-openclaw-version-bump-discipline.sh
# (DOJ-4554), which itself wraps scripts/check-openclaw-version-bump.sh
# (PR #220 / DOJ-4061). This 4b version is content-shape-agnostic: per-repo
# config names (a) which files are under discipline, (b) a regex to extract
# the version literal, and (c) a validator script that decides whether the
# step is acceptable.
#
# Surface: `version_bumps` (an array of entries; each entry has its own
#          defer_to_local_hook flag).
# Bypass:  `# hook-bypass: cross-cutting-version-bump`
#
# Old version is extracted from the git HEAD blob of the same path; new
# version from the proposed content. If both extract and differ, the
# named validator script is invoked: `<script> <old> <new> [extra_args...]`.
# Exit 2 from the script → block; exit 0 → pass; any other exit → warn +
# fail-open (defense in depth, never block on validator infrastructure).
#
# Fail-open on missing jq, missing git, malformed input, missing/disabled
# config, missing validator script, or `CLAUDE_DISABLE_PLUGIN_HOOKS=1`.

set -u

HOOK_NAME="pre-write-version-bump-discipline.sh"
BYPASS_MARKER="cross-cutting-version-bump"
SURFACE="version_bumps"

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

case "$TOOL_NAME" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

if cc_has_bypass_marker "$BYPASS_MARKER"; then
  exit 0
fi

cc_load_config || exit 0
[[ "$CONFIG_FOUND" != "1" ]] && exit 0

# version_bumps is an array; this surface has no top-level enabled/defer
# (the per-entry defer_to_local_hook handles the belt-and-braces).
ENTRIES_COUNT=$(printf '%s' "$CONFIG_JSON" | jq -r ".${SURFACE} | length // 0" 2>/dev/null)
ENTRIES_COUNT=${ENTRIES_COUNT:-0}
if [[ "$ENTRIES_COUNT" == "0" ]]; then
  exit 0
fi

# Locate repo root (needed to resolve validator paths + read HEAD blob).
REPO_ROOT="${CLAUDE_PROJECT_ROOT:-}"
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT/.git" ]]; then
  REPO_ROOT="$(cc_find_repo_root 2>/dev/null)" || REPO_ROOT=""
fi
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT/.git" ]]; then
  echo "[${HOOK_NAME}] WARN: cannot locate repo root; failing open." >&2
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  echo "[${HOOK_NAME}] WARN: git not on PATH; failing open." >&2
  exit 0
fi

# Find which entry (if any) matches FILE_PATH.
MATCH_IDX=""
MATCH_FILE_PATTERN=""
MATCH_VERSION_REGEX=""
MATCH_VALIDATOR=""
MATCH_VALIDATOR_ARGS_JSON="[]"
MATCH_DEFER="false"

for i in $(seq 0 $((ENTRIES_COUNT - 1))); do
  fp=$(printf '%s' "$CONFIG_JSON" | jq -r ".${SURFACE}[$i].file_pattern // empty" 2>/dev/null)
  [[ -z "$fp" ]] && continue
  # Match basename or trailing-component glob.
  case "$FILE_PATH" in
    */"$fp"|"$fp"|*"$fp")
      MATCH_IDX="$i"
      MATCH_FILE_PATTERN="$fp"
      MATCH_VERSION_REGEX=$(printf '%s' "$CONFIG_JSON" | jq -r ".${SURFACE}[$i].version_regex // empty" 2>/dev/null)
      MATCH_VALIDATOR=$(printf '%s' "$CONFIG_JSON" | jq -r ".${SURFACE}[$i].validator_script // empty" 2>/dev/null)
      MATCH_VALIDATOR_ARGS_JSON=$(printf '%s' "$CONFIG_JSON" | jq -c ".${SURFACE}[$i].validator_args // []" 2>/dev/null)
      MATCH_DEFER=$(printf '%s' "$CONFIG_JSON" | jq -r ".${SURFACE}[$i].defer_to_local_hook // false" 2>/dev/null)
      break
      ;;
  esac
done

if [[ -z "$MATCH_IDX" ]]; then
  exit 0
fi

if [[ "$MATCH_DEFER" == "true" ]]; then
  echo "[${HOOK_NAME}] info: defer_to_local_hook=true for entry ${MATCH_FILE_PATTERN}; local 4a hook owns this surface in this repo." >&2
  exit 0
fi

# Validator script must exist + be executable. Resolve relative to repo root.
VALIDATOR_ABS="$MATCH_VALIDATOR"
if [[ "$VALIDATOR_ABS" != /* ]]; then
  VALIDATOR_ABS="${REPO_ROOT}/${VALIDATOR_ABS}"
fi
if [[ ! -x "$VALIDATOR_ABS" ]]; then
  echo "[${HOOK_NAME}] WARN: validator missing or not executable at ${VALIDATOR_ABS}; failing open." >&2
  exit 0
fi

if [[ -z "$MATCH_VERSION_REGEX" ]]; then
  echo "[${HOOK_NAME}] WARN: empty version_regex for entry ${MATCH_FILE_PATTERN}; failing open." >&2
  exit 0
fi

# Extract NEW version from PROPOSED content.
# For Edit/MultiEdit, PROPOSED is the new_string only — typically enough for
# the version bump (the line containing the version literal is in the diff).
# For Write, PROPOSED is the full new file.
if [[ -z "$PROPOSED" ]]; then
  exit 0
fi

# Extract the first capture group from the first line that matches the
# user-supplied version_regex. We use bash native regex matching (`=~`)
# instead of sed, because the regex commonly contains `/` (URL paths) which
# would clash with sed's default `s/.../.../` delimiter. Bash =~ has no
# delimiter at all and exposes the captures via ${BASH_REMATCH[1]}.
NEW_VERSION=""
while IFS= read -r line; do
  if [[ "$line" =~ $MATCH_VERSION_REGEX ]]; then
    NEW_VERSION="${BASH_REMATCH[1]}"
    [[ -n "$NEW_VERSION" ]] && break
  fi
done <<<"$PROPOSED"

if [[ -z "$NEW_VERSION" ]]; then
  # No version literal in the proposed content → this edit isn't a version
  # bump; pass.
  exit 0
fi

# Extract OLD version from git HEAD blob of the same path (relative to repo root).
REL_PATH="$FILE_PATH"
case "$REL_PATH" in
  "$REPO_ROOT"/*) REL_PATH="${REL_PATH#${REPO_ROOT}/}" ;;
esac

OLD_BLOB=$(git -C "$REPO_ROOT" show "HEAD:${REL_PATH}" 2>/dev/null || true)
if [[ -z "$OLD_BLOB" ]]; then
  # File is new at HEAD — no version to compare against; pass.
  exit 0
fi

# Same bash =~ extraction as NEW_VERSION (avoids sed-delimiter clashes with
# regexes that contain `/`).
OLD_VERSION=""
while IFS= read -r line; do
  if [[ "$line" =~ $MATCH_VERSION_REGEX ]]; then
    OLD_VERSION="${BASH_REMATCH[1]}"
    [[ -n "$OLD_VERSION" ]] && break
  fi
done <<<"$OLD_BLOB"

if [[ -z "$OLD_VERSION" ]]; then
  # File at HEAD doesn't contain the version pattern — first introduction,
  # nothing to discipline; pass.
  exit 0
fi

if [[ "$OLD_VERSION" == "$NEW_VERSION" ]]; then
  # No change.
  exit 0
fi

# Delegate to validator. Build args array from JSON.
EXTRA_ARGS=()
while IFS= read -r arg; do
  [[ -z "$arg" ]] && continue
  EXTRA_ARGS+=("$arg")
done < <(printf '%s' "$MATCH_VALIDATOR_ARGS_JSON" | jq -r '.[]' 2>/dev/null)

set +e
"$VALIDATOR_ABS" "$OLD_VERSION" "$NEW_VERSION" "${EXTRA_ARGS[@]}"
VALIDATOR_EXIT=$?
set -e

case "$VALIDATOR_EXIT" in
  0)
    exit 0
    ;;
  2)
    cat >&2 <<EOF
BLOCKED [${HOOK_NAME}]: version bump rejected by validator.

Attempted file: ${FILE_PATH}
Old version:    ${OLD_VERSION}
New version:    ${NEW_VERSION}
Validator:      ${VALIDATOR_ABS}

The validator script returned exit 2 (block). See its stderr above for
the specific discipline violation and recommended remediation.

Why this hook exists (DOJ-4571 / DOJ-4554 / DOJ-4061):
  Multi-step version jumps in a single PR hide compatibility breaks
  inside an unreadable diff. The team's largest fix-forward chain
  (PR #218: v2026.4.10 → v2026.5.7, +6 PRs over 8 days,
  ~\$175/day Vertex anomaly) was exactly this failure. The validator
  exists to keep bumps to one step at a time.

Bypass (rare, justify in PR body):
  Add "# hook-bypass: ${BYPASS_MARKER}" to the proposed content.

Defer to local 4a hook:
  Set defer_to_local_hook = true on this entry in
  .claude/config/cross-cutting-hooks.json → version_bumps[].
EOF
    exit 2
    ;;
  *)
    echo "[${HOOK_NAME}] WARN: validator exited ${VALIDATOR_EXIT} (expected 0 or 2); failing open." >&2
    exit 0
    ;;
esac

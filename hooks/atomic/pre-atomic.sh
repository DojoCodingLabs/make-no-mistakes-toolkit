#!/usr/bin/env bash
# =============================================================================
# pre-atomic.sh — PreToolUse hook that enforces atomic-design ownership.
#
# Cure 4 of the 4-cure pattern for the DojoOS ownership-drift problem
# (premortem 2026-05-doj-3946-atomic-design-pillar-mapping). Where the
# manifest rules.yaml engine handles stateless single-file regex checks,
# this hook adds:
#
#   - per-repo configurable taxonomy (.atomic-design-rules.json)
#   - cross-pillar import detection (file_path + content combined)
#   - junk-drawer write detection
#   - plural/singular canonical-form blocking
#   - atomic-level statelessness enforcement (atoms must be stateless)
#
# The hook is a NO-OP unless the consumer repo has dropped a
# `.atomic-design-rules.json` at its root. This way, installing the toolkit
# never breaks repos that haven't opted in.
#
# Exit codes:
#   0  — no violation, OR config absent (no-op), OR bypass marker present
#   2  — violation detected; tool call is blocked
#
# Requires: bash, jq, grep. POSIX-only flags (no GNU-specific options) so
# the hook works on Linux, macOS, and Windows/Git-Bash.
# =============================================================================
set -uo pipefail

# Documented kill switch.
if [ "${CLAUDE_DISABLE_PLUGIN_HOOKS:-0}" = "1" ]; then
  exit 0
fi

HOOKS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LIB_DIR="$HOOKS_DIR/lib"

# parse-input.sh consumes stdin and exports INPUT_FILE_PATH / INPUT_CONTENT
# / INPUT_RAW. We rely on it so the dispatcher remains consistent across all
# hooks in this toolkit.
if [ ! -f "$LIB_DIR/parse-input.sh" ]; then
  exit 0
fi
# shellcheck source=/dev/null
source "$LIB_DIR/parse-input.sh"

if ! command -v jq >/dev/null 2>&1; then
  # No jq → fail open. We never block on toolkit installation problems.
  exit 0
fi

# -----------------------------------------------------------------------------
# Locate the consumer's .atomic-design-rules.json by walking up from the
# target file path. Fall back to $PWD if the file path is absent or absolute
# but outside any rules-config tree. If the config never appears, no-op.
# -----------------------------------------------------------------------------
find_config() {
  local start="$1"
  local dir
  if [ -z "$start" ]; then
    start="$PWD"
  fi
  # If start is a file or doesn't exist yet (Write creates new files), use
  # its parent directory as the search anchor.
  if [ -d "$start" ]; then
    dir="$start"
  else
    dir="$(dirname "$start")"
  fi
  # Defense: if dirname returned ".", normalize to PWD so we don't infinite
  # loop at relative path "." → "." (some bash builds keep "." as parent).
  case "$dir" in
    .|"") dir="$PWD" ;;
  esac
  while [ "$dir" != "/" ] && [ -n "$dir" ]; do
    if [ -f "$dir/.atomic-design-rules.json" ]; then
      printf '%s' "$dir/.atomic-design-rules.json"
      return 0
    fi
    local parent
    parent="$(dirname "$dir")"
    if [ "$parent" = "$dir" ]; then
      break
    fi
    dir="$parent"
  done
  return 1
}

CONFIG_PATH="$(find_config "$INPUT_FILE_PATH" || true)"
if [ -z "$CONFIG_PATH" ] || [ ! -f "$CONFIG_PATH" ]; then
  exit 0
fi

# Validate config is parseable JSON. A broken config should warn (not block).
if ! jq empty "$CONFIG_PATH" 2>/dev/null; then
  echo "make-no-mistakes:atomic: ${CONFIG_PATH} is not valid JSON; atomic-design hook disabled" >&2
  exit 0
fi

# Repo root is the directory containing the config.
REPO_ROOT="$(dirname "$CONFIG_PATH")"

# Normalize the target file path to repo-relative form. Edit/Write may pass
# absolute or relative; we want a single canonical form for prefix matching.
TARGET_PATH="$INPUT_FILE_PATH"
case "$TARGET_PATH" in
  "$REPO_ROOT"/*)
    TARGET_PATH="${TARGET_PATH#"$REPO_ROOT"/}"
    ;;
  /*)
    # Absolute path outside the repo — out of scope.
    exit 0
    ;;
esac

# No file path → can't enforce; no-op.
if [ -z "$TARGET_PATH" ]; then
  exit 0
fi

# -----------------------------------------------------------------------------
# Exempt-marker check. If the content contains `// @atomic-exempt: <reason>`
# or `# @atomic-exempt: <reason>`, skip enforcement. The reason text is for
# code reviewers, not for the hook — we don't validate it.
# -----------------------------------------------------------------------------
EXEMPT_MARKERS="$(jq -r '
  (.exempt_markers // ["@atomic-exempt"]) | .[]
' "$CONFIG_PATH")"
while IFS= read -r MARKER; do
  [ -z "$MARKER" ] && continue
  # Escape regex specials in the marker. jq schema constrains markers to
  # ^[a-z@][a-z0-9_-]*$ so only `@` and `-` need escaping for ERE, but we
  # quote defensively.
  ESCAPED_MARKER="$(printf '%s' "$MARKER" | sed 's/[][\.^$()*+?{|/@]/\\&/g')"
  if printf '%s' "$INPUT_CONTENT" | grep -qE "(//|#)[[:space:]]*${ESCAPED_MARKER}:" 2>/dev/null; then
    exit 0
  fi
done <<< "$EXEMPT_MARKERS"

RULES_DOC_URL="$(jq -r '.rules_doc_url // ""' "$CONFIG_PATH")"
COMPONENTS_ROOT="$(jq -r '.components_root // "src/components"' "$CONFIG_PATH")"

# Only enforce on files under components_root. Edits elsewhere are out of
# scope for atomic-design ownership.
case "$TARGET_PATH" in
  "$COMPONENTS_ROOT"/*) : ;;
  *) exit 0 ;;
esac

# Emit a violation header + message and exit 2. Idempotent shape so the
# user can grep stderr for the rule id.
emit_violation() {
  local rule_id="$1"
  local canonical="$2"
  local message="$3"
  {
    echo ""
    echo "[make-no-mistakes:atomic:${rule_id}] action=block"
    echo "  target:    ${TARGET_PATH}"
    if [ -n "$canonical" ]; then
      echo "  canonical: ${canonical}"
    fi
    if [ -n "$RULES_DOC_URL" ]; then
      echo "  docs:      ${RULES_DOC_URL}"
    fi
    echo ""
    printf '%s\n' "$message"
    echo ""
    echo "To override (with reviewer approval): add a comment to the file:"
    echo "  // @atomic-exempt: <reason>"
  } >&2
}

# -----------------------------------------------------------------------------
# Rule 1: canonical_folders — plural/singular drift.
# Block if the target path starts with any 'wrong' segment.
# -----------------------------------------------------------------------------
N_CANONICAL="$(jq '.canonical_folders | length // 0' "$CONFIG_PATH")"
i=0
while [ "$i" -lt "$N_CANONICAL" ]; do
  WRONG="$(jq -r ".canonical_folders[$i].wrong" "$CONFIG_PATH")"
  CANONICAL="$(jq -r ".canonical_folders[$i].canonical" "$CONFIG_PATH")"
  REASON="$(jq -r ".canonical_folders[$i].reason // \"\"" "$CONFIG_PATH")"
  # Anchor with trailing slash to avoid prefix collisions
  # (e.g. 'src/components/course' vs 'src/components/course-list').
  case "$TARGET_PATH" in
    "$WRONG"/*)
      MSG="Path uses the NON-canonical folder '${WRONG}'."
      [ -n "$REASON" ] && MSG="${MSG} Reason: ${REASON}."
      MSG="${MSG}
Move the file to the canonical location: ${CANONICAL}/"
      emit_violation "canonical-folder" "${CANONICAL}/" "$MSG"
      exit 2
      ;;
  esac
  i=$((i + 1))
done

# -----------------------------------------------------------------------------
# Rule 2: junk_drawers — files written directly to a known junk-drawer
# folder (no deeper sub-pillar). Writes to sub-folders are allowed.
# -----------------------------------------------------------------------------
N_JUNK="$(jq '.junk_drawers | length // 0' "$CONFIG_PATH")"
i=0
while [ "$i" -lt "$N_JUNK" ]; do
  JUNK_FOLDER="$(jq -r ".junk_drawers[$i].folder" "$CONFIG_PATH")"
  JUNK_MSG="$(jq -r ".junk_drawers[$i].message // \"\"" "$CONFIG_PATH")"
  # Match files DIRECTLY under the junk folder. e.g. for junk
  # 'src/components/dashboard', block 'src/components/dashboard/Foo.tsx'
  # but allow 'src/components/dashboard/score/Foo.tsx'.
  case "$TARGET_PATH" in
    "$JUNK_FOLDER"/*/*)
      # Has a sub-folder → allowed.
      ;;
    "$JUNK_FOLDER"/*)
      if [ -z "$JUNK_MSG" ]; then
        JUNK_MSG="'${JUNK_FOLDER}/' is a known junk-drawer folder. Place the file under its owning pillar instead."
      fi
      emit_violation "junk-drawer" "" "$JUNK_MSG"
      exit 2
      ;;
  esac
  i=$((i + 1))
done

# -----------------------------------------------------------------------------
# Rule 3: atomic_levels.atoms — atoms must be stateless.
# Block when content under */atoms/* matches any forbidden pattern.
# (Other atomic levels are configurable but default to no content rules.)
# -----------------------------------------------------------------------------
LEVELS="$(jq -r '
  (.atomic_levels // {}) | to_entries | .[] | "\(.key)\t\(.value.folder)\t\(.value.forbid_message // "Content violates atomic-design constraints for this level.")"
' "$CONFIG_PATH")"
while IFS=$'\t' read -r LEVEL_KEY LEVEL_FOLDER LEVEL_MSG; do
  [ -z "$LEVEL_KEY" ] && continue
  [ "$LEVEL_FOLDER" = "null" ] && continue
  # Detect target inside */<level_folder>/* anywhere under components_root.
  case "$TARGET_PATH" in
    */"$LEVEL_FOLDER"/*)
      # Look up patterns for this level.
      N_PATTERNS="$(jq ".atomic_levels.${LEVEL_KEY}.forbid_content_patterns | length // 0" "$CONFIG_PATH")"
      p=0
      while [ "$p" -lt "$N_PATTERNS" ]; do
        PATTERN="$(jq -r ".atomic_levels.${LEVEL_KEY}.forbid_content_patterns[$p]" "$CONFIG_PATH")"
        if [ -n "$PATTERN" ] && printf '%s' "$INPUT_CONTENT" | grep -qE -- "$PATTERN" 2>/dev/null; then
          MSG="Forbidden pattern '${PATTERN}' detected in a file written to the '${LEVEL_KEY}' atomic level.

${LEVEL_MSG}"
          emit_violation "atomic-level-${LEVEL_KEY}" "" "$MSG"
          exit 2
        fi
        p=$((p + 1))
      done
      ;;
  esac
done <<< "$LEVELS"

# -----------------------------------------------------------------------------
# Rule 4: cross-pillar imports.
# When writing into pillar X, block any `import ... from "@/components/<Y>/..."`
# where Y is a different pillar AND Y is not in shared_pillars.
# Uses content scan with the pillar list from config.
# -----------------------------------------------------------------------------
# Identify the target's pillar by matching the second segment under
# components_root (e.g. src/components/dojo-score/... → pillar 'dojo-score').
TARGET_PILLAR=""
# Strip the components_root prefix and grab the first remaining segment.
REL_UNDER_ROOT="${TARGET_PATH#"$COMPONENTS_ROOT"/}"
TARGET_PILLAR_CANDIDATE="${REL_UNDER_ROOT%%/*}"

# Confirm the candidate matches a declared pillar folder.
if [ -n "$TARGET_PILLAR_CANDIDATE" ] && [ "$TARGET_PILLAR_CANDIDATE" != "$REL_UNDER_ROOT" ]; then
  TARGET_PILLAR="$(jq -r --arg f "$TARGET_PILLAR_CANDIDATE" '
    .pillars[]? | select(.folder == $f) | .slug
  ' "$CONFIG_PATH")"
fi

if [ -n "$TARGET_PILLAR" ] && [ -n "$INPUT_CONTENT" ]; then
  # Build list of OTHER pillar folders (not the target's, not shared).
  OTHER_FOLDERS="$(jq -r --arg target "$TARGET_PILLAR" '
    (.shared_pillars // []) as $shared
    | .pillars[]?
    | select(.slug != $target)
    | select((.slug as $s | $shared | index($s)) | not)
    | .folder
  ' "$CONFIG_PATH")"

  while IFS= read -r OTHER_FOLDER; do
    [ -z "$OTHER_FOLDER" ] && continue
    # Scan content for `from "@/components/<other>/..."` or
    # `from "@/components/<other>"` imports. POSIX ERE — no lookaround.
    if printf '%s' "$INPUT_CONTENT" \
      | grep -qE "from[[:space:]]+[\"']@/${COMPONENTS_ROOT##*/}/${OTHER_FOLDER}(/|[\"'])" 2>/dev/null; then
      OWNER="$(jq -r --arg f "$OTHER_FOLDER" '.pillars[]? | select(.folder == $f) | .owner // ""' "$CONFIG_PATH")"
      SHARED_LIST="$(jq -r '(.shared_pillars // []) | join(", ")' "$CONFIG_PATH")"
      MSG="Cross-pillar import detected: file under pillar '${TARGET_PILLAR}' imports from pillar '${OTHER_FOLDER}' (${OWNER:-unknown owner}).

Cross-pillar imports must go through a shared pillar (${SHARED_LIST:-platform}).
Either:
  1. Move the imported component into a shared pillar, or
  2. Duplicate the small piece you need (rule of three), or
  3. Add '// @atomic-exempt: <reason>' if the coupling is intentional."
      emit_violation "cross-pillar-import" "" "$MSG"
      exit 2
    fi
  done <<< "$OTHER_FOLDERS"
fi

exit 0

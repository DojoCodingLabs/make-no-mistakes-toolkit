#!/usr/bin/env bash
# =============================================================================
# post-atomic-drift.sh — PostToolUse drift telemetry for atomic-design pillars.
#
# Runs after Edit/Write/MultiEdit/NotebookEdit completes. Never blocks. Emits
# warnings to stderr when accumulating-drift signals exceed configured
# thresholds:
#
#   - organisms per pillar > max_organisms_per_pillar
#   - files at the root of a pillar folder > max_root_files_per_pillar
#   - file with "Public*" prefix older than public_prefix_stale_days
#   - duplicate filenames across pillars (e.g. BadgeCard.tsx in two pillars)
#
# Performance budget: < 500ms per call. Achieved by scoping every scan to the
# pillar of the file just written — never traversing the whole repo. If
# config absent, the hook is a no-op.
#
# Exit code is always 0 (PostToolUse can't block; the tool already ran).
# =============================================================================
set -uo pipefail

if [ "${CLAUDE_DISABLE_PLUGIN_HOOKS:-0}" = "1" ]; then
  exit 0
fi

HOOKS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LIB_DIR="$HOOKS_DIR/lib"

if [ ! -f "$LIB_DIR/parse-input.sh" ] || ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

# shellcheck source=/dev/null
source "$LIB_DIR/parse-input.sh"

# Locate consumer config (same algorithm as pre-atomic.sh).
find_config() {
  local start="$1"
  local dir
  if [ -z "$start" ]; then
    start="$PWD"
  fi
  if [ -d "$start" ]; then
    dir="$start"
  else
    dir="$(dirname "$start")"
  fi
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
if [ -z "$CONFIG_PATH" ] || [ ! -f "$CONFIG_PATH" ] || ! jq empty "$CONFIG_PATH" 2>/dev/null; then
  exit 0
fi

REPO_ROOT="$(dirname "$CONFIG_PATH")"
COMPONENTS_ROOT="$(jq -r '.components_root // "src/components"' "$CONFIG_PATH")"
COMPONENTS_ABS="$REPO_ROOT/$COMPONENTS_ROOT"

if [ ! -d "$COMPONENTS_ABS" ]; then
  exit 0
fi

# Normalize TARGET_PATH to repo-relative.
TARGET_PATH="$INPUT_FILE_PATH"
case "$TARGET_PATH" in
  "$REPO_ROOT"/*) TARGET_PATH="${TARGET_PATH#"$REPO_ROOT"/}" ;;
esac

# Only run drift checks when the write touched components_root. Cheap guard
# so non-component writes don't pay the scan cost.
case "$TARGET_PATH" in
  "$COMPONENTS_ROOT"/*) : ;;
  *) exit 0 ;;
esac

REL_UNDER_ROOT="${TARGET_PATH#"$COMPONENTS_ROOT"/}"
TARGET_PILLAR_FOLDER="${REL_UNDER_ROOT%%/*}"

if [ -z "$TARGET_PILLAR_FOLDER" ] || [ "$TARGET_PILLAR_FOLDER" = "$REL_UNDER_ROOT" ]; then
  exit 0
fi

PILLAR_DIR="$COMPONENTS_ABS/$TARGET_PILLAR_FOLDER"
if [ ! -d "$PILLAR_DIR" ]; then
  exit 0
fi

# Resolve thresholds with defaults.
MAX_ORGANISMS="$(jq -r '.drift_thresholds.max_organisms_per_pillar // 100' "$CONFIG_PATH")"
MAX_ROOT_FILES="$(jq -r '.drift_thresholds.max_root_files_per_pillar // 5' "$CONFIG_PATH")"
STALE_DAYS="$(jq -r '.drift_thresholds.public_prefix_stale_days // 30' "$CONFIG_PATH")"

# Pillar-specific override for max_organisms, if present.
PILLAR_MAX_ORGANISMS="$(jq -r --arg f "$TARGET_PILLAR_FOLDER" '
  .pillars[]? | select(.folder == $f) | .max_organisms // empty
' "$CONFIG_PATH")"
if [ -n "$PILLAR_MAX_ORGANISMS" ] && [ "$PILLAR_MAX_ORGANISMS" != "null" ]; then
  MAX_ORGANISMS="$PILLAR_MAX_ORGANISMS"
fi

ATOMS_FOLDER="$(jq -r '.atomic_levels.atoms.folder // "atoms"' "$CONFIG_PATH")"
MOLECULES_FOLDER="$(jq -r '.atomic_levels.molecules.folder // "molecules"' "$CONFIG_PATH")"
ORGANISMS_FOLDER="$(jq -r '.atomic_levels.organisms.folder // "organisms"' "$CONFIG_PATH")"
TEMPLATES_FOLDER="$(jq -r '.atomic_levels.templates.folder // "templates"' "$CONFIG_PATH")"

warn() {
  local rule_id="$1"
  local message="$2"
  {
    echo ""
    echo "[make-no-mistakes:atomic-drift:${rule_id}] action=warn pillar=${TARGET_PILLAR_FOLDER}"
    printf '%s\n' "$message"
  } >&2
}

# -----------------------------------------------------------------------------
# Drift 1: organisms count per pillar.
# Counts *.tsx / *.ts / *.jsx / *.js files under the pillar's organisms/
# folder (any depth).
# -----------------------------------------------------------------------------
ORG_DIR="$PILLAR_DIR/$ORGANISMS_FOLDER"
if [ -d "$ORG_DIR" ]; then
  ORG_COUNT="$(find "$ORG_DIR" -type f \( -name '*.tsx' -o -name '*.ts' -o -name '*.jsx' -o -name '*.js' \) 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$ORG_COUNT" -gt "$MAX_ORGANISMS" ]; then
    warn "organisms-cap-exceeded" \
"Pillar '${TARGET_PILLAR_FOLDER}' has ${ORG_COUNT} organisms (threshold: ${MAX_ORGANISMS}).
Large organism counts are a strong signal of accumulating drift (DOJ-3946).
Consider:
  - splitting the pillar
  - promoting reusable organisms to templates
  - moving truly cross-cutting pieces to a shared pillar"
  fi
fi

# -----------------------------------------------------------------------------
# Drift 2: files at the root of the pillar folder (no atomic subfolder).
# Counts files DIRECTLY under the pillar folder, excluding the known atomic
# subfolders and index files.
# -----------------------------------------------------------------------------
# Use -maxdepth 1 and exclude obvious metadata files. POSIX find supports
# -maxdepth on Linux/Mac/Git-Bash.
ROOT_COUNT="$(find "$PILLAR_DIR" -maxdepth 1 -type f \
  \( -name '*.tsx' -o -name '*.ts' -o -name '*.jsx' -o -name '*.js' \) \
  ! -name 'index.ts' ! -name 'index.tsx' ! -name 'index.js' ! -name 'index.jsx' \
  2>/dev/null | wc -l | tr -d ' ')"
if [ "$ROOT_COUNT" -gt "$MAX_ROOT_FILES" ]; then
  warn "pillar-root-flat" \
"Pillar '${TARGET_PILLAR_FOLDER}' has ${ROOT_COUNT} files directly at its root (threshold: ${MAX_ROOT_FILES}).
A pillar should use atomic subfolders: ${ATOMS_FOLDER}/, ${MOLECULES_FOLDER}/, ${ORGANISMS_FOLDER}/, ${TEMPLATES_FOLDER}/.
Flat pillars become unsearchable and lose ownership clarity."
fi

# -----------------------------------------------------------------------------
# Drift 3: stale Public* prefix files.
# A Public* file older than STALE_DAYS is a canonical-URL drift signal
# (per DOJ-4064): if you needed a "Public" prefix, you probably needed to
# consolidate the route instead. Uses mtime as a proxy — git mtime would
# be more accurate but adds latency.
# -----------------------------------------------------------------------------
STALE_FILES="$(find "$PILLAR_DIR" -type f -name 'Public*' \
  \( -name '*.tsx' -o -name '*.ts' -o -name '*.jsx' -o -name '*.js' \) \
  -mtime "+$STALE_DAYS" 2>/dev/null | head -5)"
if [ -n "$STALE_FILES" ]; then
  warn "public-prefix-stale" \
"Stale 'Public*' files in pillar '${TARGET_PILLAR_FOLDER}' (untouched > ${STALE_DAYS} days):
${STALE_FILES}

Public-prefixed components are usually a sign of a missing canonical-URL
consolidation (DOJ-4064). Consider merging the Public* and private
variants behind a single route with auth-aware rendering."
fi

# -----------------------------------------------------------------------------
# Drift 4: duplicate filenames across pillars.
# Bounded scan: look at the just-written file's basename, then check whether
# any OTHER pillar contains a file with the same basename. Avoids whole-repo
# scans by limiting to direct children of components_root.
# -----------------------------------------------------------------------------
BASENAME="$(basename "$TARGET_PATH")"
case "$BASENAME" in
  index.ts|index.tsx|index.js|index.jsx|README.md|"") : ;;
  *.tsx|*.ts|*.jsx|*.js)
    # Get list of pillar folders from config.
    OTHER_PILLAR_FOLDERS="$(jq -r --arg f "$TARGET_PILLAR_FOLDER" '
      .pillars[]? | select(.folder != $f) | .folder
    ' "$CONFIG_PATH")"
    DUPLICATES=""
    while IFS= read -r OTHER_FOLDER; do
      [ -z "$OTHER_FOLDER" ] && continue
      OTHER_DIR="$COMPONENTS_ABS/$OTHER_FOLDER"
      [ ! -d "$OTHER_DIR" ] && continue
      HITS="$(find "$OTHER_DIR" -type f -name "$BASENAME" 2>/dev/null | head -3)"
      if [ -n "$HITS" ]; then
        if [ -z "$DUPLICATES" ]; then
          DUPLICATES="$HITS"
        else
          DUPLICATES="$DUPLICATES
$HITS"
        fi
      fi
    done <<< "$OTHER_PILLAR_FOLDERS"
    if [ -n "$DUPLICATES" ]; then
      warn "duplicate-filename-cross-pillar" \
"Filename '${BASENAME}' also exists in other pillars:
${DUPLICATES}

Duplicate filenames across pillars cause import ambiguity and signal
either (a) genuine cross-pillar shared code that belongs in a shared
pillar, or (b) accidental forks that have diverged. Consolidate or
disambiguate by renaming (e.g. ScoreBadgeCard.tsx / PathwayBadgeCard.tsx)."
    fi
    ;;
esac

exit 0

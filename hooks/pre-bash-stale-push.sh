#!/usr/bin/env bash
# =============================================================================
# pre-bash-stale-push.sh — Warn when force-pushing a branch that is far behind
# its base (likely to fail CI because the base moved).
#
# Reads the Bash tool's tool_input JSON from stdin (same convention as
# pre-bash.sh), extracts .command, and if it looks like a force push,
# computes how many commits the local HEAD is behind the resolved base
# (origin/HEAD → develop → main → master). If the gap exceeds the threshold,
# emits a multi-line warning to stderr and exits 0.
#
# This hook is WARN-ONLY by design — it never blocks. Force-pushing a stale
# branch is sometimes the correct action (e.g. intentionally diverging fork).
# The hook surfaces the risk; the human decides.
#
# Motivating incident: 2026-05-20 — DOJ-4134 atomic migration moved
# src/components/agent/ChatWidget.tsx. PRs #2105, #2107, #1713 in dojo-os
# each spent ~10 min diagnosing the same ENOENT failure that a 30-second
# rebase resolved.
# =============================================================================
set -uo pipefail

# Threshold: behind > N triggers the warning. Override with env var if you
# want to tune sensitivity per-developer; 5 is conservative enough that the
# noise floor is low while still catching real drift windows.
THRESHOLD="${MAKE_NO_MISTAKES_STALE_THRESHOLD:-5}"

# Capture stdin (the Bash tool_input JSON).
INPUT_RAW="$(cat)"

# If jq is missing, we can't parse the command — fail open silently. The
# user shouldn't be blocked by our installation issues.
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

COMMAND="$(printf '%s' "$INPUT_RAW" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
if [ -z "$COMMAND" ]; then
  exit 0
fi

# Detect force-push variants:
#   git push ... --force-with-lease (any form, with or without =refname)
#   git push ... --force
#   git push ... -f (short form, word-boundary so -fwd-style flags don't match)
# Skip --dry-run since the user is explicitly previewing, not pushing.
if printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])--dry-run([[:space:]]|$|=)'; then
  exit 0
fi

if ! printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])git[[:space:]]+push\b'; then
  exit 0
fi

if ! printf '%s' "$COMMAND" | grep -qE '(--force-with-lease|--force|(^|[[:space:]])-f([[:space:]]|$))'; then
  exit 0
fi

# Resolve base branch. Prefer origin's HEAD symbolic ref; fall back to a
# fixed candidate list. If none exist, exit 0 — we can't help.
BASE=""

if SYMREF="$(git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null)"; then
  # SYMREF is like "origin/develop"; strip "origin/" prefix.
  BASE="${SYMREF#origin/}"
fi

if [ -z "$BASE" ]; then
  # Fall back to first existing remote ref. Order matters — develop wins
  # over main when both exist (most active repos in this org use develop).
  for candidate in develop main master; do
    if git show-ref --verify --quiet "refs/remotes/origin/${candidate}"; then
      BASE="$candidate"
      break
    fi
  done
fi

if [ -z "$BASE" ]; then
  exit 0
fi

# Compute behind count. If git fails (not in a repo, no fetch yet, etc.),
# silently exit 0 — we never want this hook to be noisy on unrelated repos.
BEHIND="$(git rev-list --count "HEAD..origin/${BASE}" 2>/dev/null || true)"

# Guard against empty / non-numeric results from git (e.g. "fatal: ...").
case "$BEHIND" in
  ''|*[!0-9]*) exit 0 ;;
esac

if [ "$BEHIND" -le "$THRESHOLD" ]; then
  exit 0
fi

# Fired. Multi-line warning to stderr; exit 0 (warn-only, never blocks).
{
  echo ""
  echo "[make-no-mistakes:stale-push] WARNING"
  echo "You're force-pushing a branch that is ${BEHIND} commits behind origin/${BASE}."
  echo ""
  echo "CI failures on this push are likely if any of those ${BEHIND} commits touched"
  echo "files your branch also touches (test paths moved, exports renamed, etc.)."
  echo ""
  echo "Suggested: cancel this push, then run:"
  echo "  git fetch origin ${BASE}"
  echo "  git rebase origin/${BASE}"
  echo "  git push --force-with-lease"
  echo ""
  echo "Or push as-is and accept the risk. This is a warning, not a block."
} >&2

exit 0

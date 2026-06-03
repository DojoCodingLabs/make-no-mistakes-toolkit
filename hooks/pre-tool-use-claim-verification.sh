#!/usr/bin/env bash
# =============================================================================
# pre-tool-use-claim-verification.sh — PreToolUse warn-mode hook (DOJ-4872).
#
# Purpose
# -------
# Working tree is ONE projection; the ref is the truth. When the agent runs a
# bare-filesystem verification op (`ls`, `grep -rn src/`, `find src/`) inside
# a context that suggests a branch-level claim (recent mention of `develop`,
# `origin/<ref>`, "does X exist on …", "verify against …"), warn that the
# operation is reading the working-tree projection, not the ref.
#
# Output is written to stderr and includes:
#   * the local repo's current HEAD ref + SHA (so the reader knows which
#     projection the bare op would have read)
#   * a suggested ref-explicit replacement
#   * a pointer to the `/verify` slash command and `verify-branch-state` skill
#
# Discipline
# ----------
# * Warn-mode only. ALWAYS `exit 0`.
# * `set +e` defensively — a bug here must never block the user's tool call.
# * `cd -P` + `pwd -P` for path resolution (lesson from DOJ-4868 PR #2604).
# * Trailing-newline-safe `while read` for any multi-line input.
# * No reliance on `jq` for the warn decision — fail-open if jq missing.
# * Honors the documented kill switch `CLAUDE_DISABLE_PLUGIN_HOOKS=1`.
# * Repo-agnostic. No per-repo manifest. No file-shape requirements.
#
# Companion artifacts (same release, v1.31.0)
# -------------------------------------------
#   * skills/verify-branch-state/SKILL.md
#   * commands/verify.md
#
# Sibling repo-level hook (DOJ-4868, dojo-os only)
#   * dojo-os/.claude/hooks/<pre-bash-claim-verification.sh>
# =============================================================================
set +e

# Kill switch — documented plugin-wide bypass.
if [ "${CLAUDE_DISABLE_PLUGIN_HOOKS:-0}" = "1" ]; then
  exit 0
fi

# Resolve the hook's own directory with `cd -P` + `pwd -P` so symlinked
# install paths and worktree-relative invocations both produce a real path.
# This is the DOJ-4868 PR #2604 lesson — symlink-resolution matters from day 1.
SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P)"
if [ -z "$SCRIPT_DIR" ]; then
  # Defensive: if cd/pwd failed, do not abort the tool call.
  exit 0
fi

# Read tool_input JSON from stdin (cached as a single string). Strip any
# trailing newline so the later regex doesn't get confused by it.
INPUT_RAW=""
if [ ! -t 0 ]; then
  INPUT_RAW="$(cat)"
fi

# Extract the bash command being run. Use `jq` when available; otherwise
# fall back to a tolerant grep so we still warn when the manifest's jq
# dependency is missing on the host.
COMMAND=""
TOOL_NAME=""
if command -v jq >/dev/null 2>&1 && [ -n "$INPUT_RAW" ]; then
  TOOL_NAME="$(printf '%s' "$INPUT_RAW" | jq -r '.tool_name // empty' 2>/dev/null)"
  COMMAND="$(printf '%s' "$INPUT_RAW" | jq -r '.tool_input.command // empty' 2>/dev/null)"
fi

# Only react to the Bash tool. Edit/Write/etc. are not the concern here.
case "$TOOL_NAME" in
  Bash) ;;
  "")   ;;  # jq unavailable — proceed on the raw command extraction below
  *)    exit 0 ;;
esac

# Fallback command extraction if jq is missing or input is shaped oddly.
if [ -z "$COMMAND" ] && [ -n "$INPUT_RAW" ]; then
  # Tolerant single-line extract — does not need jq.
  COMMAND="$(printf '%s' "$INPUT_RAW" \
    | grep -oE '"command"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 \
    | sed -E 's/^"command"[[:space:]]*:[[:space:]]*"(.*)"$/\1/')"
fi

# Smoke-test mode: when invoked from a shell with a positional argument and
# no stdin envelope, treat the argument as the command. Lets developers
# verify the hook with `bash hooks/pre-tool-use-claim-verification.sh "ls foo"`.
SMOKE_TEST=0
if [ -z "$COMMAND" ] && [ -n "${1:-}" ]; then
  SMOKE_TEST=1
  COMMAND="$1"
fi

# Nothing to evaluate — silent pass.
if [ -z "$COMMAND" ]; then
  exit 0
fi

# ── Detector 1 — bare-filesystem verification ops ────────────────────────────
# These commands read the working-tree projection. They are fine in isolation
# but become a footgun when combined with a branch-level claim.
is_bare_fs_op() {
  local cmd="$1"
  # Match ls / find / grep -r / cat src/ / head src/ at start of command or
  # after a command separator (; | && ||). Use ERE so we can express the
  # leading-position constraint without shellcheck flagging redundant case
  # globs (SC2221/SC2222).
  if printf '%s' "$cmd" | grep -qE '(^|[;&|][[:space:]]*)(ls|find|cat|head)([[:space:]]|$)'; then
    return 0
  fi
  if printf '%s' "$cmd" | grep -qE 'grep[[:space:]]+-[rRnliN]+'; then
    return 0
  fi
  return 1
}

if ! is_bare_fs_op "$COMMAND"; then
  exit 0
fi

# ── Detector 2 — intent keywords in recent context ───────────────────────────
# Look at the whole input envelope (which Claude Code populates with prior
# tool_use_id / surrounding context in some surfaces) plus an opt-in env var
# so a smoke test can simulate the intent without a real session.
CONTEXT_HAYSTACK="$INPUT_RAW ${CLAUDE_HOOK_CONTEXT:-}"

# Intent patterns — keep this list tight; we'd rather miss a warn than
# spam every `ls` call.
intent_present() {
  local hay="$1"
  printf '%s' "$hay" | grep -qiE \
    '(verify against|does .* exist on|on origin/|origin/(develop|main|release)|on develop|on main|post-merge|did this land|re-validate|before I claim|verify[[:space:]]+(branch|ref))'
}

# In smoke-test mode the intent gate is skipped — the developer running
# `bash hooks/pre-tool-use-claim-verification.sh "ls src/foo.tsx"` wants to
# see the warning shape, not simulate session context.
if [ "$SMOKE_TEST" = "0" ] && ! intent_present "$CONTEXT_HAYSTACK"; then
  exit 0
fi

# ── Build the warning ────────────────────────────────────────────────────────
# Read local repo HEAD anchors so the reader knows which projection the
# bare op WOULD have read. We do this from the cwd (which Claude Code sets
# to the project root for Bash tool calls).
HEAD_REF="(unknown)"
HEAD_SHA="(unknown)"
if command -v git >/dev/null 2>&1; then
  HEAD_REF="$(git branch --show-current 2>/dev/null || echo "(detached)")"
  HEAD_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "(unknown)")"
fi

# Best-effort suggested replacement, branched by detected op.
SUGGESTED=""
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|][[:space:]]*)ls([[:space:]]|$)'; then
  # Extract the path argument: first non-flag token AFTER `ls`. Awk-only
  # avoids the trailing-flag-without-space edge case (`ls -la` would have
  # leaked `-la` through the sed prefix-strip).
  path_arg="$(printf '%s' "$COMMAND" \
    | awk '{for(i=1;i<=NF;i++) if ($i == "ls") {for(j=i+1;j<=NF;j++) if ($j !~ /^-/) {print $j; exit}}}')"
  if [ -n "$path_arg" ]; then
    SUGGESTED="git fetch origin <branch> --quiet && git ls-tree origin/<branch> -- $path_arg"
  else
    SUGGESTED="git fetch origin <branch> --quiet && git ls-tree origin/<branch> -- <path>"
  fi
elif printf '%s' "$COMMAND" | grep -qE 'grep[[:space:]]+-[rRnliN]+'; then
  # First try the double-quoted form: `grep -rn "Symbol" src/`.
  pattern_arg="$(printf '%s' "$COMMAND" \
    | grep -oE 'grep[[:space:]]+-[rRnliN]+[[:space:]]+"[^"]+"' \
    | head -1 \
    | sed -E 's/^grep[[:space:]]+-[rRnliN]+[[:space:]]+"(.+)"$/\1/')"
  # Then the single-quoted form: `grep -rn 'Symbol' src/`.
  if [ -z "$pattern_arg" ]; then
    pattern_arg="$(printf '%s' "$COMMAND" \
      | grep -oE "grep[[:space:]]+-[rRnliN]+[[:space:]]+'[^']+'" \
      | head -1 \
      | sed -E "s/^grep[[:space:]]+-[rRnliN]+[[:space:]]+'(.+)'$/\\1/")"
  fi
  if [ -z "$pattern_arg" ]; then
    # Nested awk loop: skip subsequent flag tokens so multi-flag forms
    # like `grep -i -r "Symbol" src/` don't mis-extract `-r` as the pattern.
    # Strip both " and ' so unquoted-token output is clean regardless of
    # whether the original command used double or single quotes.
    pattern_arg="$(printf '%s' "$COMMAND" \
      | awk '{for(i=1;i<=NF;i++) if ($i ~ /^-[rRnliN]+$/) {for(j=i+1;j<=NF;j++) if ($j !~ /^-/) {print $j; exit}}}' \
      | tr -d "\"'")"
  fi
  if [ -n "$pattern_arg" ]; then
    SUGGESTED="git fetch origin <branch> --quiet && git grep \"$pattern_arg\" origin/<branch> -- src/"
  else
    SUGGESTED="git fetch origin <branch> --quiet && git grep \"<pattern>\" origin/<branch> -- src/"
  fi
elif printf '%s' "$COMMAND" | grep -qE '(^|[;&|][[:space:]]*)find([[:space:]]|$)'; then
  SUGGESTED="git fetch origin <branch> --quiet && git ls-tree -r origin/<branch> -- <path> | grep <pattern>"
else
  SUGGESTED="git fetch origin <branch> --quiet && git show origin/<branch>:<path>"
fi

# ── Emit the warning ─────────────────────────────────────────────────────────
{
  echo ""
  echo "[verify-branch-state] WARN: working-tree read used for a branch-level claim."
  echo ""
  echo "  Local HEAD: $HEAD_REF @ $HEAD_SHA"
  echo "  Command:    $COMMAND"
  echo ""
  echo "  This reads the working-tree projection, not the ref. The local checkout"
  echo "  may have drifted (other sessions, worktrees, hooks). The ref is the truth."
  echo ""
  echo "  Suggested ref-explicit replacement:"
  echo "    $SUGGESTED"
  echo ""
  echo "  Or use the slash command (cites the ref's SHA for you):"
  echo "    /make-no-mistakes:verify <branch> <path-or-pattern>"
  echo ""
  echo "  See: skills/verify-branch-state/SKILL.md"
  echo "  Memory: feedback_working_tree_is_not_truth (origin 2026-06-03)"
  echo ""
  echo "  (warn-mode only — your command will still run)"
  echo ""
} >&2

# Warn-mode only — never block.
exit 0

#!/usr/bin/env bash
# =============================================================================
# pre-task-worktree-isolation-guard.sh — PreToolUse guard for the subagent
# spawn tool (Task / Agent).
#
# WHY THIS EXISTS
#   Git worktrees share ONE object store and ONE set of branch refs; a branch
#   can be checked out in only one worktree at a time. The harness's
#   `isolation: worktree` is supposed to provision a fresh worktree per agent,
#   but two failure conditions defeat that:
#     (a) Provisioning RACE — spawning >=2 isolation:worktree agents in the
#         SAME batch races provisioning; one agent fails to get a dedicated
#         directory and reuses the parent (or another agent's) worktree.
#     (b) cwd-reset + bare git — the agent's shell cwd resets to the shared
#         checkout between commands, so a bare `git checkout -b ...` runs
#         against whatever worktree the cwd resolves to, switching THAT
#         worktree's branch and dragging its uncommitted files along.
#   Together they commingle two contexts' work in one working directory. Once
#   commits entangle (branch A's commit captures branch B's files), a `git
#   revert` cannot separate them — the only recovery is a manual forward-fix.
#   (Real incident: the sibling-recheckout damage that needed a forward-fix
#   instead of a revert. Memory: reference_worktree_rechecked_out_by_sibling /
#   reference_parallel_agent_worktree_collision.)
#
# WHAT IT ENFORCES (the user's Rule 1)
#   At most ONE in-flight isolation:worktree spawn per session within a short
#   provisioning window. The 2nd+ batched spawn is BLOCKED (exit 2) with
#   guidance to either (Rule 1) spawn one-per-message, or (Rule 2 — preferred)
#   pre-create a dedicated worktree and pin `git -C <abs-path>` for ALL git.
#   Single / sufficiently-staggered worktree spawns pass. Non-worktree
#   subagents (no `isolation` field, or isolation != "worktree") always pass.
#
# FAIL-OPEN
#   Missing jq, unparseable input, unwritable lock dir, or
#   CLAUDE_DISABLE_PLUGIN_HOOKS=1 all exit 0 — an installation/runtime issue
#   with the guard must never block legitimate work.
# =============================================================================
set -u

HOOK_NAME="pre-task-worktree-isolation-guard.sh"
# Worktree provisioning window. Two isolation:worktree spawns inside this
# window are treated as a racing batch. The SAFE multi-worktree pattern
# (pre-create + git -C, Rule 2) does NOT use isolation:worktree, so it never
# trips this guard.
WINDOW_SECONDS="${MNM_WORKTREE_GUARD_WINDOW:-90}"

[[ "${CLAUDE_DISABLE_PLUGIN_HOOKS:-}" == "1" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0          # fail-open: no jq

INPUT_RAW="$(cat)"

# Only act on isolation:worktree spawns; everything else passes untouched.
ISOLATION="$(printf '%s' "$INPUT_RAW" | jq -r '.tool_input.isolation // empty' 2>/dev/null || true)"
[[ "$ISOLATION" != "worktree" ]] && exit 0

SESSION_ID="$(printf '%s' "$INPUT_RAW" | jq -r '.session_id // "default"' 2>/dev/null || echo default)"
SESSION_ID="${SESSION_ID//[^A-Za-z0-9_.-]/_}"     # sanitize for use in a path
LABEL="$(printf '%s' "$INPUT_RAW" | jq -r '.tool_input.name // .tool_input.description // "agent"' 2>/dev/null || echo agent)"

LOCK_ROOT="${TMPDIR:-/tmp}/mnm-worktree-spawn-guard"
mkdir -p "$LOCK_ROOT" 2>/dev/null || exit 0       # fail-open: unwritable tmp
LOCK_DIR="$LOCK_ROOT/${SESSION_ID}.lockd"

now="$(date +%s 2>/dev/null || echo 0)"
[[ "$now" =~ ^[0-9]+$ ]] || exit 0                # fail-open: no clock

# Reclaim a stale lock from a prior (already-provisioned) batch.
if [[ -d "$LOCK_DIR" ]]; then
  last="$(cat "$LOCK_DIR/ts" 2>/dev/null || echo 0)"
  [[ "$last" =~ ^[0-9]+$ ]] || last=0
  if (( now - last >= WINDOW_SECONDS )); then
    rm -rf "$LOCK_DIR" 2>/dev/null || true
  fi
fi

# Atomic acquire. `mkdir` is atomic across simultaneous processes, so when two
# hooks fire at once (parallel tool calls in one assistant message) exactly one
# wins — a plain `[[ -f lock ]]` test would let BOTH through.
if mkdir "$LOCK_DIR" 2>/dev/null; then
  printf '%s' "$now" > "$LOCK_DIR/ts" 2>/dev/null || true
  exit 0                                          # the single in-flight spawn
fi

# Lock held within the window → this is a batched 2nd+ isolation:worktree spawn.
held="$(cat "$LOCK_DIR/ts" 2>/dev/null || echo "$now")"
[[ "$held" =~ ^[0-9]+$ ]] || held="$now"
age=$(( now - held ))

cat >&2 <<EOF
BLOCKED [${HOOK_NAME}]: a second isolation:worktree subagent ("${LABEL}") is
being spawned ${age}s after another — inside the ${WINDOW_SECONDS}s worktree
provisioning window. Batching >=2 isolation:worktree spawns RACES provisioning:
one agent fails to get a dedicated directory, reuses the parent/another
worktree, and its bare git (cwd resets to the shared checkout) switches that
worktree's branch and commingles uncommitted work. Once commits entangle, a
git revert cannot separate them — the only recovery is a manual forward-fix.

How to fix:
  Rule 2 (preferred — eliminates the race entirely):
    1. Pre-create a DEDICATED worktree yourself, off the target branch:
         git worktree add .claude/worktrees/wt-<slug> origin/develop
    2. Spawn the agent WITHOUT isolation:worktree, and brief it to capture its
       toplevel once:  MYWT="\$(git rev-parse --show-toplevel)"
       and run ALL git as  git -C "\$MYWT" ...  — never bare git, never
       'git checkout' of another branch, never 'git worktree'.
  Rule 1 (also accepted):
    Spawn isolation:worktree agents ONE PER MESSAGE and wait for each to finish
    provisioning (>${WINDOW_SECONDS}s) before spawning the next.

Override (intentional, this turn only):
  Set CLAUDE_DISABLE_PLUGIN_HOOKS=1, or widen MNM_WORKTREE_GUARD_WINDOW.
EOF
exit 2

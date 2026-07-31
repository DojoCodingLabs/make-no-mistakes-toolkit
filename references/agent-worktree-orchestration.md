# Agent Worktree Orchestration — avoiding the sibling-recheckout collision

When an orchestrator spawns parallel subagents in **one git repo**, they can silently corrupt each other's working tree. This doc is the safe pattern + the two enforcement layers that back it.

## The failure mode

Git worktrees all share **one object store and one set of branch refs**; a branch can be checked out in only one worktree at a time, and an agent's shell cwd **resets to the shared checkout between commands**. Two conditions defeat per-agent isolation:

- **(a) Provisioning race.** Spawning ≥2 `isolation:worktree` agents in the SAME message races worktree provisioning — one agent fails to get a dedicated directory and reuses the parent's (or another agent's) worktree.
- **(b) cwd-reset + bare git.** A bare `git checkout -b …` runs against whatever worktree the cwd resolves to, switching THAT worktree's branch and dragging its uncommitted files along.

Together they commingle two contexts' work in one directory. Once commits entangle (branch A's commit captures branch B's files), a `git revert` **cannot separate them** — the only recovery is a manual **forward-fix**. (This is a real incident, not hypothetical.)

## The two rules

1. **Never spawn ≥2 `isolation:worktree` subagents in one message.** Spawn one per message and wait for it to provision, OR use Rule 2.
2. **Pre-create a dedicated worktree per agent (preferred — eliminates the race):**
   ```bash
   git worktree add .claude/worktrees/wt-<slug> origin/<base>
   ```
   Then spawn the agent WITHOUT `isolation:worktree`, and brief it to:
   ```bash
   MYWT="$(git rev-parse --show-toplevel)"   # capture once
   git -C "$MYWT" …                          # ALL git, every command
   ```
   Never bare git, never `git checkout` of another branch, never `git worktree` from an agent.

## Enforcement layers (this toolkit ships both)

- **`hooks/pre-task-worktree-isolation-guard.sh`** — PreToolUse on the `Task`/`Agent` tool. Blocks (exit 2) a 2nd `isolation:worktree` spawn inside a short provisioning window (Rule 1). Single / staggered spawns pass. Fail-open; honors `CLAUDE_DISABLE_PLUGIN_HOOKS=1`.
- **`git-worktree-add-discipline`** (rule in `hooks/rules/rules.yaml`) — warn-only on `git worktree add`, the upstream nudge toward Rule 2 (dedicated worktree + `git -C`).

## Recovery if a collision happens anyway

1. **Commit immediately** in the affected agent's branch — anchoring the work to the ref makes it safe from the shared working dir.
2. **Forward-fix** the entangled state; do NOT `git revert` (it can't separate the commingled changes).
3. Verify branch + SHA (the ref is the truth, not the working tree).

Memory refs: `reference_parallel_agent_worktree_collision`, `reference_worktree_rechecked_out_by_sibling`.

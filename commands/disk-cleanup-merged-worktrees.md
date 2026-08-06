---
description: Reclaim disk from git worktrees — deterministically, and refusing every worktree that still holds work. Dry-run by default; reclaims node_modules from live worktrees, and removes merged worktrees only when asked. Refuses the main checkout, anything uncommitted, anything with a merge/rebase/cherry-pick stopped in it, anything unpushed, anything locked, and anything it cannot measure. Accepts a repo path and flags as $ARGUMENTS.
argument-hint: "[repo-path] [--worktrees] [--apply] [--base <branch>] [--force] [--no-gh] [--json]"
priority: 70
---

# /disk-cleanup-merged-worktrees — reclaim disk without destroying work

**Input**: an optional repo path plus flags in `$ARGUMENTS`. Default: the current repo.
**Output**: a dry-run report — what would be reclaimed, what would be removed, and **what was refused and why**.

This command DELETES. Read the [`worktree-cleanup`](../skills/worktree-cleanup/SKILL.md)
skill before changing anything about how it decides; the refusals are the
product, and each one is a tested predicate rather than a guideline.

---

## Step 1 — Run the classifier. Do not re-derive it.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-cleanup.mjs" $ARGUMENTS
```

With no flags this is a **dry run over `node_modules` only**. Nothing is
deleted, and worktree removal is not even classified.

Never substitute a hand-rolled `git worktree list` sweep, a size-sorted `du`, or
a judgement about which paths "look old". The script measures; a glance
estimates, and the two produce output that looks identical.

## Step 2 — Read the refusals out loud, not just the totals

Report in this order:

1. **RECLAIM** — `node_modules` per worktree, with size and a total.
2. **REMOVE** — merged worktrees, with the merge evidence for each
   (`ancestor of origin/develop`, `PR #1234`).
3. **REFUSED** — every skipped worktree **by name, with its reason**.
4. **UNVERIFIABLE** — states that could not be measured.
5. **TOTAL** recoverable.

Section 3 is the one that earns the run. "`feat/x` skipped — 4 commits ahead of
`origin/feat/x`" is frequently the most useful line in the output, and a report
that omits it looks like the tool found less than it did.

**Surface any `mid-operation` line first and by name.** A merge, rebase or
cherry-pick stopped in a worktree does not resolve itself, is invisible in a
file listing, and is the one refusal that asks the reader to go and *do*
something (`git merge --abort`, or finish it) rather than merely to know it.

## Step 3 — Decide the two actions separately, and confirm before either

They have different blast radii and are never bundled into one approval.

**Reclaiming `node_modules`** is the cheap, reversible win — one install
restores it, and it touches no tracked file in any worktree. Offer it first:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-cleanup.mjs" --apply
```

**Removing merged worktrees** is opt-in, and it is the half that can lose work.
Show the candidate list with its evidence, get an explicit yes, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-cleanup.mjs" --worktrees --apply
```

The branch refs survive: `git worktree remove` takes the directory only, so a
removal is recoverable with `git worktree add`.

## Step 4 — What this command never does on its own

- **Never `--force`.** It overrides the uncommitted-changes check, which is the
  check standing between the run and work that has no other copy. Pass it only
  when the user asks for it in that same invocation, and say what it disables.
  A refusal is a finding to report, not an obstacle to route around — do not
  offer `--force` as the way past one.
- **Never delete a branch.** Directories only.
- **Never run `git worktree prune`.** Missing gitdirs are reported and left.
- **Never resolve an ambiguity into a deletion.** `unverifiable` is a valid
  outcome. If a worktree's state cannot be measured — a sibling process moved
  its branch, `gh` is unavailable so a squash merge is indistinguishable from
  no merge, `git status` failed — report it and skip it.

## Step 5 — Say what the user owes afterwards

A reclaimed worktree needs `bun install` / `npm ci` before its next use. Name
that; do not run installs across forty directories on their behalf.

---

## Notes on the flags that change what is measured

- `--base <branch>` narrows "merged" to exactly one branch. By default the
  script measures against a **set** — `origin/HEAD` plus every conventional base
  that exists — because a repo that merges into `develop` and promotes to
  `main` at release time will otherwise report every landed feature branch as
  unmerged.
- `--no-gh` drops the PR check. In a **squash-merge** repo that is most of the
  merge evidence, and branches will correctly come back `unverifiable` rather
  than removable. Use it only offline, and say why the output got quieter.
- `--no-fetch` measures against whatever `origin/*` already said. It makes runs
  faster and verdicts staler; the script prints the warning itself.

---
name: rebase-advisor
description: >
  Detects when the user needs to sync branches after a release or rebase
  their work across multiple branches. Suggests the /make-no-mistakes:rebase command.
  Triggers on: "sync with release", "rebase all branches", "align with develop",
  "post-release sync", "branches are behind", "need to rebase everything",
  "team rebase", "release sync", "sync after merge to main".
  Does NOT trigger on: single-branch rebase ("rebase this branch"),
  git rebase interactive, cherry-pick, or simple merge operations.
---

# Rebase Advisor

You detected that the user needs a **team-wide branch sync** — not a simple single-branch rebase.

## When This Applies

This skill activates when the user describes a situation involving:
- Multiple branches that need to be rebased after a release
- Post-release synchronization across the team
- Branches that have fallen behind `develop` or `main`
- Worktrees that need alignment after merges

## What To Do

1. Confirm the user wants a full team sync (not just rebasing one branch)
2. Suggest the dedicated command:

> This sounds like a team-wide release sync. Use:
>
> `/make-no-mistakes:rebase {repo-name}`
>
> This command handles the full protocol:
> - Syncs `develop` and `main` with remote
> - Stashes uncommitted work in all worktrees
> - Rebases every local branch onto updated `develop`
> - Auto-merges ready PRs (CI green + Greptile approved)
> - Post-merge re-check for cascading effects
> - Restores stashed work
> - Produces a health report

3. If the user just needs a simple single-branch rebase, do NOT invoke this skill — let them use `git rebase` directly.

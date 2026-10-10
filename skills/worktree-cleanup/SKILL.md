---
name: worktree-cleanup
description: >
  Reclaims disk from git worktrees — and refuses every one that still holds
  work. Runs a deterministic classifier that measures uncommitted changes,
  unpushed commits, lock state and three independent kinds of merge evidence
  (ancestry, patch-equivalence, and a merged PR, which is the one that survives
  a squash merge). Dry-run by default; deleting takes an explicit flag.
  Triggers on: "my worktrees are eating disk", "clean up merged worktrees",
  "delete old worktrees", "reclaim node_modules", "how much space are my
  worktrees using", "prune worktrees", "which worktrees can I delete",
  "disk is full and I have 40 worktrees".
  Does NOT trigger on: creating a worktree, `git worktree add`, moving work
  between worktrees, or a request to delete a specific BRANCH (deleting refs is
  not what this does — it removes directories and leaves every ref alone).
---

# Worktree Cleanup

Sixty worktrees, twenty gigabytes, thirty-eight `node_modules` — the largest a
single 1.6 GB. That is the measurement this exists for, taken on one real
checkout.

And it is the least important thing here.

## The asymmetry that shapes every decision below

Twenty gigabytes of stale worktrees costs disk, which is recoverable by
definition. One removed worktree holding the only copy of someone's commits
costs the work, and no later command gets it back.

So this skill is not optimised for reclaiming the most space. It is optimised
for **never being wrong in the direction that cannot be undone**, and it accepts
leaving space on the table to stay there. A run that reclaims nothing and
correctly refuses forty worktrees has done its job.

## Never re-derive this by hand

`scripts/worktree-cleanup.mjs` answers every question below deterministically.
Do not reimplement it with `git worktree list` piped through `grep`, and do not
eyeball a list of paths and decide which "look old". A second implementation of
a measurement drifts from the first, and here the drift is measured in
destroyed work.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-cleanup.mjs" [repo] [options]
```

| Flag | Effect |
| --- | --- |
| *(none)* | **Dry run.** Reports the `node_modules` it would reclaim, with size per entry and a total. Deletes nothing. |
| `--worktrees` | Also classify worktrees for removal. Opt-in, because this is the half that can destroy work. |
| `--apply` | Actually delete. Without it, nothing is removed, ever. |
| `--force` | Passes `--force` to `git worktree remove`. **Only when the user asked for it in that invocation** — see below. |
| `--base <branch>` | Measure "merged" against exactly one branch instead of the resolved set. |
| `--no-gh` | Skip the PR check. Squash-merged branches then come back `unverifiable`. |
| `--no-fetch` | Skip `git fetch`. Every merge verdict is then measured against stale refs. |
| `--json` | Machine-readable output. |

## The two actions, and why they are not the same action

**`node_modules` reclaim is the default**, and it is the cheap win: 38
directories in the measured repo, fully reversible with one install, and it
touches no tracked file in any worktree. It runs against worktrees that are
still **alive** — a dirty worktree is a normal target here, because a build
artifact directory is not the work.

**Worktree removal is opt-in.** It is the half with a failure mode, so it is
never what happens when someone runs the command without reading it.

## What it refuses, and what each refusal protects

Each of these is a predicate in the script with a test that fails when the
predicate is removed. None of them is a comment.

| Refusal | Measured by | What it protects |
| --- | --- | --- |
| `main-checkout` | first entry of `git worktree list` | the repository itself |
| `locked` | `locked` in `--porcelain` output | something claimed this worktree |
| `uncommitted` | `git status --porcelain` non-empty | work with no other copy — **untracked files included** |
| `mid-operation` | `MERGE_HEAD` / `rebase-merge` / `rebase-apply` / `CHERRY_PICK_HEAD` / `REVERT_HEAD` / `BISECT_LOG` in the worktree's own git dir | a merge, rebase, cherry-pick, revert or bisect **stopped here** |
| `unpushed` | `git rev-list --count <upstream>..HEAD` | the likeliest way to lose work |
| `not-merged` | all three merge tests negative | work that never landed anywhere |

**A branch that is AHEAD is not stale — it is unfinished.** That is the
distinction the whole tool turns on, and it is invisible from a directory
listing, a timestamp, or a branch name.

### `mid-operation` is not a corollary of `uncommitted`

The intuition is that a stopped merge always leaves conflict markers, so the
dirty check already covers it. Measured against real git, on a repository built
for the question: two branches add the **same file with the same content**,
`git merge --no-commit` auto-merges cleanly, the resulting tree is identical to
HEAD's, and **`git status --porcelain` returns zero lines while `MERGE_HEAD`
exists.**

Against that worktree the classifier returned `remove` with an empty findings
list, and `git worktree remove` then took it — **exit 0, no output, no refusal
of its own.** Git offers no protection here, so this check is the protection.

It is also reported ABOVE the dirty files in the conflicting case, because when
both fire the stopped operation is the *explanation* for the dirty files. A
report leading with "17 uncommitted changes" sends its reader to `git stash`
when the answer is `git merge --abort`.

And the check can fail to run: if the worktree's git dir cannot be resolved,
all six probes return "absent", and six absent probes read exactly like a
worktree with nothing in progress. That case is `mid-operation-unmeasurable`
and it is `unverifiable`, never `remove`.

## "Merged" is measured three ways, and the third is the common one

```
ancestor   git merge-base --is-ancestor HEAD origin/<base>
cherry     git cherry origin/<base> <branch>   (every line "-")
pr         a GitHub PR with this head and state == MERGED
```

A **squash merge** collapses N commits into one new commit with a new patch id.
The branch is then neither an ancestor of the base nor patch-equivalent to it,
so **an ancestry test alone reports `not-merged` for work that certainly
landed** — and in a squash-merge repo that is the majority case, not an edge
case. The PR test exists for exactly that, which is why losing `gh` downgrades
the verdict to `unverifiable` rather than to `not-merged`.

The base is resolved as a **set**, not one branch, and **per repository** — a
hardcoded base is the failure that destroys, because a wrong base that RESOLVES
makes every branch look merged. A repo that merges features into `develop` and
promotes to `main` at release time has `origin/HEAD` pointing at `main`;
measuring only against it reported 41 false `not-merged` verdicts on the
60-worktree run that produced this skill. A branch contained in **any** shared
remote base is merged for this purpose, because the question is *does this work
exist anywhere other than this directory*.

Measured 2026-08-06 by running `resolveBases()` read-only over the 23 git
checkouts under one working root: **21 resolve `main` first, 1 resolves
`develop` first, 7 resolve a two-element set, and 1 resolves NONE.** That last
one carries 3155 remote-tracking refs and not one of
`origin/{HEAD,main,develop,master,trunk}` — every branch is
`origin/dojo/v<date>-fixes`. The tool exits 2 there asking for `--base`, rather
than reading an empty base set as "nothing is unmerged".

The two-element case is the one the set exists for: a repo whose `origin/HEAD`
is `main` while its PRs target `develop` gets `[main, develop]`, tries `main`
first, finds nothing, and lands the verdict on `develop`.

## `unverifiable` is a real outcome and never collapses into "safe"

Six states are ambiguous rather than bad, and each one is reported and skipped:

- `branch-changed-under-us` — the branch `git worktree list` recorded and the
  branch the worktree reports right now disagree. A sibling process re-checked
  it out; every other measurement describes a state that no longer exists.
- `commits-after-merge` — the PR merged, and the branch tip is newer than
  `mergedAt`. Something was added that the PR does not cover.
- `merge-unmeasurable` — no local merge evidence and no `gh`. Indistinguishable
  from a squash merge, so it is not called unmerged either.
- `status-unreadable` — `git status` failed. Never assumed clean.
- `mid-operation-unmeasurable` — the worktree's git dir could not be resolved,
  so "is a merge stopped here" was not answered. A check that did not run is
  not a check that passed.
- `gitdir-missing` — the path is gone. `git worktree prune` is the operation
  and it is the user's to run, not this tool's.

If you find yourself reasoning about how to resolve one of these into a
removal, stop. **Report it as ambiguous and move on** — that is the correct
outcome, not a gap.

## Report the refusals, always

A run that prints only what it deleted looks like it found less than it did,
and hides the single most useful line in the output: *this worktree was skipped
because it has 4 unpushed commits*. That line is often the reason someone goes
and finishes a branch they had forgotten.

Show, in this order: what would be reclaimed, what would be removed, **what was
refused and why**, what was unverifiable, then totals.

## Things this skill does not do

- **It does not delete branches.** `git worktree remove` takes the directory
  and leaves the ref, so even a wrong removal is recoverable with
  `git worktree add`. Deleting refs is a separate decision with a separate
  blast radius.
- **It does not run `git worktree prune`.** Missing gitdirs are reported.
- **It does not pass `--force`** unless the user asked for it in that
  invocation. `--force` overrides the dirty check, which is the check most
  likely to be standing between a run and someone's uncommitted work. It is not
  offered as a way past a refusal, and a refusal is not a prompt to reach for
  it — a refusal is a finding.

## After a reclaim

`node_modules` deletion is reversible and the reversal is on the user:
`bun install` / `npm ci` in that worktree when they next use it. Say so; do not
run installs for them across forty directories.

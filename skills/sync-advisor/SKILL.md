---
name: sync-advisor
description: >
  Measures how far a checkout has drifted from its base ref and routes to the
  smallest sync that closes the gap — a plain pull, a single-branch rebase, or
  the team-wide /make-no-mistakes:rebase. Reports which governed files changed,
  so the answer is "you are missing these three hook fixes", not just "you are
  N commits behind". Read-only: it measures and recommends, it never syncs.
  Triggers on: "am I up to date", "is my branch behind", "how far behind am I",
  "do I need to pull", "is my checkout stale", "what changed on develop",
  "sync with develop", "sync with release", "post-release sync",
  "rebase all branches", "team rebase", "my worktrees are behind",
  "did I miss anything from develop".
  Does NOT trigger on: interactive rebase ("git rebase -i", "squash these
  commits"), cherry-pick, resolving a named merge conflict, or a request to
  actually perform the team sync (that is /make-no-mistakes:rebase itself).
---

# Sync Advisor

A checkout has drifted from its base ref, or may have. **Measure the drift
before naming a fix.** Six read-only predicates answer what would otherwise be
a question back to the user, and the answer separates three very different
routes: `git pull`, a single-branch rebase, and `/make-no-mistakes:rebase` —
which stashes every worktree, rebases every local branch, and auto-merges PRs.

Between `git pull` and that, there was nothing. Filling that gap is what this
skill is for, and it is why it does not forward every mention of "sync" to the
heaviest command available.

## This skill never acts

Every command below either reads or reports. The fixes are **printed for the
user to run**, never executed:

- `git pull`, `git rebase`, `git stash`, `git merge` — suggested, not run.
- `/make-no-mistakes:rebase` — suggested, not invoked.

One exception, and name it out loud when you use it: `git fetch origin --quiet`
runs first. It writes remote-tracking refs and nothing else — no local branch,
no index, no working tree. Without it every measurement below is taken against
a stale `origin/<base>` and reports a drift that stopped being true days ago,
which is the failure this skill exists to prevent.

If the user wants the sync performed, that is the `/make-no-mistakes:rebase`
command's job and they invoke it themselves.

## Step 0 — Resolve the base ref

Do not assume `develop`. Resolve in this order and say which one you used:

```bash
git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'   # 1. what this branch tracks
git symbolic-ref --short refs/remotes/origin/HEAD               # 2. the remote's default branch
git show-ref --verify --quiet refs/remotes/origin/develop; echo "exit=$?"  # 3. probe develop, then main
```

Command 1 fails on a branch with no upstream — that is information, not an
error: an unpushed branch, which predicate 6 covers. Fall through to 2, then 3.
Repos in this toolkit's audience use `develop`, `main`, `master` and `trunk`; a
hardcoded `develop` produces a confident measurement against a ref that does
not exist.

Then fetch, so that `origin/$BASE` is the ref and not a memory of it:

```bash
git fetch origin --quiet
```

## Step 1 — The six predicates

Run all six. Each routes somewhere different, and the fourth is the one nothing
else reports.

| # | Predicate | Answers |
|---|-----------|---------|
| 1 | Distance | Is anything needed at all? |
| 2 | Fast-forward? | `pull` vs. rebase/merge |
| 3 | Dirty tree | Stash or commit first |
| 4 | Untracked files the ref already tracks | **Back up first — these abort the pull** |
| 5 | Worktrees behind | A one-branch problem or a fleet problem |
| 6 | Unpushed commits | What a team-wide rebase would be touching |

### 1. Distance

```bash
git rev-list --left-right --count "HEAD...origin/$BASE"
```

Two tab-separated numbers: commits ahead of the ref, then commits behind it.
Two zeros means the work is already done — **say so and stop.** A skill that
always finds something to recommend is not measuring.

### 2. Is a fast-forward possible?

```bash
git merge-base --is-ancestor HEAD "origin/$BASE"; echo "exit=$?"
```

`exit=0` — HEAD is an ancestor of the ref, so `git pull --ff-only` applies and
nothing can conflict. `exit=1` — the histories diverged and the user holds
local commits the ref does not; a pull will merge or rebase, and can conflict.
Those are different recommendations, and predicate 1 alone cannot tell them
apart.

### 3. Dirty tree, split by stage

```bash
git status --porcelain
```

Column 1 is the index, column 2 is the working tree. ` M` is unstaged, `M ` is
staged, `MM` is both, `??` is untracked. The split matters because the advice
differs: staged work is one commit from safe, unstaged work needs a stash, and
the untracked rows belong to predicate 4.

### 4. Untracked files that the ref already tracks

The one nobody has, and the one worth the most:

```bash
comm -12 \
  <(git ls-files --others --exclude-standard | sort) \
  <(git ls-tree -r --name-only "origin/$BASE" | sort)
```

Every path this prints exists locally as untracked **and** exists on the ref as
tracked. Git refuses to overwrite it, so the pull aborts before doing anything:

```
error: The following untracked working tree files would be overwritten by merge:
	<path>
Please move or remove them before you merge.
Aborting
```

Three things earn this a dedicated predicate. It does not read as a problem in
`git status`, which shows the file as a plain `??` — indistinguishable from
harmless scratch. It is invisible to the distance count, and to the
fast-forward check: a clean `0 ahead, 1 behind` fast-forward aborts exactly the
same way. And the message names the user's own files, then names deletion as a
remedy — so the reflex is to remove the local copy, the one irreversible move
available.

Report these by name and recommend copying them somewhere outside the repo
first. Never recommend deleting them.

### 5. Worktrees behind

```bash
git worktree list --porcelain
```

Then, for each `branch refs/heads/<name>` it reports:

```bash
git rev-list --count "<name>..origin/$BASE"
```

This works from any checkout — worktrees share one object store and one ref
namespace, so there is no need to enter each one. **This predicate is the
threshold for `/make-no-mistakes:rebase`**: one branch behind is a `git pull`;
several worktrees and branches behind is what that command was built for.

### 6. Branches carrying unpushed commits

```bash
git for-each-ref --format='%(refname:short) | %(upstream:short) | %(upstream:track)' refs/heads
```

`[ahead 3]` means three commits exist only locally. An empty upstream column
means the branch was never pushed at all — cross-check with
`git ls-remote --heads origin` when it matters.

This does not change the recommendation; it changes what the user knows before
accepting it. `/make-no-mistakes:rebase` rebases every local branch, and this
is the list of what has no remote copy if one of those rebases goes wrong.

## Step 2 — The consequence line

Distance is a number. **What the user needs is what the distance costs.** Read
`make-no-mistakes.config.json` at the repo root (see
`commands/make-no-mistakes.config.example.json`):

```json
{
  "syncAdvisor": {
    "governedPaths": [".claude/hooks/", "scripts/", ".github/workflows/"]
  }
}
```

For each configured path:

```bash
git diff --name-only "HEAD...origin/$BASE" -- "<path>"
git log --oneline "HEAD..origin/$BASE" -- "<path>"
```

Three dots on the `diff` is deliberate: it diffs from the merge base, so it
shows what landed on the ref rather than what the user changed locally.

Report the files with the subject line of the commit that touched each. "You
are 12 behind" is a number nobody can act on. "Three hooks changed, two of them
fix defects you may be looking at right now" is the sentence that ends the
wrong debugging session.

**Degraded mode — no config file, or no `syncAdvisor` key.** Report distance
and routing exactly as above and **omit the consequence line entirely**. Do not
guess at governed paths and do not fall back to a built-in list: an invented
list is wrong in every repo but the one it was copied from, and a confident
wrong list is worse than a missing section. Mention once, in one clause, that
the key is unset and what setting it would add.

## Step 3 — Route

Take the first row that matches, in order:

| Condition | Recommend |
|-----------|-----------|
| Behind = 0, and no worktree behind | Nothing. The checkout is current — say it in one line and stop, dirty tree or not. Uncommitted work is not a sync problem. |
| Untracked collisions (predicate 4) | Copy those files outside the repo first. Nothing else proceeds — the pull aborts. |
| Behind > 0 and dirty tree (predicate 3) | `git stash` for unstaged work, a commit for staged work — naming the files — then re-read this table. |
| Behind > 0, fast-forward possible, one branch | `git pull --ff-only` |
| Behind > 0, diverged, one branch | `git rebase origin/$BASE` — a single-branch rebase, not the team command. |
| Two or more worktrees/branches behind | `/make-no-mistakes:rebase {repo-name}` |

`/make-no-mistakes:rebase` is a real destination and stays one. It syncs
`develop` and `main` with the remote, stashes uncommitted work across all
worktrees, rebases every local branch onto the updated base, auto-merges PRs
that are green and approved, re-checks for cascading effects, restores the
stashes, and prints a health report. That is the right tool for a fleet of
branches after a release, and the wrong tool for one branch four commits
behind. What changes here is who decides which case it is — measured, not
asked.

## Report shape

Keep it to what was measured:

```
origin/develop — 0 ahead, 12 behind. Fast-forward possible.

Governed files that changed:
  .claude/hooks/<hook-a>.sh        "refuse a command that discards stderr"
  .claude/hooks/<hook-b>.sh        "narrow the citation matcher"
  .github/workflows/<workflow>.yml "pin the checkout to the exact SHA"

Working tree: clean. Worktrees behind: none. Unpushed: none.

  git pull --ff-only
```

Two hooks in that list changed behaviour the user may be reporting as a bug.
Name that when it applies — it is the whole point of the consequence line.

## Why this exists

On 2026-07-31 a developer filed two bug reports against a hook, both with clean
reproductions. One was a real defect. The other described behaviour that had
been fixed days earlier; the checkout was stale. **Nothing in the report
separated them**, and the wrong half consumed a debugging session before the
checkout's age was ever questioned.

A commit count alone would not have caught it either. What was needed was the
consequence line: *three hooks changed, two of them fix defects you may be
looking at right now.*

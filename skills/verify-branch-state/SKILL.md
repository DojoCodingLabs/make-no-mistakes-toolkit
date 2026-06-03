---
name: verify-branch-state
description: >
  Working tree is one projection; the ref is the truth. Use whenever you need
  to verify whether a file, symbol, or change exists on a branch — especially
  `develop`, `main`, or any tracked ref. Auto-triggers on: "verify against
  develop", "does X exist on <branch>", "what's on origin/<branch>", "is this
  file on develop", "did this land on main", "check the ref", "re-validate
  the subagent", "before I claim", "post-merge state", "did the squash include
  X". Routes you to `git show / git ls-tree / git grep` against `origin/<ref>`
  and away from bare `ls`, `grep -rn src/`, or `find` against the working
  tree. Best skill to load before posting any authoritative claim about a
  branch's contents in a multi-session, multi-worktree repo.
---

# Verify Branch State

You are about to make a claim of the form **"X exists / doesn't exist on
`<branch>`"** — or to validate a subagent's claim of that shape, or to
contrast two refs. The working tree is **one projection** of the repo at one
HEAD; that HEAD can silently drift between commands in a multi-session,
multi-worktree, hook-mediated environment. **The ref is the truth. Verify
against the ref.**

This skill operationalizes the rule documented in dojo-os memory
[`feedback_working_tree_is_not_truth.md`](https://linear.app/dojo-coding/issue/DOJ-4872)
(origin: 2026-06-03 DOJ-4851/4863/4864 retraction). See also the sibling
repo-level enforcement shipped under DOJ-4868.

---

## Step 1 — Recognize when this rule fires

Load this skill (and use ref-explicit commands) when **any** of the following
is true. If you're not sure, assume it fires.

1. You're about to assert a fact about a named branch (`develop`, `main`,
   `release/*`, a PR head ref, or `origin/<anything>`).
2. You're validating or contradicting a subagent's audit verdict.
3. You're contrasting state between two refs or two PRs.
4. You're answering "does file `X` still exist?" in a repo with active
   worktrees, parallel sessions, or PreToolUse hooks that can switch HEAD.
5. You're verifying post-merge state (squash-merges rewrite
   `origin/<branch>`; the working tree stays stale until pulled).
6. You're about to post an authoritative Linear comment, GitHub PR review,
   or Slack message that says "this is on `<branch>`" or "this was removed".

**Anti-pattern that bit on 2026-06-03 (DOJ-4849 audit triage):** a re-audit
subagent correctly flagged `usePathwayViewModel.ts` as deleted on `develop`;
the orchestrator "corrected" it by running `ls
src/hooks/path/usePathwayViewModel.ts` against the local working tree — which
had been switched to a different branch in another session. Authoritative
"FRESH — proceed as briefed" comments went on DOJ-4851 and had to be
retracted publicly. The bare `ls` read a stale projection, not the repo.

---

## Step 2 — Anchor your verification

Before resolving the claim, anchor where you actually are:

```bash
git -C <repo> branch --show-current   # current checkout HEAD ref name
git -C <repo> rev-parse HEAD          # current checkout HEAD SHA
git -C <repo> ls-files --others --exclude-standard | head -5   # any drift?
```

If the named ref isn't `<branch>`, **do not** read the working tree to answer
a `<branch>`-level question. Use the ref directly.

---

## Step 3 — Use ref-explicit verification commands

```bash
# Always refresh the ref first. --quiet keeps stdout clean for parsing.
git fetch origin <branch> --quiet

# Does a file exist on the ref?
git cat-file -e origin/<branch>:path/to/file && echo "exists on origin/<branch>"

# What's the file's content on the ref?
git show origin/<branch>:path/to/file.tsx | head -50

# What's in a directory on the ref?
git ls-tree origin/<branch> -- path/to/dir/

# Does a symbol/string appear on the ref?
git grep "SomeSymbol" origin/<branch> -- src/

# Contrast two refs.
git diff origin/<branch-a>..origin/<branch-b> -- path/

# Identify what's actually at the ref tip.
git log origin/<branch> -1 --oneline --stat
```

Always cite the ref's SHA in your output so the next reader can re-verify:

```text
origin/develop @ c513198 — usePathwayViewModel.ts NOT PRESENT
```

The `/verify <ref> <path-or-pattern>` slash command in this plugin wraps the
above into a single call that prints the ref + SHA header for you.

---

## Step 4 — Anti-patterns (these are wrong)

These commands answer a **different** question than "what's on the ref":

```bash
# ❌ Reads whatever the local checkout HEAD points at (could be ANY branch).
ls src/pages/SomeFile.tsx

# ❌ Searches the working tree, not the ref. Silently misses recent merges.
grep -rn "SomeSymbol" src/

# ❌ Same problem. find walks the working tree.
find src/ -name "Pattern*"

# ❌ A "git status" can be clean while the checkout sits on a different branch
#    than the one you mean to verify.
git status
```

When a working-tree result and a ref-based result disagree, **the ref wins.**

---

## Step 5 — Pre-flight checklist (before posting the claim)

Before pasting a verdict into Linear, GitHub, or Slack:

- [ ] Ref-explicit command was used (`git show / ls-tree / grep` against
      `origin/<branch>`, not the working tree).
- [ ] `git fetch origin <branch> --quiet` was run in the same shell, in the
      same minute, as the verification.
- [ ] The ref's SHA is cited in the claim (`origin/<branch> @ <sha7>`).
- [ ] If a subagent disagreed, you've ruled out "main checkout drifted to a
      different branch" before overriding the subagent.
- [ ] In a multi-worktree repo, you've verified the local repo path you're
      running from is actually the canonical one (`git worktree list`).

---

## Multi-worktree context

In `dojo-os` (12+ active worktrees, parallel sessions, PreToolUse hooks
that can checkout), the main checkout's HEAD is **not stable across an
agent session**. Initial state declarations like "Current branch: develop"
decay silently. `git fetch` updates `refs/remotes` but does **not** update
the working tree. Hooks may checkout/reset between commands.

This is why the plugin ships a complementary PreToolUse hook
(`hooks/pre-tool-use-claim-verification.sh`) that warns when a bare-FS
verification op (`ls`, `grep -rn src/`, `find src/`) is run in a context
that suggests a branch-level claim. Warn-mode only, never blocks.

---

## Bottom line

> Working tree is ONE projection. The ref is the truth. Verify against the ref.

When stakes are non-trivial, only ref-based verification is admissible as
evidence.

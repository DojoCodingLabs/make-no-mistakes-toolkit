---
description: >
  Verify whether a file, directory, or pattern exists on a named git ref
  (working tree is one projection; the ref is the truth). Runs
  `git fetch origin <ref> --quiet` then `git ls-tree origin/<ref> -- <path>`
  for paths or `git grep <pattern> origin/<ref> -- src/` for patterns, and
  cites the ref's SHA in the output. Use before posting any authoritative
  claim about a branch's contents. Sibling skill: `verify-branch-state`.
---

# /verify — Ref-explicit existence check

Resolve "does X exist on `<ref>`?" against the ref itself, not the working
tree. Loads the `verify-branch-state` skill semantics and emits a single,
cite-able verdict line.

## Usage

```
/verify <ref> <path-or-pattern>
```

Examples:

```
/verify develop src/pages/PathDetailPage.tsx
/verify main src/hooks/path/
/verify origin/release-2026-06 "buildPathwayUrl"
/verify develop src/components/atoms/Button.tsx
```

`<ref>` accepts `main`, `develop`, a branch name, `origin/<branch>`, a tag,
or a commit SHA. The command normalizes to `origin/<ref>` when a bare
branch name is passed.

## Behavior

1. **Anchor.** Print the current local checkout state so the reader knows
   where the agent was when the verdict was rendered:

   ```bash
   git -C "$REPO" branch --show-current
   git -C "$REPO" rev-parse HEAD
   ```

2. **Refresh the ref.** Always:

   ```bash
   git -C "$REPO" fetch origin "$REF" --quiet
   ```

3. **Resolve the ref's SHA** so the verdict can be re-checked later:

   ```bash
   REF_SHA="$(git -C "$REPO" rev-parse --short "origin/$REF")"
   ```

4. **Route by argument shape.**

   - If `<path-or-pattern>` contains a `/` and has no shell-glob characters
     (no `*`, `?`, `[`, no leading quote), treat it as a path:

     ```bash
     git -C "$REPO" ls-tree "origin/$REF" -- "$ARG"
     # If the user wants file content:
     git -C "$REPO" show "origin/$REF:$ARG" | head -50
     ```

   - Otherwise, treat it as a regex/pattern to grep across `src/`:

     ```bash
     git -C "$REPO" grep -nF -- "$ARG" "origin/$REF" -- src/
     # If the user passes a regex (contains regex metachars), drop -F:
     git -C "$REPO" grep -nE -- "$ARG" "origin/$REF" -- src/
     ```

5. **Emit a single verdict line** in this exact shape so it can be pasted
   verbatim into Linear, GitHub, or Slack:

   ```text
   origin/<ref> @ <sha7> — <path-or-pattern> <PRESENT|NOT PRESENT|N MATCHES>
   ```

   Examples:

   ```text
   origin/develop @ c513198 — src/pages/PathDetailPage.tsx PRESENT
   origin/develop @ c513198 — src/hooks/path/usePathwayViewModel.ts NOT PRESENT
   origin/main @ a3f9c21 — buildPathwayUrl 7 MATCHES (src/utils/url.ts, src/hooks/...)
   ```

6. **Never read the working tree** to answer this question. No `ls`, no
   `grep -rn src/`, no `find`. If `git cat-file -e` and a stray `ls`
   disagree, **the ref wins**.

## Edge cases

- **Ref not found / no upstream:** print `origin/<ref> NOT FOUND — did you
  mean origin/main?` and exit with the suggestion. Don't fall back to the
  working tree.
- **Path with shell metacharacters:** quote `$ARG`. Treat as path if it
  contains `/`, otherwise as a pattern.
- **Multiple worktrees:** the command operates in the worktree it's invoked
  from but always queries `origin/<ref>` — the working tree's branch is
  irrelevant. If the user is in a worktree on a different branch, the
  result is still authoritative for the named ref.
- **Squash-merged PRs:** `origin/<branch>` is rewritten on squash-merge; a
  pre-merge `git fetch` you ran 10 minutes ago is stale. The command always
  re-fetches.

## Why

> Working tree is ONE projection. The ref is the truth. Verify against the ref.

Cited from dojo-os memory `feedback_working_tree_is_not_truth.md` (origin:
2026-06-03 DOJ-4851/4863/4864 retraction). Pairs with the auto-loading
`verify-branch-state` skill and the plugin-wide PreToolUse hook
(`hooks/pre-tool-use-claim-verification.sh`).

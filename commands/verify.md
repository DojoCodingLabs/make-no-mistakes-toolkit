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

The command executes in the current workspace (the directory the slash
command was invoked from). No `-C "$REPO"` indirection — the cwd is the
repo. The `<ref>` argument is normalized once at the top so the rest of the
pipeline handles bare branch names, `origin/<branch>`, tags, and SHAs
uniformly.

1. **Normalize the ref.** Decide which fully-qualified ref to query, and
   whether a remote fetch makes sense for that ref. Tag resolution probes
   the remote via `git ls-remote` first so remote-only tags (not yet
   fetched locally) don't fall through to the bare-branch branch and
   resolve to a nonexistent `origin/<tag>`:

   ```bash
   RAW_REF="$1"
   FETCH_TARGET=""   # what to pass to `git fetch origin <…> --quiet`; empty = skip
   RESOLVED_REF=""   # what to pass to git show / ls-tree / grep

   if   git rev-parse --verify --quiet "refs/tags/$RAW_REF" >/dev/null; then
     # Local annotated/lightweight tag, e.g. v1.31.0 (already fetched).
     RESOLVED_REF="refs/tags/$RAW_REF"
     FETCH_TARGET="tag $RAW_REF"
   elif git ls-remote --tags --exit-code origin "refs/tags/$RAW_REF" >/dev/null 2>&1; then
     # Remote-only tag — refresh it locally before resolving.
     git fetch origin "tag $RAW_REF" --quiet
     RESOLVED_REF="refs/tags/$RAW_REF"
     FETCH_TARGET=""  # already fetched in the probe step
   elif [[ "$RAW_REF" =~ ^[0-9a-f]{7,40}$ ]] \
        && git cat-file -e "$RAW_REF" 2>/dev/null; then
     # Commit SHA (short or long) that already exists locally — no fetch.
     RESOLVED_REF="$RAW_REF"
   elif [[ "$RAW_REF" == origin/* ]]; then
     # User explicitly wrote origin/<branch> — fetch the branch part,
     # query the full origin/<branch> name.
     RESOLVED_REF="$RAW_REF"
     FETCH_TARGET="${RAW_REF#origin/}"
   else
     # Bare branch name (the common case) — fetch + query origin/<branch>.
     RESOLVED_REF="origin/$RAW_REF"
     FETCH_TARGET="$RAW_REF"
   fi
   ```

2. **Anchor.** Print the current local checkout state so the reader knows
   where the agent was when the verdict was rendered:

   ```bash
   git branch --show-current
   git rev-parse HEAD
   ```

3. **Refresh the ref** (skipped for already-local commit SHAs):

   ```bash
   [ -n "$FETCH_TARGET" ] && git fetch origin $FETCH_TARGET --quiet
   ```

4. **Resolve the ref's SHA** so the verdict can be re-checked later:

   ```bash
   REF_SHA="$(git rev-parse --short "$RESOLVED_REF")"
   ```

5. **Route by argument shape.**

   - If `<path-or-pattern>` contains a `/` and has no shell-glob characters
     (no `*`, `?`, `[`, no leading quote), treat it as a path:

     ```bash
     git ls-tree "$RESOLVED_REF" -- "$ARG"
     # If the user wants file content:
     git show "$RESOLVED_REF:$ARG" | head -50
     ```

   - Otherwise, treat it as a regex/pattern to grep across the repo. Use
     `src/` as the path filter when it exists at the repo root; otherwise
     grep the whole tree so the command stays repo-agnostic (toolkit
     consumers may have `lib/`, `app/`, `packages/`, or a flat layout):

     ```bash
     if git ls-tree --name-only "$RESOLVED_REF" -- src 2>/dev/null | grep -q .; then
       PATH_FILTER=(-- src/)
     else
       PATH_FILTER=()
     fi
     git grep -nF -- "$ARG" "$RESOLVED_REF" "${PATH_FILTER[@]}"
     # If the user passes a regex (contains regex metachars), drop -F:
     git grep -nE -- "$ARG" "$RESOLVED_REF" "${PATH_FILTER[@]}"
     ```

6. **Emit a single verdict line** in this exact shape so it can be pasted
   verbatim into Linear, GitHub, or Slack:

   ```text
   <resolved-ref> @ <sha7> — <path-or-pattern> <PRESENT|NOT PRESENT|N MATCHES>
   ```

   `<resolved-ref>` is whatever the normalization step produced —
   `origin/<branch>` for bare/branch input, `origin/origin-typo-guarded` for
   `origin/…` input (never doubled), `refs/tags/v1.31.0` for tag input, the
   bare SHA for SHA input. Examples:

   ```text
   origin/develop @ c513198 — src/pages/PathDetailPage.tsx PRESENT
   origin/develop @ c513198 — src/hooks/path/usePathwayViewModel.ts NOT PRESENT
   origin/main @ a3f9c21 — buildPathwayUrl 7 MATCHES (src/utils/url.ts, src/hooks/...)
   refs/tags/v1.31.0 @ 0e2af72 — hooks/pre-tool-use-claim-verification.sh PRESENT
   c513198 @ c513198 — README.md PRESENT
   ```

7. **Never read the working tree** to answer this question. No `ls`, no
   `grep -rn src/`, no `find`. If `git cat-file -e` and a stray `ls`
   disagree, **the ref wins**.

## Edge cases

- **`origin/<branch>` input (already qualified):** the normalization step
  detects the `origin/` prefix and queries `origin/<branch>` as-is — no
  doubling like `origin/origin/develop`.
- **Tag input (`v1.31.0`, etc.):** normalized to `refs/tags/<tag>`. The
  fetch uses `git fetch origin tag <tag> --quiet` to refresh the tag ref
  specifically (without pulling other refs).
- **Commit SHA input (7-40 hex chars):** normalized to the bare SHA. Skips
  the fetch when the commit already exists locally; if the SHA is unknown
  locally, falls through to the bare-branch branch and lets the fetch
  surface the error.
- **Ref not found / no upstream:** print `<resolved-ref> NOT FOUND — did
  you mean origin/main?` and exit with the suggestion. Don't fall back to
  the working tree.
- **Path with shell metacharacters:** quote `$ARG`. Treat as path if it
  contains `/`, otherwise as a pattern.
- **Multiple worktrees:** the command operates in the worktree it's invoked
  from but always queries the resolved ref — the working tree's branch is
  irrelevant. If the user is in a worktree on a different branch, the
  result is still authoritative for the named ref.
- **Squash-merged PRs:** `origin/<branch>` is rewritten on squash-merge; a
  pre-merge `git fetch` you ran 10 minutes ago is stale. The command always
  re-fetches (except for already-local commit SHAs, which are immutable).

## Why

> Working tree is ONE projection. The ref is the truth. Verify against the ref.

Cited from dojo-os memory `feedback_working_tree_is_not_truth.md` (origin:
2026-06-03 DOJ-4851/4863/4864 retraction). Pairs with the auto-loading
`verify-branch-state` skill and the plugin-wide PreToolUse hook
(`hooks/pre-tool-use-claim-verification.sh`).

# /rebase — Team Release Sync Protocol

You are a senior engineering lead coordinating a team-wide rebase after a manual release.

This command synchronizes a developer's entire local state (branches, worktrees, PRs) with the latest release. It is designed to be run by every team member simultaneously after an admin announces a release.

This command is **idempotent** — safe to run multiple times. Each execution converges toward a fully aligned state.

## How to use

```bash
claude /rebase dojo-os                    # Sync with dojocoding repo (default)
claude /rebase backend-agent              # Sync with backend-agent repo
claude /rebase dojo-agent-openclaw-plugin  # Sync with OpenClaw plugin repo
```

The `$ARGUMENTS` variable contains the repo name (under DojoCodingLabs org).

## Input Resolution

1. Parse `$ARGUMENTS` to determine the target repository
2. If empty, ask which repo to rebase
3. Resolve the repo path:
   - Search common locations: `~/Documentos/GitHub/{repo}`, `~/Documents/GitHub/{repo}`, `~/code/{repo}`, `~/repos/{repo}`
   - If not found, ask the user for the local path
4. Verify it's a git repo with `develop` and `main` branches
5. Verify the user has the GitHub CLI (`gh`) authenticated

## Pre-Flight Checks

Before doing anything, run these checks. If ANY fail, STOP and report.

```bash
# 1. Verify repo exists and we're in it
cd {repo-path}
git rev-parse --is-inside-work-tree

# 2. Verify remote is accessible
git ls-remote origin --heads develop main

# 3. Check for in-progress rebases or merges (from previous interrupted runs)
test ! -d .git/rebase-merge && test ! -d .git/rebase-apply && test ! -f .git/MERGE_HEAD

# 4. Verify gh CLI is authenticated
gh auth status
```

If there's an in-progress rebase from a previous run, offer to abort it:
- "Found an interrupted rebase. Abort and restart? (y/n)"
- If yes: `git rebase --abort`
- If no: STOP — user must resolve manually

---

## Phase 1: SYNC — Update local develop and main

```bash
# Fetch everything, prune deleted remote branches
git fetch --all --prune

# Save current branch name to return later
ORIGINAL_BRANCH=$(git branch --show-current)

# Update main
git checkout main
git pull origin main --ff-only

# Update develop
git checkout develop
git pull origin develop --ff-only

# Show what was released
echo "=== Release Changelog ==="
git log develop..main --oneline --no-merges  # What went into main
git log main..develop --oneline --no-merges  # What's in develop but not yet in main
```

**If `git pull --ff-only` fails** (local has diverged):
- This means someone committed directly to develop/main locally
- STOP and warn: "⚠️ Your local {branch} has diverged from origin. You have local commits that don't exist on remote. Options: (1) Force-align with remote (loses local commits), (2) Rebase your local commits onto remote, (3) Abort and investigate"
- Use AskUserQuestion to let them choose

---

## Phase 2: STASH — Protect uncommitted work

For the main working tree AND every worktree:

```bash
# List all worktrees
git worktree list

# For each worktree path:
cd {worktree-path}
if [ -n "$(git status --porcelain)" ]; then
    git stash push -m "rebase-sync-$(date +%Y%m%d-%H%M%S)-{branch-name}"
    # Record that we stashed here, so we can unstash later
fi
```

Track stashed worktrees in a list — we'll unstash them in Phase 6.

---

## Phase 3: REBASE — Rebase every local branch onto updated develop

Collect all local branches that are NOT `develop` or `main`:

```bash
git branch --list --no-column | grep -v -E '^\*?\s*(develop|main)$'
```

For each branch, in this order:
1. Branches with open PRs first (they need pushing)
2. Branches in worktrees second
3. Other local branches last

### For each branch:

```bash
# If branch is in a worktree, work from there
cd {worktree-path-or-main-tree}
git checkout {branch}

# Attempt rebase
git rebase develop
```

### If rebase succeeds (no conflicts):
```bash
# Force-push with safety (won't overwrite someone else's push)
git push --force-with-lease origin {branch}
echo "✅ {branch} rebased and pushed"
```

### If rebase has conflicts:

```bash
# Show which files conflict
git diff --name-only --diff-filter=U

# Attempt auto-resolution for each conflicting file
# Strategy: for each file, try these in order:
#   1. If conflict is only in lockfiles (package-lock.json, pnpm-lock.yaml, yarn.lock):
#      → Accept develop's version, then regenerate: npm install / pnpm install
#   2. If conflict is only in auto-generated files (types, compiled output):
#      → Accept develop's version, regenerate
#   3. For all other files:
#      → Cannot auto-resolve safely
```

### If auto-resolution fails:

```bash
# Show the developer exactly what's conflicting
echo "❌ {branch} has conflicts that need manual resolution:"
git diff --name-only --diff-filter=U

# Open each conflicting file in the user's editor
# Detect editor: $EDITOR, or fall back to code/vim/nano
for file in $(git diff --name-only --diff-filter=U); do
    echo "  → Opening $file for conflict resolution..."
    ${EDITOR:-code} "$file"
done
```

Then STOP for this branch and ask: "Resolve the conflicts in your editor, then tell me to continue."

When the user says to continue:
```bash
git add .
git rebase --continue
git push --force-with-lease origin {branch}
echo "✅ {branch} conflicts resolved, rebased, and pushed"
```

If there are more branches, continue to the next one.

---

## Phase 4: PR HEALTH CHECK — Verify and auto-merge ready PRs

```bash
# List all open PRs by the current user in this repo
gh pr list --author=@me --state=open --json number,title,headRefName,mergeable,statusCheckRollup,reviews
```

For each open PR, check in order:

### 4a. Mergeable status
```bash
gh pr view {pr-number} --json mergeable,mergeStateStatus
```

- If `mergeable: CONFLICTING` → already handled in Phase 3 (branch was rebased). Re-check after push.
- If `mergeable: UNKNOWN` → wait 10 seconds, re-check (GitHub needs time after force-push)
- If `mergeable: MERGEABLE` → proceed to 4b

### 4b. CI status
```bash
gh pr checks {pr-number}
```

- If ANY check is failing → flag it, do NOT merge: "⚠️ PR #{pr-number} has failing CI. Fix before merge."
- If checks are pending → flag it: "⏳ PR #{pr-number} CI is still running. Re-run /rebase after CI completes."
- If ALL checks pass → proceed to 4c

### 4c. Greptile review
```bash
gh pr view {pr-number} --json comments
# Search comments for Greptile bot, extract confidence score
```

- If no Greptile review → tag it: comment `@greptile review` on the PR
- If Greptile confidence < 3/5 → flag: "⚠️ PR #{pr-number} Greptile confidence {X}/5. Address feedback before merge."
- If Greptile confidence ≥ 3/5 → proceed to 4d

### 4d. Auto-merge
If ALL conditions are met (mergeable + CI green + Greptile ≥ 3/5):

```bash
gh pr merge {pr-number} --squash --delete-branch
echo "✅ PR #{pr-number} merged and branch deleted"

# Clean up the worktree if one existed for this branch
BRANCH=$(gh pr view {pr-number} --json headRefName -q .headRefName)
WORKTREE_PATH=$(git worktree list --porcelain | grep -B2 "branch refs/heads/$BRANCH" | grep "worktree" | cut -d' ' -f2)
if [ -n "$WORKTREE_PATH" ]; then
    git worktree remove "$WORKTREE_PATH" --force
    echo "  🧹 Worktree removed: $WORKTREE_PATH"
fi
```

After each merge, re-sync develop:
```bash
git checkout develop
git pull origin develop --rebase
```

This is why you asked about running it twice — **each merge changes develop**, so subsequent PRs may need re-checking. The loop handles this automatically.

---

## Phase 5: POST-MERGE RE-CHECK

After all auto-merges in Phase 4, remaining branches may have drifted:

```bash
# Re-fetch after merges
git fetch origin

# For each remaining local branch (not yet merged):
git checkout {branch}
git rebase develop
git push --force-with-lease origin {branch}
```

This is the "second pass" — it catches branches that were affected by Phase 4 merges.

---

## Phase 6: UNSTASH — Restore uncommitted work

For each worktree where we stashed in Phase 2:

```bash
cd {worktree-path}
git stash pop
```

If the stash pop conflicts (stashed changes conflict with rebased code):
- Show the conflicts
- Open in editor
- Ask user to resolve

---

## Phase 7: VERIFY — Final health report

```bash
echo "=== /rebase Health Report ==="
echo ""

# 1. Local branches status
echo "📋 Local Branches:"
git branch -vv  # Shows tracking status

# 2. Worktree status
echo ""
echo "🌳 Worktrees:"
git worktree list

# 3. Open PRs status
echo ""
echo "📝 Open PRs:"
gh pr list --author=@me --state=open --json number,title,mergeable,statusCheckRollup -t '{{range .}}#{{.number}} {{.title}} — mergeable: {{.mergeable}}{{"\n"}}{{end}}'

# 4. Divergence check
echo ""
echo "🔀 Divergence from develop:"
for branch in $(git branch --list --no-column | grep -v -E '^\*?\s*(develop|main)$' | tr -d ' '); do
    BEHIND=$(git rev-list --count $branch..develop)
    AHEAD=$(git rev-list --count develop..$branch)
    echo "  $branch: $AHEAD ahead, $BEHIND behind"
done

# 5. Orphaned worktrees
echo ""
echo "🧹 Orphaned worktrees:"
git worktree list --porcelain | grep "worktree" | while read -r line; do
    path=$(echo "$line" | cut -d' ' -f2)
    if [ ! -d "$path" ]; then
        echo "  ⚠️ Missing: $path"
    fi
done
git worktree prune

# 6. Summary
echo ""
echo "✅ /rebase complete. You are aligned with origin/develop."
echo "   develop: $(git rev-parse --short develop)"
echo "   main:    $(git rev-parse --short main)"
```

---

## Convergence Guarantee

This command is designed to be **idempotent and convergent**:

| Run | What happens |
|-----|-------------|
| 1st run | Syncs develop, rebases all branches, merges ready PRs, re-checks remaining |
| 2nd run | Catches anything that shifted from 1st run's merges. Usually a no-op. |
| 3rd+ run | Always a no-op if previous runs succeeded. Safe to run indefinitely. |

If the 1st run completes without errors, a 2nd run is unnecessary. The built-in Phase 5 (post-merge re-check) handles the cascading effect.

**When you SHOULD run it twice:**
- If Phase 3 had manual conflict resolution (you may have introduced issues)
- If Phase 4 merged PRs that touched shared files (lockfiles, generated types)
- If you're not sure — running it again is always safe

---

## Error Recovery

| Error | Recovery |
|-------|----------|
| `git pull --ff-only` fails | Local branch diverged — user chooses: force-align, rebase, or investigate |
| Rebase conflict (auto-resolve fails) | Opens editor, waits for user, continues |
| `--force-with-lease` rejected | Someone else pushed to this branch — fetch and retry rebase |
| CI failing on PR | Skip auto-merge, flag for user |
| Greptile < 3/5 | Skip auto-merge, tag Greptile, flag for user |
| Stash pop conflicts | Opens editor, waits for user |
| Interrupted (ctrl+c, crash) | Next run detects in-progress rebase, offers to abort and restart |

---

## Anti-Patterns — NEVER Do These

| Anti-Pattern | Why |
|-------------|-----|
| `git push --force` (without --lease) | Can overwrite a teammate's push |
| `git reset --hard origin/develop` | Destroys local commits without asking |
| Merging PRs with failing CI | Breaks develop for everyone |
| Rebasing `main` or `develop` onto a feature branch | Rewrites shared history |
| Skipping the stash phase | Loses uncommitted work |
| Running in parallel across multiple repos | GitHub CLI race conditions |

---

## Slack Notification

When complete, send a summary to the user via Slack DM:
- Repo synced
- Branches rebased (list)
- PRs merged (list with numbers)
- PRs blocked (list with reasons)
- Conflicts resolved (manual or auto)
- Current commit hash on develop and main

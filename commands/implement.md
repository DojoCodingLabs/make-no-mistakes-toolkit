# /implement — Disciplined Execution Protocol

You are a senior engineering lead executing Linear issues with zero tolerance for process shortcuts.

This protocol ensures every issue is implemented with full discipline: sequential branches, worktree isolation, agent teams for parallelism, all-reviewer loops, CI verification, and clean merges.

## Agent Teams

When processing multiple independent issues, use Claude Code Agent Teams for parallel execution:

```bash
# Enable agent teams (experimental)
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Launch with team coordination
claude --team "Implement ALT-13, ALT-14, ALT-15 in parallel with worktree isolation"
```

**When to use Agent Teams vs sequential:**
- **Agent Teams**: 2+ issues with no dependency between them (e.g., ALT-15 + ALT-16 + ALT-37)
- **Sequential**: Issues that depend on each other (e.g., ALT-13 depends on ALT-15)
- **Hybrid**: Launch independent issues as teammates, then chain dependent ones sequentially after merge

**Team coordination rules:**
- Each teammate gets its own worktree (no shared working directory)
- The team lead monitors progress and resolves conflicts
- PR creation is sequential (one at a time) to avoid GitHub CLI race conditions
- All teammates must finish before proceeding to merge phase

## Specialized Subagents

Use the right subagent_type for each phase of the protocol:

| Phase | subagent_type | Purpose |
|-------|--------------|---------|
| **Codebase exploration** | `Explore` | Quick/medium/thorough codebase analysis |
| **Architecture design** | `Plan` | Implementation strategy before coding |
| **Architecture blueprint** | `feature-dev:code-architect` | Analyze patterns, design component/data flows |
| **Feature analysis** | `feature-dev:code-explorer` | Trace execution paths, map dependencies |
| **Implementation** | `general-purpose` | Multi-step coding tasks in worktrees |
| **Code review (plan)** | `superpowers:code-reviewer` | Review against plan and standards |
| **Code review (quality)** | `feature-dev:code-reviewer` | Bugs, security, quality with confidence filtering |
| **PR review (guidelines)** | `pr-review-toolkit:code-reviewer` | Review against CLAUDE.md and style guides |
| **PR test coverage** | `pr-review-toolkit:pr-test-analyzer` | Verify tests cover new functionality |
| **Silent failures** | `pr-review-toolkit:silent-failure-hunter` | Detect inadequate error handling |
| **Type design** | `pr-review-toolkit:type-design-analyzer` | Encapsulation, invariants, type quality |
| **Comment accuracy** | `pr-review-toolkit:comment-analyzer` | Verify comments match code |
| **Code simplification** | `code-simplifier:code-simplifier` | Simplify recently modified code |
| **SRD validation** | `srd-framework:srd-guardian` | Validate work against SRD priorities |
| **SRD context** | `srd-framework:codebase-auditor` | Read-only codebase exploration for SRD |
| **SRD analysis** | `srd-framework:srd-analyst` | Generate personas, journeys, gap audits |
| **Claude Code questions** | `claude-code-guide` | Features, hooks, MCP, IDE integrations |
| **Agent SDK (TS)** | `agent-sdk-dev:agent-sdk-verifier-ts` | Verify TS Agent SDK apps |
| **Agent SDK (Py)** | `agent-sdk-dev:agent-sdk-verifier-py` | Verify Python Agent SDK apps |
| **Plugin validation** | `plugin-dev:plugin-validator` | Validate plugin structure |
| **Agent creation** | `plugin-dev:agent-creator` | Generate agent configurations |
| **Skill review** | `plugin-dev:skill-reviewer` | Review skill quality |

**Recommended workflow per issue:**
1. `Explore` or `feature-dev:code-explorer` — understand the codebase area
2. `Plan` or `feature-dev:code-architect` — design the approach
3. `general-purpose` — implement in worktree (can run in parallel via Agent Teams)
4. `pr-review-toolkit:code-reviewer` + `silent-failure-hunter` — pre-PR quality gate
5. `srd-framework:srd-guardian` — validate against SRD acceptance criteria

## How to use

```bash
claude /make-no-mistakes:implement ALT-13                          # Single issue
claude /make-no-mistakes:implement ALT-13 ALT-14 ALT-15           # Sequential chain
claude /make-no-mistakes:implement https://linear.app/.../ALT-13   # URL format
```

The `$ARGUMENTS` variable contains one or more Linear issue identifiers or URLs.

## Configuration

This command reads project-specific settings from `linear-setup.json` at the repo root. If the file exists, it overrides defaults for:
- `team.key` — Issue prefix (e.g., `ALT` instead of `DOJ`)
- `git.baseBranch` — Base branch for PRs and rebasing (e.g., `main` instead of `develop`)
- `git.branchPattern` — Branch naming pattern
- `defaults.greptileReview` — Whether to tag Greptile
- `defaults.greptileMinConfidence` — Minimum Greptile confidence score
- `defaults.squashMerge` — Merge strategy
- `defaults.slackNotify` — Whether to send Slack notification on completion
- `openspec.changesPath` — Path to OpenSpec changes directory

If `linear-setup.json` doesn't exist, the command uses sensible defaults (`main` branch, squash merge, Greptile review enabled).

## Input Resolution

1. Parse `$ARGUMENTS` to extract issue ID(s) (e.g., `ALT-1234` or full URL)
2. Fetch each issue from Linear MCP: title, description, status, assignee, labels, comments, sub-issues
3. If multiple issues, determine execution order:
   - Respect explicit dependency links (`blockedBy`, `blocks`)
   - Otherwise, process in the order given
4. If `$ARGUMENTS` is empty, ask the user which issue(s) to work on

## Pre-Flight Checks

Before touching any code, verify:

```bash
# 0. Read configuration
cat linear-setup.json  # Extract baseBranch, team.key, defaults

# 1. Clean working tree
git status  # Must be clean — no uncommitted changes

# 2. Sync with remote
git fetch origin
git checkout {baseBranch} && git pull origin {baseBranch}

# 3. No orphaned worktrees from previous work
git worktree list  # Should only show main working tree

# 4. Verify CI is green on {baseBranch}
gh run list --branch {baseBranch} --limit 3
```

If any check fails, STOP and resolve before proceeding.

## Mandatory Rule: Always New Branch + Worktree

**Every issue gets a FRESH branch and its own worktree. No exceptions.**

- NEVER work in the main working tree for implementation. The main tree stays on `{baseBranch}`, clean.
- NEVER reuse an existing branch. Always create a new one, even if a previous attempt exists.
- If a branch with the same name already exists, delete it first: `git branch -D {branch-name}` (and its worktree if any).
- The branch type prefix (`feat/`, `fix/`, `chore/`, `test/`, `docs/`, `refactor/`) is determined from the Linear issue:
  1. Check issue labels: `Bug` → `fix/`, `Feature` → `feat/`, `Testing` → `test/`, `Infra` → `chore/`, `Documentation` → `docs/`
  2. Check issue title prefix: "Fix ..." → `fix/`, "Add ..." → `feat/`, etc.
  3. Default: `feat/` if no clear signal

**Branch naming**: `{type}/{issue-id}-{short-description}` (e.g., `feat/DOJ-2909-course-content-serializer`)

## Execution Protocol — Per Issue

For EACH issue in the sequence, follow this exact workflow. No shortcuts. No exceptions.

### Phase 1: Setup

1. **Claim the issue in Linear:**
   - Auto-assign to me (`assignee: "me"`)
   - Set status to **In Progress**
   - Comment: "Starting implementation. Branch: `{branch-name}`"

2. **Determine branch type** from Linear issue labels/title (see rule above).

3. **Create NEW branch + worktree** (MANDATORY — never skip):
   ```bash
   # Delete stale branch if it exists from a previous attempt
   git branch -D {type}/{issue-id}-{short-description} 2>/dev/null || true

   # Create fresh worktree with new branch
   git worktree add .claude/worktrees/{issue-id} -b {type}/{issue-id}-{short-description} {baseBranch}
   cd .claude/worktrees/{issue-id}

   # Verify you are in the worktree, NOT the main tree
   git worktree list  # Current dir should be in .claude/worktrees/
   pwd                # Must NOT be the repo root
   ```

4. **Assess scope:**
   - If the issue will touch **>15 files**, STOP. Decompose into 2+ PRs by domain BEFORE starting.
   - Create sub-issues in Linear for each PR if decomposing.
   - Comment the decomposition plan on the parent issue.

### Phase 2: Implement

4. **Implement in the worktree.** Follow all project conventions from CLAUDE.md.

4b. **Check for OpenSpec context:**
    - If `linear-setup.json` has `openspec.changesPath`, check if an OpenSpec change exists that references this issue
    - Look in `openspec/changes/*/proposal.md` for the issue ID
    - If found, read ALL artifacts (proposal.md, design.md, tasks.md) as implementation context
    - This provides richer context than the Linear issue description alone

5. **If multiple approaches exist:**
   - Create competing worktrees (one per approach)
   - Use agent teams to implement each approach in parallel
   - Each approach may discover new issues — document them
   - Synthesize the best parts of multiple solutions if needed
   - Delete losing worktrees after synthesis

6. **Write tests:**
   - Model E2E test cases with Slack MCP first (plan them in a test channel or thread)
   - Split test cases: some for **Playwright**, others for **Chrome DevTools MCP**
   - Browser ALWAYS in focus. **NEVER headless.** Both Playwright and Chrome DevTools MCP.
   - Plan to merge E2E tests sequentially (not in parallel)
   - If the project has `pubspec.yaml` (Flutter project detected):
     - Run `flutter build web` before browser-based E2E tests
     - Serve the build with `dart run dhttpd --path build/web --port 8080` or `python3 -m http.server 8080 -d build/web`
     - Point Chrome DevTools MCP / Playwright to `http://localhost:8080`

### Phase 3: PR + Review Loop

7. **Create the PR:**
   ```bash
   gh pr create --base {baseBranch} --title "{issue-id}: {concise title}" --body "..."
   ```
   - Link the Linear issue in the PR body
   - Add "Created by Claude Code on behalf of @{user}"

8. **Tag ALL reviewers:**
   - Comment `@greptile review` on the PR
   - Wait for automated reviews from **Greptile**, **CodeRabbit**, and **Graphite**
   - All three reviewers are configured in the project — check all of them

9. **Fix reviewer feedback:**
   - Address ALL insights from Greptile, CodeRabbit, AND Graphite
   - Commit fixes to the same branch
   - Re-tag: `@greptile review` again if needed
   - Target: Greptile confidence **≥ 3/5**, CodeRabbit no critical issues, Graphite no blockers
   - If a reviewer doesn't respond within 5 minutes, proceed but note it to the user

10. **Verify CI:**
    ```bash
    gh pr checks {pr-number} --watch
    ```
    - ALL checks must pass before proceeding
    - If CI fails, fix and push — do not skip

11. **Check merge conflicts:**
    ```bash
    gh pr view {pr-number} --json mergeable
    ```
    - If conflicts exist, rebase onto {baseBranch} and resolve
    - Never force-merge over conflicts

### Phase 4: Merge + Cleanup

12. **Merge the PR:**
    ```bash
    gh pr merge {pr-number} --squash --delete-branch
    ```

13. **Update Linear:**
    - Set status to **Done**
    - Comment: "Merged via PR #{pr-number}"

14. **Clean up worktrees:**
    ```bash
    git worktree remove .claude/worktrees/{issue-id} --force
    # Verify ALL worktrees for this issue are removed
    git worktree list
    git worktree prune
    ```

15. **Sync before next issue:**
    ```bash
    git checkout {baseBranch}
    git pull origin {baseBranch} --rebase
    ```

16. **Repeat** from Phase 1 for the next issue.

## Chain Merge Strategy

When processing multiple issues:

- PRs can be merged in chain (sequentially, not in parallel)
- After each merge, rebase remaining branches onto updated {baseBranch}
- Monitor ALL open PRs for incoming Greptile reviews throughout the chain
- If a later PR conflicts with an earlier merge, resolve immediately

## Anti-Patterns — NEVER Do These

| Anti-Pattern | Why It Fails |
|-------------|-------------|
| Implementing in the main working tree | Pollutes the base branch, blocks parallel work, no isolation |
| Reusing an existing branch for a new attempt | Carries stale commits, confuses reviewers, breaks clean history |
| Working two branches in the same repo simultaneously | GitHub CLI race conditions — by design limitation |
| Skipping Greptile re-review after fixes | You don't know if your fix introduced new issues |
| Merging with failing CI | Breaks {baseBranch} for everyone |
| Leaving worktrees on disk after merge | Disk bloat, stale state, confusion |
| Skipping rebase between issues | Merge conflicts compound |
| Running E2E headless | Tests pass locally, fail in real browser — false confidence |
| Putting all work in one giant PR | Unreviewable. >15 files = split by domain. |

## Completion Checklist

Before declaring ALL issues complete:

- [ ] Every issue is **Done** in Linear with merge comment
- [ ] Every PR is merged and branch deleted
- [ ] Every worktree is removed from disk (`git worktree list` shows only main)
- [ ] `{baseBranch}` is up to date (`git pull origin {baseBranch}`)
- [ ] No orphaned branches locally (`git branch --list` is clean)
- [ ] CI is green on {baseBranch} after all merges

## Slack Notification

When all issues are complete, send a summary to the user via Slack MCP:
- Issues completed (with Linear links)
- PRs merged (with GitHub links)
- Any issues discovered during implementation that need follow-up
- Greptile confidence scores for each PR

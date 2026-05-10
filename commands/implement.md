---
description: Execute Linear issues with full discipline -- sequential branches, worktree isolation, reviewer loops, CI verification, and clean merges. Accepts one or more Linear issue IDs or URLs as $ARGUMENTS.
priority: 100
---

# /implement — Disciplined Execution Protocol

You are a senior engineering lead executing Linear issues with zero tolerance for process shortcuts.

This protocol ensures every issue is implemented with full discipline: isolated worktrees, parallel sub-agents for independent work, all-reviewer loops, CI verification, and clean merges.

## Parallel Execution

When processing multiple independent issues, run them in parallel — each in its own git worktree, so branches never collide and PRs stay isolated. Two mechanisms are available; **prefer Mode A** for day-to-day work.

### Mode A — Inline sub-agent dispatch (preferred)

From within a running Claude Code session, dispatch one background sub-agent per independent issue using the `Agent` tool. Each sub-agent gets its own worktree automatically. The orchestrator (you) stays in the foreground and continues on another task, then receives a notification when each sub-agent completes.

```text
Agent(
  description: "Implement APP-1234",
  subagent_type: "general-purpose",
  model: "opus",
  isolation: "worktree",     // auto-creates a fresh worktree for this agent
  run_in_background: true,   // non-blocking; you get a notification on completion
  prompt: "<full self-contained brief — see 'Briefing' below>",
)
```

Why this is the default:
- Single session, no shell juggling or extra CLI invocation.
- The orchestrator can keep working on a third issue while two agents run.
- Completion is delivered as a `<task-notification>` inside the orchestrator's context — no polling needed.
- Each sub-agent's worktree is locked and isolated, so parallel edits never conflict.

### Mode B — Agent Teams CLI (experimental, legacy)

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
claude --team "Implement ALT-13, ALT-14, ALT-15 in parallel with worktree isolation"
```

Use this only when you explicitly want a separate top-level session per teammate (e.g., different model selection per agent, or longer-running work that outlives the current session). For most issues Mode A is cheaper and simpler.

### When to parallelize vs. run sequentially

- **Parallelize (Mode A or B)**: 2+ issues with no dependency between them (e.g., ALT-15 + ALT-16 + ALT-37). Different repos, different domains, or clearly independent pieces of the same codebase.
- **Sequential**: Issues with explicit dependency links (`blockedBy`, `blocks`) in Linear, or when a later PR would almost certainly conflict with an earlier one.
- **Hybrid**: Launch independent issues in parallel, then chain dependent ones sequentially after the first merges (rebase the dependent branch onto updated `{baseBranch}` before resuming).

### Briefing parallel agents

A background sub-agent starts with zero conversation context. Its prompt must be fully self-contained:

- **What**: the exact Linear issue ID(s) and a one-paragraph restatement of the goal.
- **Why**: the business/technical motivation, so the agent can judge trade-offs.
- **Where**: relevant file paths, repo root, base branch, branch naming pattern.
- **Resources**: secret names for GCP/secret-manager lookups, Sentry/Linear/Slack channel IDs, test credentials (staging only).
- **Hard constraints**: never-touch-prod rules, file-count limit (`15-File Rule`), sensitive-table blocklists, CLAUDE.md rules that apply.
- **Known parallel work**: other agents running concurrently and what they own, so the agent doesn't collide on files or open conflicting PRs.
- **Deliverable shape**: final report format expected back (Linear state, PR link, Sentry state, Slack channel).

Terse prompts produce shallow, generic work. Assume you won't be able to clarify mid-run — brief the agent like a smart colleague who just walked in.

### Coordination rules for parallel execution

- Each sub-agent gets its own worktree (Mode A does this automatically; Mode B requires explicit worktree setup per teammate).
- The orchestrator monitors notifications and resolves any cross-agent conflicts.
- **PR creation runs fine in parallel** when agents are on different branches (different refs = no race). Only serialize PR creation when two agents touch the same branch (they shouldn't — one agent per branch).
- Wait for all agents to finish before declaring the batch complete, then sync `{baseBranch}` once.

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
3. `general-purpose` — implement in worktree (can run in parallel via Mode A sub-agent dispatch, see "Parallel Execution")
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
- `team.key` — Issue prefix (e.g., `APP`, `BACK`, `MYTEAM` — anything matching your Linear team)
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

**Branch naming**: `{type}/{issue-id}-{short-description}` (e.g., `feat/APP-1234-course-content-serializer`)

## Execution Protocol — Per Issue

For EACH issue in the sequence, follow this exact workflow. No shortcuts. No exceptions.

### Phase 0: OpenSpec Context (MANDATORY when configured)

Run this BEFORE Phase 1 (Setup). If `linear-setup.json` has `openspec.changesPath`:

1. **Resolve the configured changes directory** and check for an existing OpenSpec change that references this issue. The grep MUST use the configured path — projects may set `openspec.changesPath` to anything (e.g., `specs/changes/`) and a hardcoded `openspec/changes/` would silently miss every existing spec there:
   ```bash
   CHANGES_PATH=$(jq -r '.openspec.changesPath' linear-setup.json)
   grep -r "{issue-id}" "$CHANGES_PATH"/*/proposal.md 2>/dev/null
   ```
   In all references below, `<changes>` denotes that resolved `$CHANGES_PATH` value, NOT the literal string `openspec/changes/`.

2. **If found**: Read ALL three artifacts as primary implementation context:
   - `<changes>/{change-slug}/proposal.md` — intent, domain, scope
   - `<changes>/{change-slug}/design.md` — architectural decisions, rejected alternatives, pre-launch checklist
   - `<changes>/{change-slug}/tasks.md` — atomic task list with file paths and commit messages

   These three files are the CONTRACT. The Linear issue is the WHAT; OpenSpec is the HOW. Do not deviate from the spec without going back to it first.

3. **If MISSING and the issue is non-trivial** (touches >2 files OR involves architectural decisions OR has reviewer-flagged risk): STOP and prepare the OpenSpec change BEFORE proceeding.
   - Use `/superpowers:brainstorming` if the design needs more thinking
   - Use `/make-no-mistakes:premortem` if the change is load-bearing in production
   - **Draft the three artifacts** in `<changes>/{change-slug}/`: proposal.md (intent + scope + out-of-scope), design.md (decisions + rationale), tasks.md (atomic checklist with commit messages). Leave them uncommitted on disk — the implementation branch does not exist yet.
   - **Defer the commit to Phase 1 step 4a** (below). Phase 1 creates the branch and worktree; the OpenSpec files are then committed as the very first commit on that branch.

4. **If MISSING but the issue is trivial** (typo fix, dependency bump, single-line change): proceed to Phase 1 without OpenSpec. Add a one-line note to the PR description explaining why OpenSpec was skipped.

5. **If `openspec.changesPath` is not configured** in `linear-setup.json`: skip this phase entirely. The project hasn't adopted OpenSpec yet.

**Why mandatory**: per the adoption decision (Slack 2026-03-30, channel C0AE5MKAX7B), OpenSpec is the durable persistence of design decisions. A skill that makes it optional re-introduces the failure mode it was adopted to prevent — implementations diverging from intent because nobody wrote the intent down.

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

4a. **Commit the OpenSpec change as the first commit** (only if Phase 0 step 3 drafted artifacts because none existed):
   - Phase 0 wrote the artifacts to the **main working tree** at `{main-tree}/$CHANGES_PATH/{change-slug}/`. Phase 1 step 3 created a fresh worktree from `{baseBranch}`, which does NOT carry over those uncommitted files. Copy them into the current worktree explicitly:
     ```bash
     # Inside the new worktree (Phase 1 step 3 cd'd here).
     CHANGES_PATH=$(jq -r '.openspec.changesPath' linear-setup.json)
     # Resolve the main working tree's filesystem path from git's worktree
     # registry — first row of `git worktree list --porcelain` is always the
     # primary tree, regardless of which worktree we're currently in.
     MAIN_TREE=$(git worktree list --porcelain | awk '/^worktree/ {print $2; exit}')
     # Skip the copy if the worktree already has the directory (e.g. an
     # earlier run already staged it, or the spec was committed previously).
     if [ ! -d "$CHANGES_PATH/{change-slug}" ]; then
       mkdir -p "$CHANGES_PATH"
       cp -r "$MAIN_TREE/$CHANGES_PATH/{change-slug}" "$CHANGES_PATH/"
     fi
     git add "$CHANGES_PATH/{change-slug}/"
     git commit -m "docs(openspec): {change-slug}"
     ```
   - The `docs(openspec)` commit MUST be commit #1 on the branch — reviewers and future agents read the spec before the diff.
   - If Phase 0 found an existing change (step 2), skip this entire step — the spec is already on `{baseBranch}` and inherited by the new worktree.

### Phase 2: Implement

5. **Implement in the worktree.** Follow all project conventions from CLAUDE.md. If Phase 0 produced an OpenSpec change, treat its `tasks.md` as the authoritative checklist — work through it in order and do not improvise file paths or commit messages outside the spec.

6. **If multiple approaches exist:**
   - Dispatch one sub-agent per approach via Mode A (each gets its own worktree automatically)
   - Run all approaches in parallel with `run_in_background: true`
   - Each approach may discover new issues — document them in its final report
   - Synthesize the best parts of multiple solutions if needed
   - Close losing sub-agent branches/PRs after synthesis

7. **Write tests:**
   - Model E2E test cases with Slack MCP first (plan them in a test channel or thread)
   - Split test cases: some for **Playwright**, others for **Chrome DevTools MCP**
   - Browser ALWAYS in focus. **NEVER headless.** Both Playwright and Chrome DevTools MCP.
   - Plan to merge E2E tests sequentially (not in parallel)
   - If the project has `pubspec.yaml` (Flutter project detected):
     - Run `flutter build web` before browser-based E2E tests
     - Serve the build with `dart run dhttpd --path build/web --port 8080` or `python3 -m http.server 8080 -d build/web`
     - Point Chrome DevTools MCP / Playwright to `http://localhost:8080`

### Phase 3: PR + Review Loop

8. **Create the PR:**
   ```bash
   gh pr create --base {baseBranch} --title "{issue-id}: {concise title}" --body "..."
   ```
   - Link the Linear issue in the PR body
   - Add "Created by Claude Code on behalf of @{user}"

9. **Tag ALL reviewers:**
   - Comment `@greptile review` on the PR
   - Wait for automated reviews from **Greptile**, **CodeRabbit**, and **Graphite**
   - All three reviewers are configured in the project — check all of them

10. **Fix reviewer feedback:**
    - Address ALL insights from Greptile, CodeRabbit, AND Graphite
    - Commit fixes to the same branch
    - Re-tag: `@greptile review` again if needed
    - Target: Greptile confidence **≥ 3/5**, CodeRabbit no critical issues, Graphite no blockers
    - If a reviewer doesn't respond within 5 minutes, proceed but note it to the user

11. **Verify CI:**
    ```bash
    gh pr checks {pr-number} --watch
    ```
    - ALL checks must pass before proceeding
    - If CI fails, fix and push — do not skip

12. **Check merge conflicts:**
    ```bash
    gh pr view {pr-number} --json mergeable
    ```
    - If conflicts exist, rebase onto {baseBranch} and resolve
    - Never force-merge over conflicts

### Phase 4: Merge + Cleanup

13. **Merge the PR:**
    ```bash
    gh pr merge {pr-number} --squash --delete-branch
    ```

14. **Update Linear:**
    - Set status to **Done**
    - Comment: "Merged via PR #{pr-number}"

15. **Clean up worktrees:**
    ```bash
    git worktree remove .claude/worktrees/{issue-id} --force
    # Verify ALL worktrees for this issue are removed
    git worktree list
    git worktree prune
    ```

16. **Sync before next issue:**
    ```bash
    git checkout {baseBranch}
    git pull origin {baseBranch} --rebase
    ```

17. **Repeat** from Phase 1 for the next issue.

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
| Two sub-agents sharing a single worktree | File races, non-deterministic diffs. One worktree per agent, always. |
| Two sub-agents on the same branch | They overwrite each other's commits. One branch per agent, always. |
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

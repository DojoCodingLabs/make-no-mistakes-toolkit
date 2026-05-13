---
description: Execute Linear issues with full discipline -- sequential branches, worktree isolation, reviewer loops, CI verification, and clean merges. Accepts one or more Linear issue IDs or URLs as $ARGUMENTS.
priority: 100
---

<!--
CHANGELOG
* 2026-05-13: bake HITL boundaries — ask user for PR open state (Draft / In Review / Ready to Merge); stop at merge / Linear-Done / worktree-cleanup
-->

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
- **PR state question**: at the push/PR boundary, the sub-agent must report back to the orchestrator (NOT ask the user directly — only the orchestrator has the `AskUserQuestion` surface in the main conversation). The orchestrator then asks the user the Draft / In Review / Ready to Merge question and relays the answer to the sub-agent via `SendMessage`. The sub-agent halts at the PR-creation step until that relay arrives. Same hand-off applies to the Phase 4 HITL gates (merge, Linear → Done, worktree cleanup).

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

### Redaction-quality sanity guard

Before continuing past Input Resolution, inspect each fetched issue's `description` for Bilingual Format markers (`## 👤 HUMAN LAYER`, `## 🤖 AGENT LAYER`, `### Acceptance Criteria`, `### Context Files`; or at minimum both literal strings `HUMAN LAYER` and `AGENT LAYER`). If the description is missing those markers — or is empty, a 1-liner, or pure stubs ("TBD", "N/A everywhere") — STOP and tell the user:

> Issue `{ID}` isn't in Bilingual Format. Implementation agents produce shallow work against un-redacted briefs. Run `/make-no-mistakes:spike-recommend {ID}` first to normalize the description in Linear, then re-run `/make-no-mistakes:implement {ID}`.
>
> If you've already redacted it manually and want to proceed anyway, say so explicitly and I'll continue.

Do not silently proceed. This is a one-paragraph sanity guard, not a redesign — the rest of the protocol below is unchanged.

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

## Authorization & Human-in-the-Loop Boundaries

`/implement` is authorized to drive local work end-to-end **without per-action approval**, but every shared-state mutation that materially affects others (a PR's review surface, a merge to `{baseBranch}`, an issue-tracker status flip, a local workspace deletion) requires an **explicit user OK at that exact step**. The protocol below treats these as hard STOP gates: surface the action, ask, wait for an explicit answer, then proceed.

### Autonomous (no per-action approval needed)

- All Phase 0–2 work: OpenSpec drafting, claiming the issue, creating the branch + worktree, the OpenSpec commit, implementation, local tests / lint / build.
- `git push` to `origin` in Phase 3.
- `gh pr create` — **but ONLY after the user has answered the PR open-state question** (see hard STOP #1 below).
- Re-pushing fix commits to address reviewer feedback on an already-open PR (the PR exists and the user already chose its mode).

### Hard STOP — must ask the user explicitly

1. **PR open state (runtime question, every PR)** — right before `gh pr create`, the agent MUST call `AskUserQuestion` with:

   > **"How should we open the PR? / ¿Cómo abrimos el PR?"**
   >
   > - **Draft**: Opens as a draft PR. Agent stops immediately after creation. User flips to Ready themselves when satisfied. No reviewer pings.
   > - **In Review**: Opens ready-for-review. Agent tags Greptile / CodeRabbit / Graphite, addresses feedback by pushing fix commits, then STOPS at the merge boundary for user approval.
   > - **Ready to Merge**: Opens ready-for-review, runs through the reviewer loop, AND auto-merges once all CI gates are green. No further user approval at the merge boundary.

   Store the answer — it drives Phase 3 + Phase 4 downstream behavior.

2. **`gh pr merge`** — STOP unless the user pre-authorized "Ready to Merge" mode at PR creation. Even in "Ready to Merge" mode, surface the merge attempt's expected outcome before triggering it (e.g., "all checks green; merging squash with branch delete in 5s").

3. **Linear status → Done** — STOP, always. Even after a successful auto-merge, ask the user before flipping Linear from In Review to Done. The user reserves the right to keep an issue in "In Review" until they personally verify the deploy or staging.

4. **`git worktree remove`** — STOP, always. The worktree is the user's local workspace state; they may want to inspect or salvage something before cleanup.

### Sub-agent exception (applies to all four hard STOP gates above)

`AskUserQuestion` is an **orchestrator-only** surface — it renders inside the user's main conversation and is not available to background sub-agents dispatched via the `Agent` tool. At every hard STOP gate listed above (and every `AskUserQuestion` / "STOP and ask the user" call site in the protocol below):

- **If running as the orchestrator**: call `AskUserQuestion` directly (or its equivalent), wait for the answer, then continue.
- **If running as a sub-agent**: do NOT attempt `AskUserQuestion`. Instead, emit a structured pause signal in your final report and halt. Use this exact shape so the orchestrator can detect and relay:

  ```json
  {
    "pause": {
      "gate": "pr-open-state" | "merge" | "linear-done" | "worktree-cleanup",
      "issue_id": "<issue-id>",
      "reason": "<one-sentence explanation>",
      "question": "<the exact question to surface to the user>",
      "options": ["<option-1>", "<option-2>", "..."],
      "context": { "pr_url": "...", "branch": "...", "worktree_path": "..." }
    }
  }
  ```

  The orchestrator then calls `AskUserQuestion` on the sub-agent's behalf, captures the user's choice, and relays it back via `SendMessage`. The sub-agent resumes from where it halted. Attempting `AskUserQuestion` from a sub-agent results in a silent hang or runtime error — never do it.

Default posture: when uncertain whether an action is local or shared-state, treat it as shared-state and ask.

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
   - **Compute the change slug deterministically** so every later step (and any restart) targets the same directory. The slug MUST follow the same shape as the implementation branch: `{issue-id-lowercase}-{short-kebab-description}` (e.g., `doj-3946-atomic-primitives-sprint`). Lowercase only, ASCII alphanumerics + hyphens, no leading/trailing hyphens, no other separators.
   - **Draft the three artifacts** in `<changes>/<change-slug>/`: proposal.md (intent + scope + out-of-scope), design.md (decisions + rationale), tasks.md (atomic checklist with commit messages). Leave them uncommitted on disk — the implementation branch does not exist yet.
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
   - Phase 0 wrote the artifacts to the **main working tree** at `{main-tree}/$CHANGES_PATH/<change-slug>/`. Phase 1 step 3 created a fresh worktree from `{baseBranch}`, which does NOT carry over those uncommitted files. Copy them into the current worktree explicitly. The `CHANGE_SLUG` value MUST match the slug Phase 0 step 3 chose (same `{issue-id-lowercase}-{short-kebab-description}` rule):
     ```bash
     # Inside the new worktree (Phase 1 step 3 cd'd here).
     CHANGES_PATH=$(jq -r '.openspec.changesPath' linear-setup.json)
     # Bind the slug Phase 0 step 3 produced. Replace the placeholder before
     # running — never leave it as a literal "<change-slug>" string.
     CHANGE_SLUG="<change-slug>"   # e.g. doj-3946-atomic-primitives-sprint
     # Resolve the main working tree's filesystem path from git's worktree
     # registry — first row of `git worktree list --porcelain` is always the
     # primary tree, regardless of which worktree we're currently in.
     MAIN_TREE=$(git worktree list --porcelain | awk '/^worktree/ {print $2; exit}')
     # Skip the copy if the worktree already has the directory (e.g. an
     # earlier run already staged it, or the spec was committed previously).
     if [ ! -d "$CHANGES_PATH/$CHANGE_SLUG" ]; then
       mkdir -p "$CHANGES_PATH"
       cp -r "$MAIN_TREE/$CHANGES_PATH/$CHANGE_SLUG" "$CHANGES_PATH/"
     fi
     git add "$CHANGES_PATH/$CHANGE_SLUG/"
     git commit -m "docs(openspec): $CHANGE_SLUG"
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

8a. **HARD STOP — ask the user the PR open state** (see "Authorization & Human-in-the-Loop Boundaries" → hard STOP #1):

   > **Sub-agent note:** If you are running as a background sub-agent, do NOT call `AskUserQuestion`. Emit the `pause` JSON signal documented under "Sub-agent exception" (gate: `"pr-open-state"`) and halt. The orchestrator will relay the answer back. Orchestrators continue:

   Call `AskUserQuestion`:

   > Question: **"How should we open the PR? / ¿Cómo abrimos el PR?"**
   >
   > Options:
   > - **Draft** — opens as a draft, no reviewer pings, agent STOPS immediately after PR creation. User flips to Ready themselves.
   > - **In Review** — opens ready-for-review, agent tags Greptile / CodeRabbit / Graphite, addresses feedback by pushing fix commits, then STOPS at the merge boundary for explicit user OK.
   > - **Ready to Merge** — same as In Review through the reviewer loop, plus auto-merges once all CI gates are green (no extra approval at the merge boundary, but the agent still surfaces merge intent in chat 1–2 lines before triggering).

   Store the answer as `{pr-open-state}`. It drives downstream behavior in steps 8, 9, 10, 13, 14, and 15:

   - **Draft** → step 8 uses `--draft`; steps 9–13 are skipped; **steps 14 and 15 always run** (the Linear → Done and worktree-cleanup HITL gates apply regardless of mode). After PR creation, report the PR URL, then proceed straight to step 14.
   - **In Review** → step 8 opens ready-for-review; proceed through steps 9–12, then STOP at step 13 and ask for explicit go-ahead before merging. Steps 14 and 15 follow.
   - **Ready to Merge** → step 8 opens ready-for-review; proceed through steps 9–12, surface merge intent at step 13 (1–2 lines), then merge without extra approval. Steps 14 and 15 follow.

   Do not skip 8a. Do not infer the mode from context. Do not pick a default. Always ask, every PR.

8. **Create the PR** (using the mode chosen in 8a):
   ```bash
   # Draft mode:
   gh pr create --base {baseBranch} --draft --title "{issue-id}: {concise title}" --body "..."
   # In Review / Ready to Merge mode:
   gh pr create --base {baseBranch} --title "{issue-id}: {concise title}" --body "..."
   ```
   - Link the Linear issue in the PR body
   - Add "Created by Claude Code on behalf of @{user}"
   - If Draft mode: report the PR URL to the user, then jump directly to step 14 (the Linear → Done and worktree-cleanup HITL gates apply regardless of mode). Phase 3's review-and-merge body (steps 9–13) is skipped.

9. **Tag ALL reviewers** (SKIP this step for Draft mode):
   - Comment `@greptile review` on the PR
   - Wait for automated reviews from **Greptile**, **CodeRabbit**, and **Graphite**
   - All three reviewers are configured in the project — check all of them

10. **Fix reviewer feedback** (applies to In Review + Ready to Merge only; SKIP for Draft):
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

> **Mode-gating reminder:** Step 13 (`gh pr merge`) only runs for **In Review** and **Ready to Merge** PRs. **Draft mode skips step 13 but still runs steps 14 and 15** — the Linear → Done and worktree-cleanup HITL gates are inviolable and fire regardless of mode (see "Hard STOP #3" and "Hard STOP #4"). For Draft PRs, jump from step 8 directly to step 14.

13. **Merge the PR** (HITL gate per "Hard STOP #2") — **In Review + Ready to Merge only; skipped for Draft**:
    - **In Review mode** → STOP and ask the user: "Ready to merge? CI is green: `<one-line summary of checks + reviewer states>`." Wait for an explicit OK before running `gh pr merge`. _Sub-agents: emit a `pause` signal with gate `"merge"` instead — see "Sub-agent exception"._
    - **Ready to Merge mode** → Surface merge intent in chat (1–2 lines, e.g., "All checks green; merging squash with branch delete in 5s.") then proceed without an additional approval prompt.
    - **Draft mode** → This step does not run; proceed to step 14.
    ```bash
    gh pr merge {pr-number} --squash --delete-branch
    ```

14. **Update Linear** (HITL gate per "Hard STOP #3" — applies regardless of mode):
    - **In Review / Ready to Merge** → STOP and ask: "Merge done. Mark `{issue-id}` as **Done** in Linear, or leave it **In Review** for your verification?"
    - **Draft** → STOP and ask: "Draft PR opened at `<URL>`. Keep `{issue-id}` as **In Progress** in Linear, or move it to **In Review** for visibility?" (Draft PRs never auto-flip to Done — they're explicitly held open by the user.)
    - Only flip the status on explicit OK. If the user opts to leave the current status, post the status comment anyway and move on.
    - Status comment: "Merged via PR #{pr-number}" (In Review / Ready to Merge) or "Draft PR opened: #{pr-number}" (Draft).
    - _Sub-agents: emit a `pause` signal with gate `"linear-done"` instead of calling `AskUserQuestion`. See "Sub-agent exception"._

15. **Clean up worktrees** (HITL gate per "Hard STOP #4" — applies regardless of mode):
    - **In Review / Ready to Merge** → STOP and ask: "Merge done. Remove the worktree at `.claude/worktrees/{issue-id}`, or keep it for inspection?"
    - **Draft** → STOP and ask: "Draft PR opened at `<URL>`. The worktree at `.claude/worktrees/{issue-id}` is still live so you can iterate. Remove it now, or keep it until you flip the PR to Ready?" Default expectation: keep it.
    - Only run the removal on explicit OK.
    - _Sub-agents: emit a `pause` signal with gate `"worktree-cleanup"` instead of calling `AskUserQuestion`. See "Sub-agent exception"._
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
| Merging / cleaning up without explicit user OK | Even when CI is green and the PR is approved, shared-state mutations (merge, Linear status, worktree removal) require explicit per-action user approval. The protocol authorizes file edits + commits + push + PR creation — not the destructive end of the lifecycle. |

## Completion Checklist

Before declaring ALL issues complete:

- [ ] Every issue is **Done** in Linear with merge comment (or explicitly left In Review by user)
- [ ] Every PR is merged and branch deleted (or explicitly left as Draft / open per user instruction)
- [ ] Every worktree is removed from disk (`git worktree list` shows only main) — or explicitly preserved per user instruction
- [ ] `{baseBranch}` is up to date (`git pull origin {baseBranch}`)
- [ ] No orphaned branches locally (`git branch --list` is clean)
- [ ] CI is green on {baseBranch} after all merges
- [ ] User explicitly approved each shared-state mutation (PR creation mode, merge, Linear → Done, worktree cleanup)

## Slack Notification

When all issues are complete, send a summary to the user via Slack MCP:
- Issues completed (with Linear links)
- PRs merged (with GitHub links)
- Any issues discovered during implementation that need follow-up
- Greptile confidence scores for each PR

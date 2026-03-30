---
name: review-open-prs
description: >
  Cross-references open PRs across all repos in the current org with Linear issues,
  checks Greptile review scores, forces mergeable calculation, and generates an
  actionable report with merge/rebase/fix recommendations. Use when the user asks
  "show me open PRs", "what PRs need attention", "review PRs", "check Greptile scores",
  "what's ready to merge", or wants a comprehensive PR status overview.
  Do NOT trigger for: creating PRs, code review, or single PR inspection.
---

# Review Open PRs — Linear + GitHub Cross-Reference

Execute the following steps to generate a comprehensive review of open PRs and their associated Linear issues. This command also forces GitHub's mergeable calculation and validates Greptile review scores.

## Usage

```bash
claude /make-no-mistakes:review-open-prs               # All repos in the current org
claude /make-no-mistakes:review-open-prs my-repo        # Filter to a specific repo
claude /make-no-mistakes:review-open-prs mine            # Only PRs authored by me
```

## Step 0: Detect Organization and Repositories

Detect the GitHub organization dynamically. Try these methods in order:

**Method A** — Infer from the current repo:
```bash
ORG=$(gh repo view --json owner --jq '.owner.login' 2>/dev/null)
```

**Method B** — Read from `linear-setup.json` if it exists at the repo root:
```bash
ORG=$(cat linear-setup.json 2>/dev/null | jq -r '.github.org // empty')
```

**Method C** — If neither works, ask the user which org to scan.

Once the org is known, discover repositories:
```bash
REPOS=$(gh repo list "$ORG" --limit 50 --json name --jq '.[].name')
```

Also read the issue prefix from `linear-setup.json` if available:
```bash
TEAM_PREFIX=$(cat linear-setup.json 2>/dev/null | jq -r '.team.key // empty')
```

If `TEAM_PREFIX` is empty, infer it from the Linear issues fetched in Step 1 (use the most common prefix).

Store `ORG`, `REPOS`, and `TEAM_PREFIX` for use in subsequent steps.

## Step 1: Gather Linear Issues Assigned to Me

Use the `mcp__linear-server__list_issues` tool to fetch all issues assigned to "me" that are in active states (not Done, not Cancelled). Use `includeArchived: false` and `limit: 100`.

Store the results mentally — you'll need issue identifiers (e.g., `{TEAM_PREFIX}-123`), titles, states, priorities, and branch names.

## Step 2: Gather Open PRs Across All Org Repos

For each repo discovered in Step 0, run:

```bash
for repo in $REPOS; do
  echo "=== $repo ==="
  gh pr list --repo "$ORG/$repo" --state open --json title,number,url,headRefName,author,updatedAt,isDraft --limit 50 2>/dev/null
done
```

If the user provided arguments, filter by those criteria:
- `$ARGUMENTS` may contain a repo name (filter to that repo), a team name (filter Linear issues by team), or "mine" (filter PRs authored by me).

## Step 3: Force Mergeable Calculation on All My PRs

GitHub calculates mergeability lazily — it only computes when requested. Force the calculation on ALL my open PRs by querying each one:

```bash
# First pass: trigger calculation on all my PRs
for pr_number in <list of my PR numbers>; do
  gh pr view "$pr_number" --repo "$ORG/<repo>" --json number,mergeable --jq '{number, mergeable}' 2>/dev/null &
done
wait
```

After the first pass, collect any PRs that returned `mergeable: "UNKNOWN"`. Wait 5 seconds, then retry those:

```bash
sleep 5
# Second pass: retry UNKNOWN ones
for pr_number in <UNKNOWN PR numbers>; do
  gh pr view "$pr_number" --repo "$ORG/<repo>" --json number,mergeable --jq '{number, mergeable}' 2>/dev/null
done
```

If any still return `UNKNOWN` after the second pass, mark them as "calculating" in the report.

## Step 4: Fetch Greptile Scores and Review State for All My PRs

For each of my open PRs, extract BOTH the Greptile confidence score AND the review state:

**4a. Get the review state** (COMMENTED vs CHANGES_REQUESTED):
```bash
for pr_number in <list of my PR numbers>; do
  state=$(gh api "repos/$ORG/<repo>/pulls/$pr_number/reviews" \
    --jq '[.[] | select(.user.login | test("greptile"; "i")) | .state] | last' 2>/dev/null)
  echo "PR #$pr_number: $state"
done
```

**4b. Get the confidence score and Path to 5/5**:
```bash
for pr_number in <list of my PR numbers>; do
  echo "=== PR #$pr_number ==="
  # Greptile posts as greptile-apps[bot] in issue comments (not PR review comments)
  gh api "repos/$ORG/<repo>/issues/$pr_number/comments" \
    --jq '.[] | select(.user.login | test("greptile"; "i")) | .body' 2>/dev/null
done
```

Parse the score from the HTML tag: `<h3>Confidence Score: X/5</h3>`
Parse the improvement suggestions from the section: `### Path to 5/5 Confidence` (everything between that heading and the next heading or end of comment).

Classify each PR:
- **5/5 + COMMENTED** — Greptile fully confident, ready to merge
- **4/5 + COMMENTED** — Minor improvements suggested (extract Path to 5/5 items)
- **3/5 or below** — Needs significant work (flag prominently)
- **Any score + CHANGES_REQUESTED** — Greptile is blocking the PR, must address feedback before merge
- **No score** — Greptile hasn't reviewed yet or check is still running

## Step 5: Fetch CI Status for All My PRs

For each of my open PRs, get the full check status:

```bash
for pr_number in <list of my PR numbers>; do
  echo "=== PR #$pr_number ==="
  gh pr view "$pr_number" --repo "$ORG/<repo>" \
    --json statusCheckRollup --jq '[.statusCheckRollup[] | select(.name != null) | {name, status, conclusion}]' 2>/dev/null
done
```

## Step 6: Cross-Reference and Correlate

Match PRs to Linear issues by:
1. **Branch name matching**: Linear issues often generate branches like `{TEAM_PREFIX}-123-feature-name`, `user/{TEAM_PREFIX}-123-slug`, or `user/{TEAM_PREFIX}-123-impl`. Match the issue identifier pattern (team prefix + number, case-insensitive) in the PR's `headRefName`.
2. **Title matching**: Some PRs reference the Linear issue ID in the title (e.g., "[{TEAM_PREFIX}-123] Fix bug" or "({TEAM_PREFIX}-123)").

Classify each PR into one of these categories:
- **Linked to my Linear issue**: PR branch/title matches one of my assigned issues
- **My PR, no Linear issue**: PR authored by me but no matching Linear issue found
- **Other team PRs**: PRs by other authors (summarize briefly)

## Step 7: For Linked PRs, Get Detailed Issue Context

For each PR that matches one of my Linear issues, use `mcp__linear-server__get_issue` to get:
- Current state and priority
- Labels and project
- Any blocking relations (`includeRelations: true`)

## Step 8: Generate the Report

Present the report in this format:

### My PRs — Ready to Merge
PRs where: all CI green + mergeable=MERGEABLE + Greptile (4/5 or 5/5) + review state is NOT CHANGES_REQUESTED:
```
PR #number — Title
  Greptile: X/5 (COMMENTED) | Mergeable: MERGEABLE | CI: all green
  Linear: ISSUE-ID (State, Priority)
  URL
```

### My PRs — Greptile Below 5/5 (Action Items)
PRs with Greptile score < 5/5 but NOT blocked by other issues. For each, show the "Path to 5/5" items:
```
PR #number — Title — Greptile: X/5
  Path to 5/5:
    - [ ] item 1 from Greptile
    - [ ] item 2 from Greptile
  CI: status | Mergeable: status
  URL
```

### My PRs — Greptile CHANGES_REQUESTED
PRs where Greptile's review state is `CHANGES_REQUESTED` (blocking review). These MUST be addressed before merge regardless of score:
```
PR #number — Title — Greptile: X/5 (CHANGES_REQUESTED)
  Greptile feedback summary: key concerns from the review
  URL
```

### My PRs — Merge Conflicts / Needs Rebase
PRs where mergeable=CONFLICTING:
```
PR #number — Title
  Conflict with: identify likely conflicting PR if possible (e.g., same domain/files)
  URL
```

### My PRs — CI Failures
PRs with any check conclusion=FAILURE:
```
PR #number — Title
  Failed checks: list of failed check names
  URL
```

### My Issues WITHOUT Open PRs
List assigned issues that have NO matching open PR (these may need attention):
```
[PRIORITY] ISSUE-ID: Issue Title — State
```

### Other Open PRs (by repo)
Group remaining PRs by repository, showing:
```
repo-name
  #number — Title (author, updated X ago) — URL
```

**Note:** Do NOT include subtotals next to repo names or a summary dashboard. Keep the report clean and actionable.

## Step 8b: Send Slack Report (automatic)

After generating the report, ALWAYS send a summary to the user via Slack MCP using `mcp__claude_ai_Slack__slack_send_message`. This is NOT optional — it happens automatically as part of the command execution. Do NOT ask the user whether to send it.

Send the message to the user's configured status channel. If `linear-setup.json` contains a `slack.statusChannel` field, use that channel. Otherwise, ask the user which channel to send to on the first run, then remember it for the session.

The message uses the Slack Report Format defined in Step 9 below. Include ALL open PRs across the org (not just mine), grouped by repo, in the section order: Merged > CI Failures > Merge Conflicts. If no PRs were merged this session, omit the Merged section.

---

## Step 9: Suggested Course of Action

After generating the report, present a numbered action plan. Each action is a concrete batch operation the user can approve or skip. Use the exact PR numbers and repos from the data collected above.

### Action 1: Merge all ready PRs

List every PR from "Ready to Merge" as a batch merge command. Present them in dependency order (if PR A's branch was cut from PR B's branch, merge B first). If no dependencies, order by PR number ascending.

```
The following PRs have all CI green, are mergeable, and Greptile 4/5+:

  repo#number — Title
  repo#number — Title
  ...

Shall I merge all of them now? (yes/no/pick)
```

If the user says "yes", execute for each PR:
```bash
gh pr merge <number> --repo "$ORG/<repo>" --squash --delete-branch
```

If the user says "pick", ask which ones to merge.

**Slack Report Format (sent automatically):**

Header: `:github-pr: *Open PR Review - YYYY/MM/DD*`

Sections (in this exact order, per repo, separated by `---`):
1. `:github-merged:` *Merged* — PRs that were merged during this session (Action 1 results)
2. `:github-actions-failure:` *CI Failures* — PRs with failing checks
3. `:github-closed:` *Merge Conflicts* — PRs that need rebase

Each PR entry uses 3 levels of `-` (regular dash, NOT unicode bullets):
```
- :github-pr: <PR_URL|PRXXX> | <@SLACK_USER_ID> | Title
    - `branch-name` · :status_emoji: Status | :ci_emoji: CI · :greptile: X/5
        - *RECOMMENDATION:* Actionable recommendation
```

Rules:
- NO subtotals next to repo names (not "REPO-NAME (5 PRs)")
- NO summary dashboard at the bottom
- NO "Ready to Merge" section — those should already be merged in Action 1. If any remain unmerged (user declined), list them under a `:github-merge-approved: *Pending merge*` section
- Use `:github-merged:` (not `:merged:`) for merge-related headers
- Link Linear issues when available: `<https://linear.app/{LINEAR_WORKSPACE}/issue/{ISSUE_ID}|{ISSUE_ID}>`
- If unsure who to CC, ask the user
- Do NOT use unicode bullet points (no `•`, `◦`, `▪`) — use `-` at all levels

### Action 2: Fix merge conflicts / rebase

List every PR from "Merge Conflicts / Needs Rebase":

```
The following PRs have merge conflicts:

  repo#number — Title (likely conflicts with #other)
  ...

Shall I rebase them against the base branch? (yes/no/pick)
```

If the user says "yes", for each conflicting PR:
1. Check out the branch locally or in a worktree
2. Rebase against the base branch
3. Resolve conflicts if possible (or flag for manual resolution)
4. Force-push the rebased branch (with user confirmation)

**Smart suggestions**: When a conflicting PR also has CI failures, or is part of a dependency chain where another PR has CI failures, proactively suggest "rebase + fix" as a combined option instead of presenting them as separate actions. Example: "PR #X has a merge conflict AND #Y (its dependency) has CI failures. Shall I rebase + fix both? (rebase+fix / rebase-only / skip)"

### Action 3: Fix CI failures

List every PR from "CI Failures":

```
The following PRs have failing checks:

  repo#number — Title
    Failed: check-name-1, check-name-2
  ...

Shall I investigate and fix the failures? (yes/no/pick)
```

If the user says "yes", for each PR:
1. Fetch the failing check logs: `gh run view <run-id> --repo "$ORG/<repo>" --log-failed`
2. Analyze the failure
3. Propose a fix (checkout branch, fix, push)

### Action 4: Address Greptile CHANGES_REQUESTED

List every PR where Greptile left `CHANGES_REQUESTED`:

```
The following PRs are blocked by Greptile review:

  repo#number — Title — Greptile: X/5
    Key concerns: summary of Greptile feedback
  ...

Shall I address the Greptile feedback? (yes/no/pick)
```

If the user says "yes", for each PR:
1. Read the full Greptile review comments
2. Checkout the branch
3. Address each concern
4. Push the fix and request re-review

### Action 5 (if applicable): Address Path to 5/5

Only if there are PRs with Greptile 4/5 or below (but COMMENTED, not CHANGES_REQUESTED), and the user wants to improve them:

```
The following PRs could be improved to 5/5:

  repo#number — Title — Greptile: X/5
    - [ ] improvement item 1
    - [ ] improvement item 2
  ...

Want me to address these to reach 5/5? (yes/no/pick)
```

**IMPORTANT — ROUND-BY-ROUND INTERACTION**: Present actions ONE AT A TIME. After displaying each action, STOP and wait for the user's response (yes/no/pick/skip) before presenting the next action. Never dump all actions at once. This mirrors the brainstorming skill's conversational style — each round is a single decision point. If the user says "yes", execute that action, report the result, then present the next action. If the user says "skip" or "no", move to the next action immediately. Never auto-merge, auto-rebase, or auto-fix without explicit user approval.

**IMPORTANT — VERIFY BEFORE ACTING**: Before investigating or fixing any PR (CI failures, merge conflicts, Greptile feedback), always verify the PR is still open first using `gh pr view`. PRs may have been merged or closed in a different session. If a PR is already MERGED or CLOSED, skip it silently and move to the next one. Do not ask the user to confirm state you can check yourself.

## Notes
- All dates should be shown as relative time (e.g., "2 days ago")
- Sort my issues by priority (Urgent > High > Normal > Low)
- Highlight any PRs that are stale (no updates in 7+ days) with a warning
- The mergeable calculation MUST be triggered proactively — do not report UNKNOWN without first attempting the two-pass retry
- Greptile scores are extracted from issue comments by `greptile-apps[bot]`, NOT from PR review bodies (which are empty)
- The score is inside: `<h3>Confidence Score: X/5</h3>`
- The improvement path is under: `### Path to 5/5 Confidence`
- Greptile review state is fetched from PR reviews API: `repos/{owner}/{repo}/pulls/{number}/reviews` — filter by `greptile-apps[bot]`, take the LAST review state
- For merge, always use `--squash --delete-branch` targeting the default branch (read from `linear-setup.json` `git.baseBranch` or detect via `gh repo view --json defaultBranchRef`)
- Dependency detection: if two PRs touch the same files or one branch is based on another, flag merge order

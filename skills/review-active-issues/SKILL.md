---
name: review-active-issues
description: >
  Reviews active Linear issues with GitHub cross-referencing, activity insights,
  and actionable recommendations. Use when the user asks "what are my active issues",
  "review my Linear issues", "what's the status of my issues", "show me my backlog",
  "what issues need attention", or wants a comprehensive view of their Linear workspace.
  Do NOT trigger for: creating new issues, PR review, or code implementation.
---

# Review Active Linear Issues: $ARGUMENTS

You are a **project manager bot** reviewing active Linear issues, cross-referencing with GitHub, generating recommendations and insights, and optionally reporting to Slack.

**Input**: Optional arguments — `mine` (default), `all`, `team`, `backlog`, `started` (combinable: e.g., `team started`)
**Output**: Terminal report + optional Slack message

---

## Argument Parsing

Parse `$ARGUMENTS` (space-separated, case-insensitive):

| Argument | Behavior |
|----------|----------|
| (none) / `mine` | My issues, all states except Done/Cancelled |
| `all` | All assignees |
| `team` | Issues from my team(s) |
| `backlog` | Only Backlog state |
| `started` | Only In Progress + In Review |

Arguments are combinable: `/make-no-mistakes:review-active-issues team started` = team issues in started states only.

---

## Configuration Detection

Before starting, detect the workspace context:

1. **GitHub org**: `gh repo view --json owner --jq .owner.login` (from current repo)
2. **Linear team**: Query `mcp__linear-server__list_teams` to detect the user's team(s)
3. **Project config**: Read `linear-setup.json` at repo root if it exists for:
   - `team.key` — Issue prefix (e.g., `ALT`, `DOJ`)
   - `projects` — Map of project slugs to names/IDs
4. **Slack channel**: If the user wants Slack reporting, ask which channel to use on first run

If no `linear-setup.json` exists, auto-detect from Linear MCP and proceed with defaults.

---

## Step 1: Fetch Linear Issues

Use `mcp__linear-server__list_issues` with filters based on arguments.

- Default: `assignee: "me"`, `includeArchived: false`
- **Multi-state filtering:** The `state` parameter accepts a single value, not exclusion. To get "everything except Done/Cancelled", make **two calls**:
  1. `state: "started"` (returns In Progress + In Review)
  2. `state: "backlog"` (returns Backlog + Triage)

  Merge the results. For `started` argument, only call (1). For `backlog` argument, only call (2).

- **Pagination:** Use `limit: 250` (max). If `hasNextPage` is true, follow the `cursor` for additional pages. Cap at 3 pages (750 issues) to avoid token explosion.
- Capture: id, title, status, priority, labels, project, gitBranchName, updatedAt, assignee, createdBy

### Step 1b: Auto-assign Unassigned Issues Created by Me

After fetching issues, scan for any issue where:
- `assignee` is null/empty AND `createdBy` matches the current user

For each such issue, auto-assign using `mcp__linear-server__save_issue` with the user's assignee ID. Report these silently in the terminal output (e.g., "Auto-assigned 3 unassigned issues I created").

---

## Step 2: Group by Hierarchy

Grouping order (outer to inner):

1. **Project** (Linear project name, or "Sin proyecto" / "No project")
2. **Repo** (inferred from team or branch name — detect from GitHub org)
3. **State** (In Review > In Progress > Backlog > Triage)
4. **Priority** (Urgent > High > Medium > Low)
5. **Days since last update** (most stale last)

**Repo inference:** Use the branch name or Linear team/label to infer which GitHub repo the issue belongs to. List repos in the org via `gh repo list {org} --limit 50 --json name` and match by convention (e.g., branch prefix, team name, label).

---

## Step 3: Cross-reference with GitHub

For each issue with a `gitBranchName`:

1. Check for open PR on that branch:
```bash
gh pr list --repo {org}/{repo} --head {branch} --state open --json number,url,mergeable,title --limit 1
```

2. If no open PR, check for merged PRs:
```bash
gh pr list --repo {org}/{repo} --head {branch} --state merged --json number,url --limit 1
```

3. If no PR at all, check if branch exists:
```bash
gh api repos/{org}/{repo}/branches/{branch} --jq .name 2>/dev/null
```

Classify each issue:
- Has open PR (with CI/mergeable status)
- Has merged PR (candidate for "Move to Done")
- Has branch but no PR
- No branch, no PR

---

## Step 4: INSIGHT — Activity in Last 24h

Sources (in this order):

1. **Git commits** on the branch (if exists) — use GitHub API:
```bash
gh api "repos/{org}/{repo}/commits?sha={branch}&since=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)&per_page=10" \
  --jq '.[].commit.message' 2>/dev/null
```
Falls back to `git log` if the branch is in the local repo.

2. **Linear comments** on the issue:
   - `mcp__linear-server__list_comments` with `issueId`, `orderBy: "createdAt"`, `limit: 10`
   - **Note:** The tool does NOT support server-side `createdAt` filtering. Fetch recent comments and filter client-side for those within 24h.

3. **Slack** (optional, only if user requests):
   - Search Slack for the issue ID

Compose a one-line summary of what happened. If no activity: "Sin actividad en 24h" or "Sin actividad X dias".

---

## Step 5: RECOMENDACION — Automatic Recommendation

Rules (first match wins):

| # | Condition | Recommendation |
|---|-----------|---------------|
| 1 | In Review + PR merged | Mover issue a Done en Linear |
| 2 | In Review + PR open + CI green + mergeable | Mergear PR |
| 3 | In Review + PR open + CI failing | Fix CI antes de merge |
| 4 | In Review + no PR | Abrir PR |
| 5 | In Progress + PR + CI failing | Fix CI |
| 6 | In Progress + no branch | Crear branch y empezar |
| 7 | Backlog + Urgent/High priority | Mover a In Progress |
| 8 | Any state + 7+ days inactive | Revisar o reasignar |
| 9 | (default) | — |

**Empty case:** If zero issues are returned, show "No active issues found for the given filters." in terminal.

---

## Report Format — Terminal

```
## Active Issues Review — YYYY-MM-DD

### Proyecto: <Project Name>
**<repo-name>**

<State>
  [Priority] ISSUE-ID: Title
    Branch: <branch> · PR #XXX (status) / No PR / Sin branch
    RECOMENDACION: actionable text
    INSIGHT: activity summary

### Sin proyecto
  [Priority] ISSUE-ID: Title
    ...
```

---

## Report Format — Slack (optional)

If the user has configured a Slack status channel (via `linear-setup.json` or first-run prompt), send the report automatically. Otherwise, ask if they want to send it.

Structure per project, per repo, per state. Use Slack mrkdwn formatting with custom emojis if available, or plain text fallback.

### Slack Formatting Rules

- `-` regular at all levels (NO unicode bullets)
- No subtotals next to project/repo names
- No summary dashboard at the bottom
- RECOMENDACION before INSIGHT
- Linear issue links: `<https://linear.app/{workspace}/issue/{ISSUE-ID}|{ISSUE-ID}>`
- GitHub PR links: `<https://github.com/{org}/{repo}/pull/XXX|PRXXX>`

---

## Round-by-Round Actions (after report)

Present ONE action at a time, wait for user response (yes/no/pick/skip).

### Action 1: Move to Done

Issues in In Review whose PR is already merged.
```
The following issues have merged PRs and can be moved to Done:
  ISSUE-XXX — Title (PR #XXX merged)
  ...
Shall I move them to Done? (yes/no/pick)
```
Execute via `mcp__linear-server__save_issue` with state change.

### Action 2: Move Urgent/High Backlog to In Progress
```
The following Backlog issues have Urgent/High priority:
  ISSUE-XXX — Title (Urgent)
  ...
Shall I move them to In Progress? (yes/no/pick)
```

### Action 3: Flag inactive issues (7+ days)
```
The following issues have no activity in 7+ days:
  ISSUE-XXX — Title (X days inactive, assigned to @Name)
  ...
Shall I add a review comment? (yes/no/pick)
```

### Action 4: Add progress notes

Issues without recent comments that had git/PR activity in last 24h.
```
The following issues had code activity but no Linear comment:
  ISSUE-XXX — Title (3 commits today)
  ...
Shall I add a progress comment to Linear? (yes/no/pick)
```

---

## Verify Before Acting

Before any Linear state change or GitHub operation, verify the issue/PR is still in the expected state. Issues may have been updated in a different session.

---

## Usage

```bash
claude /make-no-mistakes:review-active-issues            # My issues (default)
claude /make-no-mistakes:review-active-issues team        # Team issues
claude /make-no-mistakes:review-active-issues started     # Only In Progress + In Review
claude /make-no-mistakes:review-active-issues team backlog # Team backlog
```

### Requirements

* Linear MCP server configured in Claude Code
* GitHub CLI (`gh`) authenticated
* Slack MCP configured (optional, for Slack reporting)

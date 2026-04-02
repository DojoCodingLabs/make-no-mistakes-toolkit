# Takeover PR: $ARGUMENTS

You are a **PR takeover assistant**. The user wants to pick up an open PR from a teammate in a specific repo, check it out locally, review it, and continue the work.

**Input**: `$ARGUMENTS` — a repository name under the current GitHub org (e.g., `dojo-os`). Optionally a PR number (e.g., `dojo-os 42`) to skip random selection.
**Output**: PR checked out locally, code review summary, and ready-to-work state.

---

## Step 0: Detect Organization

Detect the GitHub organization dynamically. Try these methods in order:

**Method A** — Infer from the current repo:
```bash
ORG=$(gh repo view --json owner --jq '.owner.login' 2>/dev/null)
```

**Method B** — Read from `linear-setup.json` if it exists at the repo root:
```bash
ORG=$(cat linear-setup.json 2>/dev/null | jq -r '.github.org // empty')
```

**Method C** — If neither works, ask the user which org to use.

---

## Step 1: Parse Arguments

Parse `$ARGUMENTS`:
- If it contains a repo name + PR number (e.g., `dojo-os 42`): use that PR directly, skip to Step 3.
- If it contains only a repo name (e.g., `dojo-os`): proceed to Step 2 to pick a random PR.
- If empty: list available repos and ask the user to pick one.

To list repos when needed:
```bash
gh repo list "$ORG" --limit 50 --json name --jq '.[].name' | sort
```

---

## Step 2: List Open PRs and Pick One at Random

Fetch all open PRs for the target repo that are NOT authored by the current user:

```bash
ME=$(gh api user --jq '.login')
gh pr list --repo "$ORG/$REPO" --state open --json number,title,author,headRefName,updatedAt,isDraft,url \
  --jq "[.[] | select(.author.login != \"$ME\")]"
```

If no PRs from teammates are found:
```
No open PRs from teammates in $ORG/$REPO. Nothing to take over.
```
And stop.

If PRs are found, pick one at random. Show the selection:

```
Found X open PRs from teammates in $ORG/$REPO.

Selected at random:
  PR #NUMBER — Title
  Author: @username | Branch: branch-name | Updated: X ago
  URL

Checking out now...
```

If there's only 1 PR, select it directly without mentioning randomness.

---

## Step 3: Checkout the PR Branch

Check out the PR branch locally:

```bash
gh pr checkout NUMBER --repo "$ORG/$REPO"
```

Verify the checkout succeeded:
```bash
git branch --show-current
git log --oneline -5
```

---

## Step 4: Gather Context

### 4a. PR Details

```bash
gh pr view NUMBER --repo "$ORG/$REPO" --json title,body,additions,deletions,changedFiles,commits,labels,reviewRequests,reviews,comments
```

### 4b. Diff Summary

```bash
gh pr diff NUMBER --repo "$ORG/$REPO" --stat
```

### 4c. Full Diff

```bash
gh pr diff NUMBER --repo "$ORG/$REPO"
```

### 4d. CI Status

```bash
gh pr checks NUMBER --repo "$ORG/$REPO"
```

### 4e. Linear Issue (if linked)

Try to extract a Linear issue ID from the branch name or PR title. Common patterns:
- Branch: `PREFIX-123-description`, `user/PREFIX-123-slug`
- Title: `[PREFIX-123] Title`, `(PREFIX-123) Title`

If found, fetch the issue context using `mcp__claude_ai_Linear__get_issue`.

### 4f. Greptile Review (if available)

```bash
gh api "repos/$ORG/$REPO/issues/NUMBER/comments" \
  --jq '.[] | select(.user.login | test("greptile"; "i")) | .body' 2>/dev/null
```

Parse Greptile confidence score from `<h3>Confidence Score: X/5</h3>` and Path to 5/5 items if present.

---

## Step 5: Code Review

Review the full diff and produce a structured assessment:

### Overview
- What does this PR do? (1-2 sentences)
- What Linear issue does it address? (if found)

### Quality Assessment
- **Correctness**: Are there bugs, edge cases, or logic errors?
- **Security**: Any OWASP top 10 concerns (injection, XSS, auth issues)?
- **Tests**: Are there tests? Do they cover the changes adequately?
- **Style**: Does the code follow the repo's existing patterns?

### CI Status
- List passing/failing checks
- If CI is failing, summarize what's wrong

### Greptile Score (if available)
- Current score and Path to 5/5 items

### Issues Found
Number each issue with severity:
```
1. [HIGH] path/to/file.ts:42 — Description of the issue
2. [MEDIUM] path/to/file.ts:87 — Description of the issue
3. [LOW] path/to/file.ts:15 — Description of the issue
```

### What's Left to Do
Based on the PR description, Linear issue, review feedback, and CI status:
- [ ] Item that still needs work
- [ ] Item that still needs work

---

## Step 6: Ready to Work

After presenting the review, confirm readiness:

```
Checked out: branch-name
PR: #NUMBER — Title (by @author)
Repo: $ORG/$REPO
Issues found: X high, Y medium, Z low
CI: passing/failing

You're on the branch and ready to work. What would you like to tackle first?
1. Fix the issues found in the review
2. Address CI failures
3. Address Greptile feedback
4. Continue with unfinished work from the PR description
5. Something else
```

---

## Notes
- Always use `gh pr checkout` to get the branch — this handles forks and cross-repo PRs correctly
- Do NOT create a new branch — work directly on the teammate's branch so changes land on their PR
- If the PR is a draft, mention it but proceed normally
- If the PR has merge conflicts, flag them prominently in the review
- Show relative times for dates (e.g., "3 days ago")

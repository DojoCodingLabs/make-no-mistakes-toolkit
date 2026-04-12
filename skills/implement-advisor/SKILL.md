---
name: implement-advisor
description: >
  Detects when the user wants to work on a Linear issue, implement a feature,
  fix a bug, or start development work. Suggests the /make-no-mistakes:implement command.
  Triggers on: "implement", "work on issue", "start on", "pick up issue",
  "Linear issue", "build feature", "fix bug", "start coding", "work on ALT-",
  "work on DOJ-", "implement this", "let's build", "start implementing",
  "pick up this ticket", "work on this task", "execute this issue",
  "develop this feature", "ship this", "implement ALT-", "implement DOJ-",
  pastes a Linear issue URL, or provides an issue ID.
  Does NOT trigger on: rebase, sync branches, standup, test execution,
  code review, general coding questions, or session management tasks.
---

# Implement Advisor

You detected that the user wants to **implement a Linear issue or start development work** — not review, sync, or test.

## When This Applies

This skill activates when the user describes a situation involving:
- Working on a specific Linear issue (ID or URL)
- Starting a new feature, fix, or chore
- Picking up a ticket from the backlog
- Any intent to write code for a tracked issue

## What To Do

1. Confirm the user wants to implement (not just discuss or review)
2. Suggest the dedicated command:

> This is an implementation task. Use:
>
> `/make-no-mistakes:implement {ISSUE-ID}`
>
> This command handles the full disciplined protocol:
> - Fetches the Linear issue (title, description, status, labels)
> - Claims and sets status to In Progress
> - Creates a fresh branch + worktree (isolated from main tree)
> - Implements following all project conventions
> - Creates a PR with linked issue
> - Tags all reviewers (Greptile, CodeRabbit, Graphite)
> - Fixes reviewer feedback until all gates pass
> - Verifies CI, merges, cleans up worktree
> - Updates Linear to Done
>
> For multiple issues: `/make-no-mistakes:implement ALT-13 ALT-14 ALT-15`

3. If the user is just asking about an issue (not implementing), suggest `spike-recommend` or `spec-recommend` instead.
4. If the user wants to review existing work, suggest `review-open-prs` instead.

---
name: implement-advisor
description: >
  Detects when the user wants to work on a Linear issue, implement a feature,
  fix a bug, or start development work. Suggests the /make-no-mistakes:implement command.
  Triggers on: "implement", "work on issue", "start on", "pick up issue",
  "Linear issue", "build feature", "fix bug", "start coding",
  "work on <PREFIX>-NNN" or "implement <PREFIX>-NNN" for any Linear issue
  prefix (APP, BACK, SEC, MYTEAM, etc. — based on your workspace),
  "implement this", "let's build", "start implementing",
  "pick up this ticket", "work on this task", "execute this issue",
  "develop this feature", "ship this",
  pastes a Linear issue URL, or provides an issue ID.
  Does NOT trigger on: rebase, sync branches, standup, test execution,
  code review, general coding questions, or session management tasks.
---

# Implement Advisor

You detected that the user wants to **implement a Linear issue or start development work** — not review, sync, or test.

## CHANGELOG

- **2026-05-13 — Gate on issue redaction quality.** Before recommending `/make-no-mistakes:implement`, fetch the Linear issue and check whether its description is in Bilingual Format (Human Layer + Agent Layer + ACs + Context Files). If not, recommend `/make-no-mistakes:spike-recommend {ISSUE-ID}` first to normalize the description in place, THEN `/make-no-mistakes:implement`. Implementation agents work much better against a normalized brief.

## When This Applies

This skill activates when the user describes a situation involving:
- Working on a specific Linear issue (ID or URL)
- Starting a new feature, fix, or chore
- Picking up a ticket from the backlog
- Any intent to write code for a tracked issue

## What To Do

1. **Confirm intent.** Make sure the user wants to implement (not just discuss or review). If the intent is unclear, ask.

2. **Parse the issue ID** from the user's message ($ARGUMENTS, the pasted URL, or the most recent conversation context). Format: `{PREFIX}-{NNN}` (e.g., `DOJ-4058`, `ALT-13`).

3. **Redaction-quality gate — fetch the issue and inspect its description.** Call `mcp__plugin_linear_linear__get_issue` (or the workspace-equivalent Linear MCP `get_issue` tool) with the parsed ID and read the `description` field.

   Check for Bilingual Format markers. Required headers — any of these missing means the issue is NOT normalized:
   - `## 👤 HUMAN LAYER`
   - `## 🤖 AGENT LAYER`
   - `### Acceptance Criteria`
   - `### Context Files`

   Alternative quick check: presence of both literal strings `HUMAN LAYER` and `AGENT LAYER` anywhere in the description. If both strings are absent, the issue is not redacted.

   Edge cases:
   - **Empty / 1-line description** → not redacted.
   - **Linear `get_issue` fails or the user passed a free-text request with no ID** → skip the gate and treat as not redacted (recommend `/spike-recommend` first).
   - **Description has the Bilingual headers but the sections are stubs ("TBD", "N/A everywhere")** → treat as not redacted; the implementation subagent still gets a useless brief.

4. **Recommend based on the gate's result.**

   **If the issue IS redacted (Bilingual Format present and substantive):**

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

   **If the issue is NOT redacted (missing Bilingual Format, or empty, or stub-only):**

   > The issue {ISSUE-ID} doesn't yet use the Bilingual Format (Human Layer + Agent Layer + ACs + design rationale). Implementation agents work much better against a normalized brief — running `/implement` against a 1-liner produces shallow work.
   >
   > Two-step flow:
   >
   > 1. `/make-no-mistakes:spike-recommend {ISSUE-ID}` — fetches the issue, regenerates the description in Bilingual Format, updates Linear in place (labels go to the sidebar, body stays narrative).
   > 2. `/make-no-mistakes:implement {ISSUE-ID}` — then run the full disciplined protocol against the now-normalized brief.
   >
   > If you want to skip the gate and run `/implement` directly anyway (e.g. you've already redacted the issue manually), say so and I'll defer.

5. **Other intents (escape hatches):**
   - If the user is just asking about an issue (not implementing), suggest `spike-recommend` or `spec-recommend` instead.
   - If the user wants to review existing work, suggest `review-open-prs` instead.

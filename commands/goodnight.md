# Goodnight: $ARGUMENTS

You are a **session handoff assistant**. The user is done for the day and wants to save full session context so tomorrow's Claude Code session can pick up exactly where they left off.

**Input**: A short label for the file (e.g., "auth-refactor", "doj-1234", "pr-reviews"). If empty, auto-generate from the main topic discussed.
**Output**: A `next-day-<label>.md` file saved to `~/Desktop/` + compact summary in terminal

---

## Step 1: Generate the Label

Parse `$ARGUMENTS` as the file label:
- If provided: sanitize to kebab-case (lowercase, hyphens, no spaces/special chars)
- If empty: derive from the primary topic of the session (e.g., "slash-commands", "e2e-testing", "openclaw-hooks")

The output file will be: `~/Desktop/next-day-<label>.md`

Resolve the path dynamically:
```bash
echo ~/Desktop
```

---

## Step 2: Analyze the Full Session

Review the ENTIRE conversation history. Extract:

### 2a. What Was Done (completed work)
- Tasks finished, files created/edited/deleted, commands run
- Commits made, PRs opened/merged, Linear issues updated
- Decisions finalized and their rationale

### 2b. What's In Progress (started but not finished)
- Partially implemented features
- Tests written but not passing
- PRs opened but not merged
- Branches with uncommitted changes

### 2c. What's Pending (discussed but not started)
- Items explicitly deferred ("we'll do this tomorrow")
- Follow-ups mentioned but not acted on
- User requests that were acknowledged but not executed

### 2d. Active Context (state of the world right now)
- Current git branch and working tree state
- Any running processes or servers
- Open worktrees
- Linear issues in progress

### 2e. Key Decisions & Constraints
- Architecture choices made during the session
- Constraints discovered (API limitations, bugs found, etc.)
- Feedback/corrections the user gave (that aren't already in memory)

### 2f. Breadcrumbs (important details future-you needs)
- File paths that are central to the work
- Specific line numbers or function names being modified
- API endpoints, database tables, or config keys involved
- Error messages or stack traces that were being debugged
- Links shared (Linear issues, PRs, docs, Slack threads)

---

## Step 3: Verify with Git

```bash
git branch --show-current
git status --short
git stash list
git log --oneline -5
```

Include any uncommitted changes, stashes, or recent commits in the handoff file.

Also check for open worktrees:
```bash
git worktree list
```

---

## Step 4: Check Linear Issues

If any Linear issues were discussed or worked on during the session, fetch their current state:
- Use `mcp__linear-server__get_issue` for each referenced issue
- Note current status, assignee, and any recent comments

---

## Step 5: Write the Handoff File

Write the file to `.claude/next-day/next-day-<label>.md` with this structure:

```markdown
---
created: YYYY-MM-DD HH:MM
session_topic: <one-line description of what the session was about>
branch: <current git branch>
status: pending  # changes to "resumed" when picked up
---

# Next Day: <Session Topic>

## Done
- <completed item>
- <completed item>

## In Progress
- <item>: <current state and what remains>
  - Files: `path/to/file1.ts`, `path/to/file2.ts`
  - Branch: `feature/xyz`

## Pending (Not Started)
- [ ] <item to do>
- [ ] <item to do>

## Resume Instructions

To continue this work:

1. <first thing to do>
2. <second thing to do>
3. <third thing to do>

### Key Files
- `path/to/main-file.ts` — <why it matters>
- `path/to/other-file.ts` — <why it matters>

### Key Context
- <important detail that isn't obvious from the code>
- <constraint or decision to remember>

## Git State
- Branch: `<branch>`
- Uncommitted changes: <yes/no — list if yes>
- Stashes: <list if any>
- Open worktrees: <list if any>

## Linear Issues
- <DOJ-XXXX>: <title> — <current state>

## Session Log (Compressed)
<2-3 paragraph narrative of what happened in the session, in chronological order, including key decision points and why things went the way they did. This is the "story" of the session for context continuity.>
```

---

## Step 6: Save New Memories (if needed)

If the session produced feedback, decisions, or user preferences that should persist beyond tomorrow:
- Save them as proper memory files (not in the next-day file)
- The next-day file is ephemeral context; memory files are permanent

---

## Step 7: Terminal Output

After writing the file, show a compact summary:

```
Goodnight! Session saved to ~/Desktop/next-day-<label>.md

Done: X items
In Progress: Y items
Pending: Z items
Branch: <branch> (clean/dirty)

To resume tomorrow:
  1. Open Claude Code in this directory
  2. Say: "Read .claude/next-day/next-day-<label>.md and continue"

Goodnight! 🌙
```

---

## Cleanup Old Files

If there are next-day files older than 7 days in `.claude/next-day/`, list them and ask:
```
Found X next-day files older than 7 days:
  - next-day-old-topic.md (10 days ago)
  ...
Want me to delete them? (yes/no)
```

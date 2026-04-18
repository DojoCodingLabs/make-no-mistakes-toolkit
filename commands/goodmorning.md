---
description: Bootstrap your day by scanning for pending next-day handoff files and guiding you through resuming where you left off.
priority: 50
---

# Good Morning

You are a **session bootstrap assistant**. The user just started their day and wants to pick up where they left off by reviewing all pending next-day handoff files.

**Input**: None required
**Output**: Index of all pending next-day files, then guided resume of the one the user picks

---

## Step 1: Scan for Next-Day Files

Search for `next-day-*.md` files in these locations:

```bash
find ~/Desktop -maxdepth 1 -name "next-day-*.md" -type f 2>/dev/null
find .claude/next-day -maxdepth 1 -name "next-day-*.md" -type f 2>/dev/null
```

If no files are found in either location, say:
```
No pending next-day files found. Starting fresh!
```
And stop.

---

## Step 2: Read and Index All Files

For each file found, read the frontmatter and first few sections to extract:
- **Label** (from filename: `next-day-<label>.md`)
- **Created date** (from frontmatter `created:`)
- **Session topic** (from frontmatter `session_topic:`)
- **Status** (from frontmatter `status:` — `pending` or `resumed`)
- **Branch** (from frontmatter `branch:`)
- **Location** (Desktop or .claude/next-day)
- **Done count** (number of completed items)
- **In Progress count** (number of in-progress items)
- **Pending count** (number of pending items)

---

## Step 3: Present the Index

Show a table sorted by creation date (newest first):

```
Good morning! Found X next-day file(s):

| # | Label | Date | Topic | Status | Branch | Pending | Location |
|---|-------|------|-------|--------|--------|---------|----------|
| 1 | openclaw | 2026-03-15 | Hook refactor | pending | feat/hooks | 3 | Desktop |
| 2 | doj-1234 | 2026-03-14 | Auth fix | resumed | fix/auth | 1 | .claude/next-day |

Which one do you want to resume? (number, "all" to see all, or "none" to start fresh)
```

If there's only 1 file, skip the selection and go directly to Step 4.

---

## Step 4: Load the Selected File

Read the full contents of the selected file and present:

### 4a. Quick Status
```
Resuming: next-day-<label>.md (<date>)
Topic: <session_topic>
Branch: <branch>
```

### 4b. Verify Current State

Check if the branch still exists and the repo state:
```bash
git branch --show-current
git branch --list <branch-from-file>
git status --short
git stash list
```

Report any discrepancies between the saved state and current state:
- Branch changed since the file was saved
- New uncommitted changes not in the file
- Stashes that appeared/disappeared

### 4c. Show Resume Instructions

Display the "Resume Instructions" section from the file verbatim — these are the step-by-step actions to continue.

### 4d. Show In Progress + Pending Items

List all in-progress and pending items as a checklist:
```
In progress:
- <item>: <current state>

Pending:
- [ ] <item>
- [ ] <item>
```

### 4e. Show Key Context

Display the "Key Context" and "Key Files" sections — these are the breadcrumbs that prevent losing context.

### 4f. Linear Issues Refresh

If the file references Linear issues, fetch their CURRENT state (not what the file says):
```
Linear Issues (current state):
- DOJ-XXXX: <title> — <current state> (was: <state in file>)
```

Use `mcp__linear-server__get_issue` for each referenced issue.

---

## Step 5: Mark as Resumed

After presenting the file, update its frontmatter:
- Change `status: pending` to `status: resumed`
- Add `resumed_at: YYYY-MM-DD HH:MM`

---

## Step 6: Offer Actions

```
What would you like to do?
1. Start with the first pending item
2. View the full Session Log (narrative from the previous session)
3. Archive this file (move to .claude/next-day/archive/)
4. Move on to something else
```

---

## Cleanup: Old Files

After presenting the index (Step 3), if any files are older than 7 days, append a note:

```
Files older than 7 days:
  - next-day-old-thing.md (12 days, Desktop)
Archive them? (yes/no)
```

Archive = move to `.claude/next-day/archive/` (create if needed), NOT delete.

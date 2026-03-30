# Good Morning

You are a **session bootstrap assistant**. The user just started their day and wants to pick up where they left off by reviewing all pending next-day handoff files.

**Input**: None required
**Output**: Index of all pending next-day files, then guided resume of the one the user picks

---

## Step 1: Scan for Next-Day Files

Search for `next-day-*.md` files in these locations:

```bash
find ~/Escritorio -maxdepth 1 -name "next-day-*.md" -type f 2>/dev/null
find .claude/next-day -maxdepth 1 -name "next-day-*.md" -type f 2>/dev/null
```

If no files are found in either location, say:
```
No hay archivos next-day pendientes. Empezá limpio!
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
- **Location** (Escritorio or .claude/next-day)
- **Done count** (number of completed items)
- **In Progress count** (number of in-progress items)
- **Pending count** (number of pending items)

---

## Step 3: Present the Index

Show a table sorted by creation date (newest first):

```
Buenos dias! Encontré X archivo(s) next-day:

| # | Label | Fecha | Topic | Status | Branch | Pendientes | Ubicación |
|---|-------|-------|-------|--------|--------|------------|-----------|
| 1 | openclaw | 2026-03-15 | Hook refactor | pending | feat/hooks | 3 | Escritorio |
| 2 | doj-1234 | 2026-03-14 | Auth fix | resumed | fix/auth | 1 | .claude/next-day |

¿Cuál quieres retomar? (número, "all" para ver todos, o "none" para empezar limpio)
```

If there's only 1 file, skip the selection and go directly to Step 4.

---

## Step 4: Load the Selected File

Read the full contents of the selected file and present:

### 4a. Quick Status
```
Retomando: next-day-<label>.md (<date>)
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
En progreso:
- <item>: <current state>

Pendiente:
- [ ] <item>
- [ ] <item>
```

### 4e. Show Key Context

Display the "Key Context" and "Key Files" sections — these are the breadcrumbs that prevent losing context.

### 4f. Linear Issues Refresh

If the file references Linear issues, fetch their CURRENT state (not what the file says):
```
Linear Issues (estado actual):
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
¿Qué quieres hacer?
1. Empezar con el primer item pendiente
2. Ver el Session Log completo (narrativa de la sesión anterior)
3. Archivar este archivo (mover a .claude/next-day/archive/)
4. Seguir con otra cosa
```

---

## Cleanup: Old Files

After presenting the index (Step 3), if any files are older than 7 days, append a note:

```
Archivos con más de 7 días:
  - next-day-old-thing.md (12 días, Escritorio)
¿Quieres archivarlos? (yes/no)
```

Archive = move to `.claude/next-day/archive/` (create if needed), NOT delete.

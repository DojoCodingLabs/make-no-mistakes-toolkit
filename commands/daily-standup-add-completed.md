---
description: Append completed work items to today's standup file. Accepts a description, PR number, Linear issue ID, or --reset flag as $ARGUMENTS.
---

# Daily Standup — Add Completed Items

You are a **standup assistant**. The user wants to append completed work items to today's standup file.

**Input**: `$ARGUMENTS` — a description of what was completed, or a flag:
- Free-form text, a PR number (`#NNN`), a Linear issue (`XXX-NNNN`), or empty to auto-detect
- `--reset` — Delete the existing file and start fresh with today's date (no archive, no questions)

**Output**: Updated `daily-standup.md` with new items appended under the correct date

---

## Step 0: Load Configuration

Read `slack-config.json` from the project root. If it does not exist, use defaults:

```json
{
  "repos": {},
  "linearPrefixes": ["DOJ"],
  "linearOrgSlug": "dojo-coding"
}
```

Use the config values throughout this command:
- `repos` → repo-to-project mapping for grouping items
- `linearPrefixes` → which issue prefixes to recognize (e.g., DOJ, CIV, SEC, ALT)
- `linearOrgSlug` → for building Linear URLs

**IMPORTANT — Standup file location is ALWAYS `~/Escritorio/daily-standup.md`:**

The standup file path is **NOT configurable**. It is always `~/Escritorio/daily-standup.md` (expanded to the absolute path — e.g., `/home/<user>/Escritorio/daily-standup.md`). This applies without exception:

- Never read or write `./daily-standup.md` or any path inside a repo directory
- Ignore any `standupFile` key in `slack-config.json` if present (it is deprecated)
- If a `daily-standup.md` exists inside a repo directory, delete it and merge its content into `~/Escritorio/daily-standup.md`
- The standup is a cross-repo summary — combining work from all repos into the single desktop file is intentional

**Rationale:** The standup aggregates work across multiple repos. Storing it in a repo (1) fragments per-repo when work spans multiple projects, (2) risks accidental commit, (3) is not where the user looks for it. The user has the same rule for `/goodnight` — standup follows the same pattern.

---

## Step 1: Find or Create the File

```bash
STANDUP_FILE="$HOME/Escritorio/daily-standup.md"
```

### If `--reset` flag is present:
- Delete the existing file if it exists
- Create a new file with today's date and empty sections (`## Completado`, `## En Progreso`, `## Pendiente`)
- Strip `--reset` from `$ARGUMENTS` and continue with any remaining arguments

### Normal flow:
- If the file doesn't exist, create it with today's date
- If the file exists, read it and check the date in the `# Daily Standup — YYYY-MM-DD` header
- If the date matches today, append to the existing `## Completado` section
- If the date is from a **previous day**, ask the user:
  ```
  El standup es de YYYY-MM-DD (hace N días). ¿Qué quieres hacer?
  1. Seguir agregando al mismo archivo (sesión nocturna que cruza medianoche)
  2. Archivar el contenido anterior y empezar día nuevo
  3. Borrar todo y empezar limpio (equivalente a --reset)
  ```
  - Option 1: Keep the file as-is, just append new items (do NOT change the date header)
  - Option 2: Move old content under a `---` separator, update the date header to today
  - Option 3: Delete and recreate with today's date

---

## Step 2: Determine What to Add

### If `$ARGUMENTS` is provided:
- Parse the text for PR numbers (`#NNN`), Linear issues (`DOJ-NNNN`), or free-form descriptions
- For PR numbers: fetch title and status via `gh pr view`
- For Linear issues: fetch title and status via Linear MCP
- For free-form text: use as-is

### If `$ARGUMENTS` is empty:
- Auto-detect completed work from the current session:
  1. Check `git log --oneline -5` for recent commits
  2. Check `gh pr list --author=@me --state=merged --limit=3` for recently merged PRs
  3. Check the conversation history for completed tasks
- Present what was found and ask: "Add these items? (y/n/edit)"

---

## Step 3: Format and Append

### Organization: Group by Linear Project / Repo

**ALL three sections** (`## Completado`, `## En Progreso`, `## Pendiente`) MUST be grouped under repo/project headers. Use `###` for the repo group and `####` for individual items within it.

**Repo-to-project mapping comes from `slack-config.json` → `repos`.**

Each entry maps a repo slug to its display name and Linear project. If a repo is not in the config, use `### <Repo Name> (\`repo-slug\`)` as the header.

**Determining the repo group:**
1. If the item is a PR: use the repo from `gh pr view` or the PR URL
2. If the item is a Linear issue: use the `project` field from the issue
3. If auto-detected from git: use the current repo
4. If unclear: ask the user

**If the repo group header already exists** in the file, append the new item under it. Do NOT create a duplicate header.

### Item format

```markdown
#### <PR/Issue title>
- <concise description of what was done>
- CI: <status> | Greptile: <status> (if applicable)
```

Item title patterns:
- PRs: `#### PR #976 — Field allowlists (DOJ-2647 / SEC-37)`
- Linear issues: `#### DOJ-2683 — Tool visibility fix`
- Spikes: `#### Spike DOJ-2701 — AI Setter Agent`
- Other: `#### Limpieza branches`

---

## Step 4: Update Pending (if applicable)

If a completed item was previously in the `## Pendiente` section:
- Remove it from `## Pendiente`
- Move it to `## Completado` with `[x]` prefix

---

## Step 5: Confirm

After updating the file, show:
```
Added to daily-standup.md:
- <item 1>
- <item 2>

Pendientes restantes: <count>
```

---

## Rules

- Always use Spanish for section headers and descriptions
- Keep items concise (1-2 lines each)
- Include PR numbers and Linear issue IDs when available
- Don't duplicate items that are already in the file
- Preserve the existing file structure — only append, never rewrite
- If the file has content from a previous day, archive it don't delete it
- **Omit local-only git housekeeping** — do NOT include: git rebases, branch cleanup, worktree management, next-day file archiving/deletion. These are maintenance, not deliverables.
- **DO include spikes and investigations** — if a spike produced a Linear issue, a comment on an issue, a decision document, or any external artifact, it IS a deliverable and should be listed (e.g., "Spike DOJ-2410: strategic assessment completed, recommendations posted to Linear")

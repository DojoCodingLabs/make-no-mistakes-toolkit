---
description: Generate a structured recap of everything accomplished in the current session, including tasks completed, files changed, decisions made, and pending items.
priority: 80
---

# Summarize Session

You are a **session summarizer**. The user wants a structured recap of everything that happened in this conversation.

**Input**: None required
**Output**: A comprehensive summary of the current session's work

---

## Step 1: Analyze the Conversation

Review the entire conversation history in this session. Identify:

1. **Tasks completed** — What was built, fixed, configured, or created
2. **Files changed** — Which files were created, edited, or deleted
3. **Decisions made** — Architecture choices, design decisions, trade-offs discussed
4. **Issues/PRs touched** — Any Linear issues or GitHub PRs referenced or modified
5. **Tools used** — MCP tools invoked (Linear, Slack, Supabase, etc.)
6. **Blockers encountered** — Problems hit and how they were resolved
7. **Pending items** — Anything discussed but not yet done

---

## Step 2: Verify with Git (if applicable)

If code changes were made, cross-reference with git:

```bash
git status
git diff --stat
git log --oneline -10
```

This catches any changes that may have been made but not discussed explicitly.

---

## Step 3: Format the Summary

Present the summary in this format:

```
## 📋 Session Summary — YYYY-MM-DD

### What Was Done
- <concise bullet for each completed task>

### Files Changed
| File | Action | Description |
|------|--------|-------------|
| `path/to/file` | Created/Edited/Deleted | Brief description |

### Decisions Made
- **<topic>**: <what was decided and why>

### Linear Issues / GitHub PRs
- <DOJ-XXXX>: <what was done on this issue>
- <PR #XXX>: <status>

### Blockers & Resolutions
- **<blocker>**: <how it was resolved>

### Pending / Next Steps
- [ ] <item not yet completed>
- [ ] <follow-up for next session>
```

**Rules:**
- Be factual — only include what actually happened, not plans that were discussed but abandoned
- Keep bullets concise (one line each)
- Include file paths for all code changes
- If no changes were made in a category, omit that section
- Respond in Spanish (matching the user's language preference)

---

## Step 4: Offer Next Actions

After the summary, ask:

```
¿Quieres que:
1. Guarde algo de esta sesión en memoria para futuras conversaciones?
2. Postee un resumen en Slack (#daily-status-updates)?
3. Comente progreso en los Linear issues tocados?
```

Only offer options that are relevant (e.g., don't offer Slack if no meaningful work was done).

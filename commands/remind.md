---
description: Recall past decisions, feedback, and instructions from memory, CLAUDE.md, and project context. Accepts a topic or keyword as $ARGUMENTS.
---

# Remind: $ARGUMENTS

You are a **memory retrieval assistant**. The user wants to recall something they've said, decided, or instructed in past sessions.

**Input**: A topic, keyword, or question (e.g., "testing", "qué dije sobre PRs", "qué feedback te di", "reglas de Linear")
**Output**: A structured recall of everything relevant from memory, instructions, and project context

---

## Step 1: Parse the Query

Interpret `$ARGUMENTS` as a search topic. If empty, list all available memories as a quick index.

The user may ask in several forms:
- "testing" → find everything related to testing
- "qué dije sobre PRs" → find decisions/feedback about PRs
- "qué feedback te di" → list all feedback memories
- "reglas" → list all rules/instructions given
- "Linear" → find everything about Linear workflow
- "todo" / "all" → full dump of all memories and key instructions

---

## Step 2: Search Memory Files

Read the memory index file `MEMORY.md` from the project's memory directory. It is automatically loaded into the conversation context — you already have access to it.

For each memory file referenced that could be relevant to the query, read its full content. Cast a wide net — if there's even a partial match, include it.

**Memory types to surface:**
- `feedback` — Rules and corrections the user has given (highest priority for "qué feedback" queries)
- `user` — Information about the user's role and preferences
- `project` — Ongoing work context and decisions
- `reference` — Pointers to external resources

---

## Step 3: Search CLAUDE.md Files

Scan the project's `CLAUDE.md` for rules, conventions, and instructions relevant to the query. Key sections to check:

- Critical Rules
- Common Review Findings
- Architecture decisions
- Any section matching the query keywords

Also check subdirectory CLAUDE.md files if the query relates to a specific repo (e.g., `dojo-os/CLAUDE.md`).

---

## Step 4: Search Skills & Commands

If the query relates to workflows or processes, check:
- `.claude/commands/` — slash commands the user has created
- `.claude/skills/` — skills that encode process decisions

Only include these if directly relevant to the query.

---

## Step 5: Format the Response

Present findings grouped by source, most relevant first. Use this format:

```
## 🔍 Recall: "<query>"

### From Your Feedback (Memory)
- **<memory name>**: <key content>
  Source: `memory/<filename>.md`

### From Project Decisions (Memory)
- **<memory name>**: <key content>
  Source: `memory/<filename>.md`

### From CLAUDE.md Rules
- **<rule/section>**: <relevant excerpt>
  Source: `CLAUDE.md` (line X)

### From Workflows
- **<command/skill>**: <what it does and why>
  Source: `.claude/commands/<name>.md`
```

**Rules:**
- Always quote the actual content, don't paraphrase
- Include the source file path so the user can edit if needed
- If nothing is found, say so clearly: "No encontré nada sobre '<query>' en tu memoria o instrucciones."
- If the query is vague, show the closest matches and ask if they want to dig deeper
- Respond in the same language the user used for the query

---

## Special Queries

### "todo" / "all" / "everything" / (empty arguments)
List ALL memories as a structured index:
1. Read every memory file
2. Group by type (feedback, user, project, reference)
3. Show one-line summary of each

### "feedback" / "reglas" / "rules"
List ALL feedback memories with full content — these are the user's corrections and preferences.

### "qué cambió" / "what changed"
Show memories that were recently created or modified (check file modification dates).

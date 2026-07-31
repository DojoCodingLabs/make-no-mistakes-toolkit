---
description: Generate a structured recap of everything accomplished in the current session, then ALWAYS chain into the session plan, pending-left and resolve-open-questions — what happened, what remains, and what has to be decided.
priority: 80
---

# Summarize Session

You are a **session summarizer**. The user wants a structured recap of everything that happened in this conversation.

**Input**: None required
**Output**: A recap of the session, followed — always, without being asked — by
what remains pending and what decisions are open. Steps 1-3 produce the recap;
**Step 4 is not optional and is part of the deliverable.**

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
- <APP-XXXX>: <what was done on this issue>
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

## Step 4: Chain — SIEMPRE, y en una sola tanda

Un resumen contesta **qué pasó**. No contesta **qué queda** ni **qué hay que
decidir**, que son las dos preguntas por las que alguien pide un resumen. Pedir
los tres comandos a mano, uno por turno, es el síntoma de que el contrato
estaba incompleto — no una forma de usarlo.

Así que después de emitir el resumen, sin preguntar y sin esperar,
**emití estas TRES lecturas en UNA sola tanda de tool calls paralelos**:

### 4a. El plan de la sesión

Leelo con `Read`. La UI lo muestra como `Reading Plan` cuando el archivo cae
bajo un directorio `plans/` de Claude.

Resolución de la ruta, en este orden:

1. La que da el mensaje de sistema del modo plan. Es la autoritativa.
2. Si no la tenés a mano: `$CLAUDE_CONFIG_DIR/plans/`.

**Nunca hardcodees `~/.claude/plans`.** Coexisten varios perfiles en la misma
máquina — `.claude`, `.claude-andres`, `.claude-hello` en una instalación real,
cada uno con su `plans/` — y `CLAUDE_CONFIG_DIR` es lo único que dice cuál
corresponde a esta sesión. Una ruta fija lee el plan de otro perfil.

**Los planes persisten entre sesiones.** El archivo más reciente del directorio
NO es necesariamente el de esta sesión. Si esta sesión nunca entró en modo
plan, no hay plan que leer: decilo en una línea y seguí. Leer el de otra sesión
como si describiera esta es peor que no leer ninguno, porque un plan viejo se
lee igual de fluido que uno vigente.

### 4b. El contrato de `pending-left`

`commands/pending-left.md`, de este mismo plugin.

### 4c. El contrato de `resolve-open-questions`

`skills/resolve-open-questions/SKILL.md`, de este mismo plugin.

### Después de las tres lecturas

Ejecutá `pending-left` y después `resolve-open-questions`, en ese orden — los
pendientes son el insumo de las decisiones, no al revés.

**Por qué esta sección reemplazó a un menú numerado.** Este paso decía antes
"¿Quieres que: 1. guarde memoria, 2. postee en Slack, 3. comente en Linear?".
Eso contradecía a `resolve-open-questions`, que es el dueño de convertir
decisiones abiertas en `AskUserQuestion` — opción recomendada primera,
trade-off en cada descripción, `multiSelect` cuando no son exclusivas. Un menú
numerado en prosa no es ninguna de esas cosas, y tener los dos significaba que
la calidad de la pregunta dependía de cuál de los dos caminos tomara el agente.
Las tres ofertas viejas siguen vivas: salen del sweep de
`resolve-open-questions`, que las va a encontrar si de verdad quedaron
abiertas, y no las va a inventar si no.

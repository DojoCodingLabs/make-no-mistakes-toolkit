# Pending Left — What Remains To Be Done

You are a **pending work tracker**. The user wants to know exactly what's left unfinished from this session and prior sessions.

**Input**: None required
**Output**: A prioritized, actionable list of everything pending

---

## Step 1: Gather Pending Items from Multiple Sources

### 1a. Current Session
Review the conversation history for:
- Tasks discussed but not implemented
- Features partially implemented (e.g., "backend done, mobile pending")
- Review feedback not yet addressed
- Issues opened but not closed
- Promises made ("I'll do X next") that weren't fulfilled

### 1b. Git State
```bash
git status
git worktree list
git branch --list | head -20
gh pr list --state open --limit 20
```
Check for:
- Uncommitted changes
- Open worktrees (unfinished branches)
- Open PRs awaiting review or merge
- Branches ahead of remote (unpushed work)

### 1c. Linear Issues
Query Linear MCP for the team's In Progress and Backlog issues:
- Issues assigned to me that are In Progress
- Issues in Backlog that were discussed this session
- Issues with unresolved comments

### 1d. Task List
Check the current session's task list for any pending items.

### 1e. Memory
Read `MEMORY.md` and any project memories that reference pending work, migration needs, or known gaps.

### 1f. OpenSpec Changes
Check `openspec/changes/*/tasks.md` for unchecked items in active changes.

---

## Step 2: Categorize and Prioritize

Group pending items into:

| Priority | Category | Criteria |
|----------|----------|----------|
| P0 | **Blocking** | Must be done before anything else can proceed (migrations, CI fixes, merge conflicts) |
| P1 | **Review Fixes** | CodeRabbit/Greptile/Graphite feedback that must be addressed before merge |
| P2 | **Open PRs** | PRs ready for merge or needing final review |
| P3 | **Partial Implementation** | Features with backend done but mobile/frontend pending |
| P4 | **Planned** | Issues in backlog discussed but not started |
| P5 | **Nice to Have** | Improvements, refactors, tech debt noted during session |

---

## Step 3: Format the Output

```
## Pendientes — YYYY-MM-DD

### P0: Bloqueantes
- [ ] <item> — <why it blocks>

### P1: Review Fixes (PRs abiertos)
| PR | Issue | Reviewer | Feedback pendiente |
|----|-------|----------|--------------------|
| #N | ALT-XX | CodeRabbit/Greptile | <resumen del fix> |

### P2: PRs Listos para Merge
| PR | Issue | Estado | Merge Order |
|----|-------|--------|-------------|
| #N | ALT-XX | Approved/Pending | N de M |

### P3: Implementacion Parcial
- [ ] ALT-XX: <que falta> (backend done, mobile pending)

### P4: Backlog Planificado
- [ ] ALT-XX: <descripcion corta>

### P5: Mejoras / Tech Debt
- [ ] <item>

### Worktrees Activos
| Worktree | Branch | Estado |
|----------|--------|--------|
| .claude/worktrees/xxx | branch-name | pendiente/listo |

### Infra / DevOps
- [ ] <migrations, CI fixes, deploy steps>
```

**Rules:**
- Only include REAL pending items, not completed work
- Include specific file paths, PR numbers, Linear issue IDs
- For each item, note what's blocking it (if anything)
- Respond in Spanish
- Be actionable: each item should be something the user can act on immediately or delegate

---

## Step 4: Suggest Next Session Plan

After the list, suggest an optimal order for the next session:

```
### Plan sugerido para la proxima sesion
1. <highest priority item> (~estimacion)
2. <next item> (~estimacion)
3. ...

¿Quieres que:
1. Cree issues de Linear para los items sin issue?
2. Actualice los Linear issues existentes con el estado actual?
3. Limpie worktrees de branches ya mergeados?
4. Ejecute /make-no-mistakes para los PRs pendientes de merge?
```

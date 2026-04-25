# /prioritize Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `/make-no-mistakes:prioritize <pillar-slug>` as a command + skill in `make-no-mistakes-toolkit` that applies MoSCoW (bucket) + RICE-adapted (ranking) to Linear issues of a DojoOS pillar, traceable to its PIBER+IDCF sub-spike and latest vision audit.

**Architecture:** Pure Claude Code plugin artifact (markdown command + markdown skill + reference docs). Orchestrates 3 parallel subagents to fetch issues/spike/audit, applies deterministic rules to bucket issues, computes RICE intra-bucket rankings, and writes 3 outputs: priority report markdown, per-issue description footer with HTML delimiters, and a snapshot comment in the pillar sub-spike.

**Tech Stack:** Markdown (skill + command files), Linear MCP (`mcp__linear-server`), Claude Code built-in tools (Agent, Read, Grep, Glob, Write, Edit, Bash).

**Upstream spec:** `docs/superpowers/specs/2026-04-21-prioritize-command-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `commands/prioritize.md` | Command frontmatter + argparse + delegation to skill |
| Create | `skills/prioritize/SKILL.md` | Main orchestration logic: parse args, resolve pillar, dispatch subagents, compose artifacts |
| Create | `skills/prioritize/references/scoring-rules.md` | Deterministic MUST/SHOULD/COULD/WONT rule table |
| Create | `skills/prioritize/references/frameworks/moscow-rice.md` | v1 framework impl: bucket assignment logic + RICE formula + flag rules |
| Create | `skills/prioritize/references/frameworks/rice.md` | v2 stub |
| Create | `skills/prioritize/references/frameworks/moscow.md` | v2 stub |
| Create | `skills/prioritize/references/frameworks/ice.md` | v2 stub |
| Create | `skills/prioritize/references/frameworks/wsjf.md` | v2 stub |
| Create | `skills/prioritize/references/frameworks/kano.md` | v2 stub |
| Create | `skills/prioritize/references/linear-mutations.md` | HTML delimiter convention + idempotency rules + sub-spike comment template |
| Create | `skills/prioritize/references/prompts/llm-fallback-bucket.md` | Prompt used when deterministic rules yield UNCLASSIFIED |
| Modify | `README.md` (toolkit root) | Add `/prioritize` to the command list with 1-line description + example |
| Modify | `dojo-os/linear-setup.json` | Add `pillars` table with the 8 DojoOS pillars |
| Modify | `dojo-agent-openclaw-plugin/linear-setup.json` | Add `pillars` table with relevant pillars (agent-doji minimum) |

No code files. No unit tests. Verification = dogfooding against known audits (pathways + agent-doji).

**Commit policy:** Per user CLAUDE.md rule ("NEVER commit without user permission"), tasks do NOT commit. Final task summarizes the diff and asks the user for commit permission in one batch.

---

## Task 1: Create skeleton directory structure

**Files:**
- Create: `skills/prioritize/` (directory)
- Create: `skills/prioritize/references/` (directory)
- Create: `skills/prioritize/references/frameworks/` (directory)
- Create: `skills/prioritize/references/prompts/` (directory)

- [ ] **Step 1: Verify toolkit working directory**

```bash
cd /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit && pwd
```

Expected output: `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit`

- [ ] **Step 2: Create directory tree**

```bash
mkdir -p /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/frameworks && \
mkdir -p /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/prompts && \
ls /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references
```

Expected output: `frameworks  prompts`

- [ ] **Step 3: Verify no existing prioritize files would collide**

Use Glob with pattern `skills/prioritize/**/*` to confirm directories are empty (returns 0 files).

---

## Task 2: Write the command file

**Files:**
- Create: `commands/prioritize.md`

- [ ] **Step 1: Write the command file with exact content below**

Use `Write` tool to create `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/commands/prioritize.md` with:

````markdown
---
description: Aplica MoSCoW + RICE-adaptado a los issues de un pillar, justificando cada veredicto contra el sub-spike PIBER+IDCF y el vision audit mas reciente. Accepts pillar-slug como $ARGUMENTS.
argument-hint: "<pillar-slug> [--framework <name>] [--no-audit] [--target <description|labels|both>] [--dry-run] [--out <path>] [--issue-ids <ids>]"
priority: 85
---

# /prioritize -- MoSCoW + RICE traceable to product vision

Ejecuta priorizacion de issues de un pillar contra su sub-spike PIBER+IDCF, enriquecida por el vision audit mas reciente del pillar cuando existe.

## Frameworks base

- **MoSCoW** (bucket assignment): Must / Should / Could / Won't + Unclassified + Decompose-required. Deterministico via reglas del sub-spike (ver `references/scoring-rules.md`).
- **RICE-adaptado** (intra-bucket ranking): `(Reach × Impact × Confidence) / Size`. `Size` usa T-shirt labels en vez de weeks (compatible con convencion `spike-recommend` y regla `no time estimates`).

v1 implementa solo `moscow-rice`. Otros frameworks (`rice`, `moscow`, `ice`, `wsjf`, `kano`) tienen stubs en `references/frameworks/` y retornan "not yet implemented".

## Modo de invocacion

```bash
# Default: dry-run false, genera report + aplica mutations a description
/make-no-mistakes:prioritize pathways

# Primer sweep, sin audit aunque exista
/make-no-mistakes:prioritize agent-doji --no-audit

# Solo reportar sin mutaciones
/make-no-mistakes:prioritize community --dry-run

# Subset de issues
/make-no-mistakes:prioritize launchpad --issue-ids ALT-123,ALT-124

# Override output path
/make-no-mistakes:prioritize hackathons --out /tmp/priority-hackathons.md
```

## Parsing de argumentos

1. **Primer argumento** (`<pillar-slug>`) -- requerido:
   - Debe matchear una clave en `linear-setup.json` -> `pillars.<slug>`.
   - Si no existe, entrar a modo interactivo (ver "Modo sin config" mas abajo).

2. **Flags**:

| Flag | Default | Comportamiento |
|------|---------|----------------|
| `--framework <name>` | `moscow-rice` | v1 solo implementa `moscow-rice`. Otros retornan error claro referenciando el stub. |
| `--no-audit` | off | No cargar vision audit aunque exista. Confidence usa default 0.8. |
| `--codebase <path>` | desde config | Override del codebase resuelto por `pillars.<slug>.codebase`. |
| `--target <mode>` | `description` | `description`, `labels`, o `both`. v1 soporta `description`. `labels`/`both` validan primero que existan. |
| `--dry-run` | off | No tocar Linear. Report titulo = "Proposed mutations (dry-run, not applied)". |
| `--out <path>` | auto | Default: `<codebase>/audits/<pillar>/priority-<YYYY-MM-DD>.md`. Si path empieza con `~/`, expandir. |
| `--issue-ids <ids>` | off | Subset coma-separado. Resto del project queda intacto en el snapshot. |

## Convencion de output (default)

El report vive **dentro del repo del pillar**, junto al vision audit:

```
<codebase-root>/audits/<pillar-slug>/priority-<YYYY-MM-DD>.md
```

Coexiste con los snapshots anteriores -- NO se sobreescribe. Git version-controla el historial; `ls -t audits/<pillar>/priority-*.md | head -1` da el mas reciente.

## Flujo del comando

Delega a la skill `prioritize`. La skill se encarga de:

1. **Config resolution**: parsear `linear-setup.json` y extraer `pillars.<slug>.{project, spike, codebase}`.
2. **Fetch paralelo**: 3 subagents en background para issues del project, sub-spike IDCF, y vision audit mas reciente.
3. **MoSCoW bucket assignment**: aplicar tabla deterministica de `references/scoring-rules.md`. Fallback a LLM para UNCLASSIFIED (ver `references/prompts/llm-fallback-bucket.md`).
4. **RICE intra-bucket**: cuando un bucket tiene >3 issues, calcular `(R × I × C) / S` por issue y rankear desc.
5. **Composicion de artifacts**:
   - Priority report markdown -> `<codebase>/audits/<pillar>/priority-<YYYY-MM-DD>.md`
   - Description-footer por issue con delimiters HTML (idempotente) -- solo si `--dry-run=false`.
   - Comment snapshot en el sub-spike del pillar -- solo si `--dry-run=false`.

Ver `${CLAUDE_PLUGIN_ROOT}/skills/prioritize/SKILL.md` para detalle.

## Regla de idioma

Report en **espanol**. Nombres de frameworks (MoSCoW, RICE, PIBER, IDCF) y nombres propios quedan en original.

## Regla de evidencia

Cada veredicto en el report cita:
- La regla del sub-spike que matcheo (thesis #, feature tier, anti-pattern).
- El estado en el audit (OK/PARTIAL/MISSING/DRIFT/VIOLATION).
- El breakdown completo de RICE (R, I, C, S) cuando aplique.

Nunca afirmar "Must" sin cita. Nunca afirmar "Won't" sin razon explicita.

## Modo sin config

Si el `pillar-slug` no existe en `linear-setup.json`, preguntar:

1. "Cual es el project Linear del pillar?" (autocompletar con `mcp__linear-server__list_projects`)
2. "Cual es el sub-spike PIBER+IDCF del pillar? (Linear issue ID)"
3. "Cual es el path al codebase del pillar?"
4. "Guardar esta config en `linear-setup.json` para proximas corridas? (yes/no)"

Si yes -> escribir `pillars.<slug>` al archivo. Si no -> proceder una vez, pedir de nuevo el proximo run.

## Modo sin argumentos

Si el usuario invoca `/prioritize` sin args, preguntar:

1. "Cual es el pillar a priorizar?" (listar pillars conocidos del `linear-setup.json`)
2. El resto del flow procede como si el arg hubiera sido pasado.

## Dog-fooding

Este comando fue creado dogfooded para DojoOS. Los primeros runs validados fueron:

- `pathways` -> `dojo-os/audits/pathways/priority-2026-04-21.md`
- `agent-doji` -> `dojo-agent-openclaw-plugin/audits/agent-doji/priority-2026-04-21.md`

Ambos complementan los vision audits generados por `/business-model-toolkit:product-vision-audit` en la misma convencion de path.

## Chain posicion

El comando encaja en la cadena del toolkit:

```
product-vision-audit -> prioritize -> spike-recommend -> implement
   (business-model)    (this one)     (make-no-mistakes)  (make-no-mistakes)
```

Un usuario tipico:
1. Corre `product-vision-audit pathways` -> genera `audits/pathways/vision-audit-2026-04-17.md`.
2. Corre `prioritize pathways` -> genera `audits/pathways/priority-2026-04-21.md` + mutations.
3. Toma el top-3 Must del priority report y corre `spike-recommend ALT-XXX` para cada uno -> genera issue-brief bilingual.
4. Corre `implement ALT-XXX` -> ejecuta el issue con discipline (worktree, reviewers, CI).

## Requisitos

- `mcp__linear-server` configurado y autenticado en el workspace del pillar.
- `linear-setup.json` en la raiz del cwd, con `pillars.<slug>` para el pillar target (o entrar a modo interactivo para crearlo).
- Codebase del pillar debe existir en el path declarado.
- Opcional: vision audit en `<codebase>/audits/<pillar>/vision-audit-*.md` para enriquecer Confidence.
````

- [ ] **Step 2: Verify file was created correctly**

```bash
wc -l /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/commands/prioritize.md && head -5 /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/commands/prioritize.md
```

Expected: ~120 lines, first line `---`, second line starting with `description:`.

- [ ] **Step 3: Verify no collision with existing commands**

Use Grep on `commands/` directory for `name: prioritize` in frontmatter of other files. Expected: 0 matches (only our new file).

---

## Task 3: Write the main skill file (SKILL.md)

**Files:**
- Create: `skills/prioritize/SKILL.md`

- [ ] **Step 1: Write SKILL.md with exact content below**

Use `Write` tool to create `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/SKILL.md` with:

````markdown
---
name: prioritize
description: >
  Applies MoSCoW (bucket) + RICE-adapted (intra-bucket ranking) to Linear issues
  of a product pillar, traceable to its PIBER+IDCF sub-spike and the latest vision
  audit. Use when the user asks to "prioritize issues", "priorizar el pillar",
  "aplicar MoSCoW", "rank the backlog", "RICE scoring", "/prioritize", or wants a
  data-backed decision on what to work on next within a pillar.
  Do NOT trigger for: generic backlog ranking without pillar context (use
  spike-recommend or implement-advisor instead), issue creation, or PR review.
---

# /prioritize -- MoSCoW + RICE traceable to product vision

Skill que aplica **MoSCoW** (bucket) + **RICE-adaptado** (ranking) a los issues de un pillar, justificando cada veredicto contra el sub-spike PIBER+IDCF declarado en Linear y el vision audit mas reciente (si existe).

El output es:

1. Un report markdown en `<codebase>/audits/<pillar>/priority-<YYYY-MM-DD>.md`.
2. Descripcion de cada issue en Linear con un footer autogenerado (delimiter HTML, idempotente).
3. Un comment snapshot en el sub-spike del pillar (DOJ-3222 para Pathways, etc.).

## Anti-trigger

Esta skill NO se activa cuando:

- El usuario quiere priorizar sin contexto de pillar (usar `spike-recommend` o triaging manual).
- El usuario quiere crear o editar issues individuales (usar MCP directo).
- El input es un PR, branch, o commit (el input es un pillar-slug).

## Config resolution

Lee `linear-setup.json` en la raiz del cwd. Schema esperado:

```json
{
  "team": { "key": "DOJ" },
  "projects": { ... legacy mapping ... },
  "pillars": {
    "<slug>": {
      "project": "<Linear project name>",
      "spike": "<Linear issue ID>",
      "codebase": "<path relative to cwd or absolute>"
    }
  }
}
```

- Si el archivo no existe: error claro, sugerir `/make-no-mistakes:linear-projects-setup`.
- Si `pillars.<slug>` no existe: modo interactivo (ver `commands/prioritize.md`).
- Si la config tiene pillars pero falta campo (`project`, `spike`, o `codebase`): pedir el faltante, ofrecer guardar.

## Flujo principal

### Paso A: Fetching paralelo

Dispatch 3 subagents via Agent tool con `run_in_background: true`:

**Subagent 1 -- fetch-issues**:
```
description: "Fetch issues del project <project-name>"
subagent_type: "general-purpose"
prompt: "Usar mcp__linear-server__list_issues para retornar todos los issues del project '<project-name>'
  que esten en estado Backlog, Todo, o In Progress. Si --issue-ids fue pasado, filtrar solo a esos.
  Output: JSON array con {id, identifier, title, description, labels, state, priority, size_label,
  estimate} por issue. Responder en bajo 200 palabras de explicacion + JSON."
```

**Subagent 2 -- fetch-spike**:
```
description: "Fetch y parse sub-spike PIBER+IDCF <spike-id>"
subagent_type: "general-purpose"
prompt: "Usar mcp__linear-server__get_issue con id=<spike-id>. Parsear el markdown buscando secciones:
  ## P, ## I, ## B, ## E, ## R, ## D -- Design Theses (marcar theses con ⚠️ como killshot),
  ## C -- Capabilities (tabla con build/buy/partner + priority), ## F -- Features (P0, P1, P2, P3),
  y Anti-patterns si existe. Output: JSON estructurado con estos campos + texto raw del spike por
  si la parsing falla. Responder en bajo 300 palabras + JSON."
```

**Subagent 3 -- load-audit**:
```
description: "Load most recent vision audit para <pillar-slug> en <codebase>"
subagent_type: "general-purpose"
prompt: "Glob pattern '<codebase>/audits/<pillar-slug>/vision-audit-*.md'. Si no hay matches,
  responder {audit: null, reason: 'no audit found'}. Si hay matches, elegir el de fecha mas
  reciente (YYYY-MM-DD en el filename). Read ese archivo. Parsear el scorecard table, Design
  Theses table (status OK/PARTIAL/MISSING/DRIFT), Capabilities table, Features por tier,
  Anti-patterns violations, y top 5 recommendations. Output: JSON estructurado + path del
  archivo cargado. Responder en bajo 250 palabras + JSON."
```

Esperar a los 3 antes de proceder al Paso B. Si subagent-1 o 2 fallan -> exit 2 con mensaje claro. Si subagent-3 falla (o retorna null) -> continuar con `audit = null` y Confidence default 0.8.

### Paso B: MoSCoW bucket assignment

Para cada issue retornado por subagent-1, aplicar las reglas de `references/scoring-rules.md` en orden. Primera regla que matchea gana.

Output intermedio: cada issue etiquetado con:
- `bucket`: MUST | SHOULD | COULD | WONT | UNCLASSIFIED | DECOMPOSE
- `matched_rules`: array de nombres de reglas que aplicaron
- `cited_thesis` / `cited_feature` / `cited_capability` / `cited_antipattern`: referencias al spike
- `audit_status`: si el audit existe y matchea (OK/PARTIAL/MISSING/DRIFT/VIOLATION/null)

**UNCLASSIFIED fallback**: si ninguna regla matchea, dispatch un subagent sync (no background) con el prompt de `references/prompts/llm-fallback-bucket.md`, pasando el issue + sections relevantes del spike. Si el subagent retorna confidence < 0.6 -> mantener UNCLASSIFIED. Si >= 0.6 -> asignar el bucket retornado + anotar `matched_rules: ["llm-fallback"]` + `llm_rationale: <response>`.

**DECOMPOSE**: issues con `size_label == "XL"` van a DECOMPOSE directamente, sin pasar por otras reglas. No reciben RICE score. Aparecen en seccion separada del report.

### Paso C: RICE intra-bucket ranking

Para cada bucket (MUST, SHOULD, COULD, WONT), si tiene >3 issues:

1. Calcular RICE por issue: `(Reach × Impact × Confidence) / Size`.
2. Variables:
   - **Reach**: inferir del spike (`every user` = 9, `pillar users` = 3, `admin-only` = 1). Default 3.
   - **Impact**: `0` (no thesis avanzada), `1` (1 match), `2` (2+ matches), `3` (killshot ⚠️ match).
   - **Confidence**: audit lookup. `PARTIAL` -> 1.0, `DRIFT` -> 0.8, `MISSING` -> 0.5. Sin audit o ambiguo -> 0.8.
   - **Size**: XS=1, S=2, M=4, L=8. (XL ya esta en DECOMPOSE.) Sin label -> M=4 + flag `low-confidence-estimate`.
3. Ranking desc. Empates por `issue.identifier` lexicografico asc.

Si un bucket tiene ≤3 issues, mantener orden natural (spike-derived) sin rankear. Ver `references/frameworks/moscow-rice.md` para detalle de edge cases.

### Paso D: Confidence flags

Marcar cada issue con flag `low-confidence-estimate` si:
- `size_label` missing -> Size default=M.
- `description.length < 100` -> Reach/Impact inferidos solo del titulo.
- `--no-audit` fue pasado pero el audit existe -> Confidence default=0.8.
- Subagent-2 parse warnings presentes (ambiguity en spike sections).

El flag se muestra como "⚠" en el report al lado del RICE score. NO bloquea el ranking.

### Paso E: Composicion de artifacts

Generar 3 artifacts en paralelo (via Agent tool subagents para I/O pesado) o secuencial si mas simple:

**Artifact 1 -- Priority report markdown**:
- Write a `<codebase>/audits/<pillar>/priority-<YYYY-MM-DD>.md`.
- Si el directorio no existe, crear con `mkdir -p`.
- Si ya existe un archivo con la misma fecha -> append sufijo `-2`, `-3`, etc.
- Template: ver `references/linear-mutations.md` seccion "Priority report template".

**Artifact 2 -- Description footer per issue**:
- Solo si `--dry-run=false`.
- Para cada issue scoreado, leer la description actual via `mcp__linear-server__get_issue`.
- Aplicar la regla de reemplazo idempotente de `references/linear-mutations.md` seccion "Delimiter convention".
- Escribir la description actualizada via `mcp__linear-server__save_issue`.
- Log success/fail por issue. Fallas NO abortan el batch -- se reportan al final.

**Artifact 3 -- Snapshot comment en sub-spike**:
- Solo si `--dry-run=false`.
- Target: `pillars.<slug>.spike` (ej: DOJ-3222 para pathways).
- NO editar comment anterior. Siempre agregar uno nuevo con fecha.
- Si existe comment previo con patron matching, agregar link al bottom del nuevo comment.
- Usar `mcp__linear-server__save_comment` con el body del template (ver `references/linear-mutations.md` seccion "Sub-spike comment template").

### Paso F: Resumen al usuario

Al final de la ejecucion (independiente de dry-run):

```
Priority snapshot generado para <pillar>:
  Must:         N issues (top: ALT-XXX, RICE=X.X)
  Should:       N issues
  Could:        N issues
  Won't:        N issues
  Unclassified: N issues (needs human review)
  Decompose:    N issues (XL-sized, suggest /spike-recommend)

Report: <path al priority-*.md>
<If !dry-run:>
  Descriptions updated: N/M issues (<failure count> failures)
  Sub-spike comment: <link to comment>
<If dry-run:>
  Mutations proposed but NOT applied. Run without --dry-run to apply.

Next steps:
  - Review top Musts en el report.
  - Corre `/make-no-mistakes:spike-recommend <issue-id>` para el top-3 Must.
  - Corre `/make-no-mistakes:implement <issue-id>` una vez el brief este listo.
```

## Error handling

Ver `references/scoring-rules.md` y `references/linear-mutations.md` para detalle por caso. Tabla resumen:

| Escenario | Accion |
|-----------|--------|
| linear-setup.json no existe | Exit 1 con sugerencia `/linear-projects-setup`. |
| pillars.<slug> no existe | Modo interactivo. |
| MCP linear-server no disponible | Exit 1 con mensaje setup. |
| Subagent fetch-issues falla | Exit 2, no tocar Linear. |
| Subagent fetch-spike falla | Exit 2, no tocar Linear. |
| Subagent load-audit falla | Warn + continuar con audit=null. |
| Spike sin IDCF parseable | Warn + MoSCoW puro sin theses matching. |
| Issue sin Size label | Default=M + flag low-confidence-estimate. |
| --target=labels + labels missing | Exit 1, sugerir pedir a admin + usar --target=description. |
| Description update falla para 1+ issue | Continuar batch, reportar fallas al final. Exit 3 si >0% fallas. |
| Dry-run + mutations en output | "Proposed" en titulo del report + skip Artifacts 2-3. |

## Reglas de oro

1. **Deterministico first, LLM second**: las reglas de MoSCoW se aplican primero. LLM solo para UNCLASSIFIED residual.
2. **Citar siempre**: cada bucket assignment cita el match (thesis #, feature tier, anti-pattern, audit status).
3. **Idempotencia en Linear**: correr 2 veces debe dar el mismo resultado. Description footer se reemplaza, no se stackea. Sub-spike comment es nuevo cada run (no edit del anterior).
4. **Coexistencia de snapshots**: el report NO sobreescribe el anterior. Git version-controla.
5. **No time estimates**: nunca decir "2 sprints", "1 mes". Sequential ordering con milestones conceptuales.
6. **Respetar config**: si `linear-setup.json` no declara un pillar, pedir al usuario, ofrecer guardar. Nunca inventar.
7. **Low-confidence transparente**: si faltan datos, marcar flag, no adivinar sin avisar.

## Interaccion con el usuario

- Confirmar args al inicio si algo es ambiguo (pillar sin config, codebase no existe, MCP no disponible).
- Mostrar progreso: "Fetching issues + spike + audit en paralelo...", "Aplicando reglas MoSCoW a N issues...", "Calculando RICE en bucket Must...".
- Al final, mostrar el resumen del Paso F.
- Preguntar si hay mutations fallidas: "Queres reintentar los N issues que fallaron?".

## Fallbacks

Si el codebase del pillar no tiene `audits/<pillar>/`:
- Crear el directorio antes de escribir el report.
- Mencionar en el executive summary del report: "primer priority snapshot, no hay historial previo".

Si el pillar tiene mas de 200 issues:
- Advertir al usuario: "200+ issues detectados, esto puede tomar un rato. Considera filtrar con --issue-ids o cerrar issues obsoletos primero."
- Proceder igual.

## Referencias

- `references/scoring-rules.md` -- tabla deterministica MUST/SHOULD/COULD/WONT.
- `references/frameworks/moscow-rice.md` -- v1 impl (formula RICE, edge cases).
- `references/frameworks/{rice,moscow,ice,wsjf,kano}.md` -- v2 stubs.
- `references/linear-mutations.md` -- delimiter convention + templates.
- `references/prompts/llm-fallback-bucket.md` -- LLM prompt para UNCLASSIFIED fallback.

Ver tambien el spec completo: `docs/superpowers/specs/2026-04-21-prioritize-command-design.md`.
````

- [ ] **Step 2: Verify file was created**

```bash
wc -l /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/SKILL.md
```

Expected: ~290 lines.

- [ ] **Step 3: Verify frontmatter parses**

Use `head -15` on the file and confirm:
- Line 1: `---`
- Line 2: `name: prioritize`
- Line 3 onwards: `description: >` followed by multi-line body
- End of frontmatter with `---` before the `# /prioritize` header

---

## Task 4: Write scoring-rules.md reference

**Files:**
- Create: `skills/prioritize/references/scoring-rules.md`

- [ ] **Step 1: Write the file with exact content below**

Use `Write` tool for `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/scoring-rules.md`:

````markdown
# MoSCoW Scoring Rules -- deterministic bucket assignment

Tabla deterministica que mapea un issue a su MoSCoW bucket aplicando reglas contra el sub-spike PIBER+IDCF del pillar. Las reglas se evaluan en orden. **La primera regla que matchea gana**.

Un issue matchea una regla cuando:
- Su `title` o `description` contiene keywords del target del spike (thesis/feature/capability/antipattern), O
- Un label del issue cita explicitamente el target (ej: label `thesis/D1`, `feature/P0`).

## Orden de evaluacion

```
1. DECOMPOSE  (size check, runs first to short-circuit XL)
2. MUST rules (in order)
3. SHOULD rules (in order)
4. COULD rules (in order)
5. WONT rules (in order)
6. UNCLASSIFIED (fallback)
```

---

## DECOMPOSE

**Single rule (short-circuit before MoSCoW):**

- `issue.size_label == "XL"` -> bucket = DECOMPOSE, skip MoSCoW + RICE.
  - `matched_rules: ["decompose/xl-label"]`
  - `suggested_action: "invoke /make-no-mistakes:spike-recommend <issue-id>"`

---

## MUST (killshot + P0 + audit violations)

Cada regla en orden:

### MUST-1: killshot-thesis-match

- Condition: issue menciona thesis #N, Y spike declara thesis #N con ⚠️ (killshot).
- Additional: audit status de la thesis != "OK" (i.e., hay trabajo pendiente).
- Match: cita `thesis_id`, `killshot: true`, `audit_status`.
- `matched_rules: ["must/killshot-thesis-match"]`

### MUST-2: anti-pattern-violation

- Condition: issue describe resolver un anti-pattern del spike, Y audit detecto VIOLATION.
- Match: cita `antipattern_name`, `audit_status: "VIOLATION"`.
- `matched_rules: ["must/anti-pattern-violation"]`

### MUST-3: north-star-instrumentation

- Condition: issue implementa instrumentacion de la metric North Star del spike, Y audit status es MISSING.
- Match: cita `north_star_metric`.
- `matched_rules: ["must/north-star-instrumentation"]`

### MUST-4: feature-p0-missing-or-partial

- Condition: issue implementa Feature P0 del spike, Y audit status != "SHIPPED" (o no hay audit).
- Match: cita `feature_name`, `feature_tier: "P0"`, `audit_status`.
- `matched_rules: ["must/feature-p0-missing-or-partial"]`

---

## SHOULD (soft theses + P1 + build-capability)

### SHOULD-1: soft-thesis-match

- Condition: issue avanza una Design Thesis NO marcada con ⚠️, Y audit status != "OK".
- Match: cita `thesis_id`, `killshot: false`.
- `matched_rules: ["should/soft-thesis-match"]`

### SHOULD-2: feature-p1-missing-or-partial

- Condition: issue implementa Feature P1 del spike, Y audit status != "SHIPPED".
- `matched_rules: ["should/feature-p1-missing-or-partial"]`

### SHOULD-3: build-capability-missing

- Condition: issue cubre una Capability marcada `Build` en el spike con audit status MISSING o PARTIAL.
- Match: cita `capability_name`.
- `matched_rules: ["should/build-capability-missing"]`

---

## COULD (P2 + buy-partner + UX)

### COULD-1: feature-p2

- Condition: issue implementa Feature P2 del spike.
- `matched_rules: ["could/feature-p2"]`

### COULD-2: buy-partner-capability

- Condition: issue cubre una Capability marcada `Buy` o `Partner` (no `Build`).
- `matched_rules: ["could/buy-partner-capability"]`

### COULD-3: ux-improvement-no-thesis

- Condition: issue.labels contiene `ux`, `perf`, o `improvement`, Y NO matchea ninguna thesis ni feature tier.
- `matched_rules: ["could/ux-improvement-no-thesis"]`

---

## WONT (P3 + out-of-scope + phase-conflict)

### WONT-1: feature-p3

- Condition: issue implementa Feature P3 del spike.
- `matched_rules: ["wont/feature-p3"]`

### WONT-2: out-of-scope-explicit

- Condition: spike tiene seccion `Out of scope` y el issue cae ahi por title/description.
- `matched_rules: ["wont/out-of-scope-explicit"]`

### WONT-3: phase-conflict

- Condition: el codebase tiene phase-lock (ej: `.claude/ship-gate.lock`, `.claude/design-freeze.lock`), Y el issue es una Feature nueva (no Bug, no Chore).
- Match: cita el lock file y la razon del spike.
- `matched_rules: ["wont/phase-conflict"]`

---

## UNCLASSIFIED (fallback)

Ninguna regla anterior matcheo. Proceder con LLM fallback via `references/prompts/llm-fallback-bucket.md`.

Si el LLM retorna confidence < 0.6 -> mantener UNCLASSIFIED en el output.
Si >= 0.6 -> asignar el bucket sugerido + anotar `matched_rules: ["llm-fallback"]` + `llm_rationale: <quote>`.

---

## Keyword detection heuristics

Cuando el issue NO tiene labels explicitos (ej: `thesis/D1`), buscar keywords del spike:

- **Thesis match**: buscar en title/description substrings del statement de la thesis. Ejemplo: thesis "Must require certification exam with human judge attestation" -> keywords `certification exam`, `human judge`, `Black Belt`, `attestor`, `attestation`.
- **Feature match**: buscar el feature name literal. Ejemplo: feature "Core Pathway engine" -> keywords `Pathway engine`, `pathway core`, `Pathway schema`.
- **Capability match**: buscar el capability name literal.
- **Anti-pattern match**: buscar el statement del anti-pattern o su parte identificadora. Ejemplo: "Auto-graded-only credentials" -> keywords `auto-graded`, `auto grade`, `self-reported cert`.

Matching es case-insensitive + stem-based. Si el keyword aparece >= 1 vez, consideramos el match valido.

**Falsos positivos**: si un issue matchea multiples reglas de distintas buckets (ej: menciona thesis D1 AND feature P2), MUST gana (bucket prioritario arriba de la jerarquia). Si empate dentro del mismo bucket, se anotan ambos matches en `matched_rules`.

---

## Ejemplos (dogfooded contra Pathways audit 2026-04-17)

### Ejemplo 1: MUST-1 killshot-thesis-match

- Issue: `ALT-124 -- Block cert generation post-quiz (gate con capstone + human judge)`
- Spike thesis D1: "Must require certification exam with human judge attestation" (⚠️)
- Audit status D1: `DRIFT`
- Keyword match: "certification", "human judge"
- Bucket: **MUST** (MUST-1)
- matched_rules: `["must/killshot-thesis-match"]`
- cited_thesis: `D1`

### Ejemplo 2: MUST-2 anti-pattern-violation

- Issue: `ALT-200 -- Remove auto-graded certification path`
- Spike anti-pattern: "Auto-graded-only credentials"
- Audit status: VIOLATION (detected en certificateService.ts)
- Bucket: **MUST** (MUST-2)
- matched_rules: `["must/anti-pattern-violation"]`

### Ejemplo 3: SHOULD-3 build-capability-missing

- Issue: `ALT-300 -- Design peer-verification schema`
- Spike capability: "Peer-verification framework" (Build)
- Audit status: MISSING
- Bucket: **SHOULD** (SHOULD-3)
- matched_rules: `["should/build-capability-missing"]`

### Ejemplo 4: WONT-3 phase-conflict

- Issue: `ALT-400 -- Add multi-language support (PT/FR)`
- Spike feature tier: P2 (Q3/Q4 2026)
- Codebase: `.claude/ship-gate.lock` present
- Bucket: **WONT** (WONT-3 overrides COULD-1 because ship-gate.lock)
- matched_rules: `["wont/phase-conflict"]`

### Ejemplo 5: UNCLASSIFIED -> LLM fallback

- Issue: `ALT-500 -- Refactor course enrollment hook for React 19 concurrent mode`
- Spike: no thesis/feature/capability matches this refactor.
- LLM fallback: confidence=0.7, suggests COULD (technical debt, improves concurrency, no user-facing impact).
- Bucket: **COULD** via LLM.
- matched_rules: `["llm-fallback"]`
- llm_rationale: "Technical refactor, no vision thesis affected, improves perf/UX indirectly. Maps to COULD."

---

## Validation checklist (para developers que modifiquen este archivo)

- [ ] Cada regla tiene un nombre unico (slug con prefijo de bucket).
- [ ] Cada regla especifica: condition, match fields, matched_rules entry.
- [ ] El orden de evaluacion esta explicito arriba.
- [ ] Ejemplos dogfooded contra un audit real.
- [ ] Ninguna regla requiere time estimation.
````

- [ ] **Step 2: Verify**

```bash
wc -l /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/scoring-rules.md
```

Expected: ~190 lines.

---

## Task 5: Write moscow-rice.md framework reference (v1 implementation)

**Files:**
- Create: `skills/prioritize/references/frameworks/moscow-rice.md`

- [ ] **Step 1: Write the file with exact content below**

Use `Write` tool for `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/frameworks/moscow-rice.md`:

````markdown
# Framework: moscow-rice (v1)

Implementacion activa de la skill `prioritize`. Combina MoSCoW (bucket) con RICE-adaptado (intra-bucket ranking).

## Por que este combo

- **MoSCoW** resuelve "hacemos esto o no" (decision binaria contra la vision).
- **RICE** resuelve "dentro de lo que hacemos, en que orden" (ranking cuantitativo).
- Two-pass prioritization: primero filtrar por alineacion estrategica, despues optimizar por impacto/esfuerzo.

Los frameworks puros (solo MoSCoW o solo RICE) tienen fallas conocidas:

- MoSCoW solo -> "tengo 20 Musts, cual primero?" sin herramientas para desempate.
- RICE solo -> puede rankear alto a una feature que NO deberia estar en el roadmap por violar la vision.

## Bucket assignment (MoSCoW)

Delegado a `../scoring-rules.md`. Ver ese archivo para la tabla completa.

## Ranking intra-bucket (RICE)

### Cuando aplicar

- Solo para buckets con **>3 issues**.
- DECOMPOSE (XL) NO recibe RICE (necesita decomposition primero).
- UNCLASSIFIED NO recibe RICE (necesita review humana).

### Formula

```
RICE = (Reach × Impact × Confidence) / Size
```

### Variables

#### Reach (escala 1, 3, 9)

Inferido del spike + audit:

| Valor | Significado | Ejemplo |
|-------|-------------|---------|
| 9 | Every user del producto | "All Pathways graduates", "every cert generated" |
| 3 | Pillar users (subset) | "Active Pathway enrollees", "builders con Score > X" |
| 1 | Admin / internal only | "Internal dashboard", "admin metrics view" |

**Default cuando no se puede inferir**: 3 + flag `low-confidence-estimate`.

**Heuristica del scope**: leer la seccion "Reach" del spike si existe. Si no, buscar pronouns en el issue description ("all users" = 9, "Pathway completers" = 3, "admins" = 1).

#### Impact (escala 0, 1, 2, 3)

Count de Design Theses avanzadas por el issue + bonus killshot:

| Valor | Criterio |
|-------|----------|
| 0 | No avanza ninguna thesis del spike |
| 1 | Avanza exactamente 1 thesis (no killshot) |
| 2 | Avanza 2+ theses (ninguna killshot) |
| 3 | Matchea al menos 1 killshot thesis ⚠️ |

**Conteo**: un issue matchea una thesis si esta en `cited_thesis` o `matched_rules` indica `killshot-thesis-match`.

**Bonus features**: un issue que NO matchea thesis directamente pero implementa una Feature P0/P1 puede subir a Impact=1.

#### Confidence (escala 0.5, 0.8, 1.0)

Derivado del vision audit:

| Audit status | Confidence | Rationale |
|--------------|------------|-----------|
| `PARTIAL` | 1.0 | Sabemos como construirlo -- algo ya existe como base |
| `DRIFT` | 0.8 | Sabemos que romper/refactorizar -- claro el target |
| `MISSING` | 0.5 | Greenfield, posibles unknowns en research |
| `OK` | 0.5 | Ya esta shipped -- el issue probablemente es duplicate o refactor |
| No audit | 0.8 | Default cuando no hay data empirica |
| `--no-audit` flag | 0.8 | Usuario explicito pidio no usar audit |

**Nota importante**: `OK` como Confidence 0.5 refleja que trabajar sobre algo ya OK es sospechoso; si es legit (ej: improvement), el issue probablemente va a COULD, no MUST/SHOULD.

#### Size (escala 1, 2, 4, 8; XL excluido)

Mapeo T-shirt del Linear Size label:

| Label | Size |
|-------|------|
| XS | 1 |
| S | 2 |
| M | 4 |
| L | 8 |
| XL | (excluido -- va a DECOMPOSE) |
| (sin label) | 4 (M) + flag low-confidence-estimate |

**Compatibilidad**: estos valores son consistentes con `spike-recommend` del mismo toolkit (que define XS <50K tokens, S 50-100K, M 100-200K, L 200-500K, XL 500K+ -> decompose).

### Rango de RICE esperado

Con la formula `(R × I × C) / S`:

- **Min**: 0 (Impact=0 o R=0)
- **Max teorico**: `(9 × 3 × 1.0) / 1 = 27.0` (every-user killshot ready-to-execute XS-sized)
- **Tipico Must**: 3-15
- **Tipico Should**: 1-5
- **Tipico Could**: 0.5-2
- **Tipico Won't**: no se rankea (bucket de deposit, no de roadmap)

Un Must con RICE >15 es excepcional. Un Must con RICE <1 es sospechoso -- revisar si deberia ser Should.

### Empates

Si dos issues tienen el mismo RICE:

1. Primero: Impact mas alto gana (killshot > soft).
2. Segundo: Size mas bajo gana (acciones mas rapidas primero).
3. Tercero: `issue.identifier` lexicografico asc (ALT-100 antes que ALT-200).

Determinismo garantizado.

## Flags

Issues con flags aparecen con indicador al lado del RICE score en el report.

### `low-confidence-estimate` (⚠)

Triggerea si:
- `size_label` missing (Size default=M).
- `description.length < 100` (inferencia basada en titulo solamente).
- `--no-audit` flag pasado + audit disponible en disk (confidence generico).

Accion: mostrar RICE con "⚠" al lado. NO bloquea ranking.

### `audit-stale` (ℹ)

Triggerea si:
- Audit disponible pero fecha > 30 dias antes de hoy.

Accion: sugerir en executive summary del report: "Vision audit is 45 dias old. Considera re-run `/business-model-toolkit:product-vision-audit <pillar>` para refrescar."

### `needs-clarification` (❓)

Triggerea si:
- Bucket resolvio a UNCLASSIFIED incluso despues de LLM fallback.
- LLM retorno confidence entre 0.4 y 0.6 (ambiguo).

Accion: listar en seccion "Unclassified" del report con pregunta sugerida al PO.

## Edge cases

### Edge 1: bucket vacio despues de asignacion

Si MUST bucket tiene 0 issues post-asignacion -> warning en executive summary: "Zero Musts detected. Either the pillar is well-aligned, or the spike/audit don't provide clear rules. Review scoring-rules.md o run a fresh audit."

### Edge 2: todos los issues en UNCLASSIFIED

Probable causa: spike sin IDCF parseable, o keyword detection demasiado estricta. Warn al usuario + fallback a "all issues as SHOULD by default + manual review required."

### Edge 3: RICE todos iguales en un bucket

Poco probable pero posible si todos son same-size + same-thesis-count + same-confidence. En ese caso el tiebreak por issue.identifier da orden estable. Log en Appendix del report.

### Edge 4: pillar sin project Linear asociado

Probable config error. Exit 1 con mensaje: "Pillar '<slug>' has no `project` field in linear-setup.json. Either add it or switch to interactive mode."

### Edge 5: codebase existe pero `audits/<pillar>/` no

Comportamiento: proceder sin audit (Confidence=0.8 default). Warn + sugerir `/business-model-toolkit:product-vision-audit`.

### Edge 6: codebase path no existe

Exit 1: "Codebase path '<path>' does not exist. Check linear-setup.json `pillars.<slug>.codebase` o pasa --codebase override."

## Testing

v1 testeado via dogfooding contra:

- `pathways` (spike DOJ-3222, audit 2026-04-17) en dojo-os.
- `agent-doji` (spike DOJ-3229, audit 2026-04-17) en dojo-agent-openclaw-plugin.

Expected output validated:
- Numero de Musts coincide con el count de recommendations del audit + features P0 + killshot theses.
- Numero de Wonts incluye features P3 + explicit out-of-scope del spike.
- RICE scores en rango 0.5-15 para pillars audit-backed.

## Referencias externas consultadas en brainstorm

- [Atlassian: prioritization frameworks](https://www.atlassian.com/agile/product-management/prioritization-framework)
- [Productboard: frameworks glossary](https://www.productboard.com/glossary/product-prioritization-frameworks/)
- [Parabol: frameworks and tools](https://www.parabol.co/resources/prioritization-frameworks-and-tools/)
- [Product School: ultimate guide](https://productschool.com/blog/product-fundamentals/ultimate-guide-product-prioritization)

Los 4 articulos coinciden en que RICE es la metrica cuantitativa dominante. MoSCoW es preferida para bucket assignment por simplicidad + trazabilidad. La adaptacion T-shirt Size sobre weeks es especifica de este toolkit (respeta la regla `no time estimates`).
````

- [ ] **Step 2: Verify**

```bash
wc -l /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/frameworks/moscow-rice.md
```

Expected: ~210 lines.

---

## Task 6: Write linear-mutations.md reference

**Files:**
- Create: `skills/prioritize/references/linear-mutations.md`

- [ ] **Step 1: Write the file with exact content below**

Use `Write` tool for `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/linear-mutations.md`:

````markdown
# Linear Mutations -- delimiter convention, idempotency, templates

Reglas para todas las mutaciones que la skill `prioritize` aplica a Linear: description updates per issue, sub-spike snapshot comments, y el report markdown.

## Delimiter convention (description footers)

### Formato

```html
<!-- dojo:prioritize:start v=1 date=YYYY-MM-DD -->

## Priority (auto-generated)
- **MoSCoW**: <Must|Should|Could|Wont>
- **RICE**: <score> (Reach=<R>, Impact=<I>, Confidence=<C>, Size=<XS|S|M|L>)
- **Rationale**: <citation of matched rules + thesis/feature refs>
- **Report**: [priority-YYYY-MM-DD.md](<url relative to repo root>)
- **Flags**: <flag list or ->

<!-- dojo:prioritize:end -->
```

### Por que HTML comments como delimiter

- Invisibles cuando se renderiza el markdown en Linear.
- Grep-able facilmente: `grep -l "dojo:prioritize:start"` encuentra todos los issues tocados.
- Consistente con el patron usado en PR #167 del plugin (`<!--dojo:component:TYPE:JSON-->`) -- misma familia de markers, aprendizaje transferible.
- `v=1` permite versionado futuro sin romper el parsing (migration path en v2).
- `date=YYYY-MM-DD` permite detectar snapshots stale.

### Reglas de idempotencia

**Si los delimiters ya existen en la description**:
1. Parsear: encontrar indices de `<!-- dojo:prioritize:start` y `<!-- dojo:prioritize:end -->`.
2. Reemplazar TODO el bloque entre ellos (inclusivo) con el nuevo bloque.
3. Todo lo fuera del bloque queda intacto.

**Si los delimiters NO existen**:
1. Append al final de la description con `\n\n` separator.
2. El nuevo bloque es el footer completo.

**Si existen multiples instancias de los delimiters** (error state):
- Log warning + reemplazar solo la primera.
- Dejar las subsiguientes intactas para review manual.
- En Appendix C del report, anotar: "ALT-XXX: multiple delimiters detected, manual cleanup needed".

### Coexistencia con otros delimiters

La skill respeta otros markers del ecosystem DojoOS:

- `<!--dojo:component:TYPE:JSON-->` (PR #167 plugin) -- ignorar, no tocar.
- `<!-- cursor:ignore -->` (si existe) -- ignorar.
- Cualquier comment HTML que NO matchee `<!-- dojo:prioritize:start` exactamente -- ignorar.

Solo tocar nuestros propios delimiters.

### Ejemplo antes/despues

**Antes** (description tiene otro contenido):

```markdown
## Context
This issue is about refactoring the certificate service to block auto-generation
post-quiz, per the Pathways vision (DOJ-3222 D1).

## Acceptance criteria
- [ ] Add attestor_id check before generating PDF
- [ ] Update tests

<!-- dojo:prioritize:start v=1 date=2026-04-10 -->

## Priority (auto-generated)
- **MoSCoW**: Should
- **RICE**: 8.0 (...)
...

<!-- dojo:prioritize:end -->
```

**Despues** (re-run con audit actualizado que ahora lo clasifica como Must):

```markdown
## Context
This issue is about refactoring the certificate service to block auto-generation
post-quiz, per the Pathways vision (DOJ-3222 D1).

## Acceptance criteria
- [ ] Add attestor_id check before generating PDF
- [ ] Update tests

<!-- dojo:prioritize:start v=1 date=2026-04-21 -->

## Priority (auto-generated)
- **MoSCoW**: Must
- **RICE**: 13.5 (Reach=9, Impact=3, Confidence=1.0, Size=S)
- **Rationale**: D1 ⚠️ thesis (killshot) + anti-pattern VIOLATION
- **Report**: [priority-2026-04-21.md](...)
- **Flags**: —

<!-- dojo:prioritize:end -->
```

Context + Acceptance criteria intactos. Solo el bloque de priority cambio.

---

## Priority report template

Filename: `priority-<YYYY-MM-DD>.md`
Path: `<codebase>/audits/<pillar>/priority-<YYYY-MM-DD>.md`

### Template completo

```markdown
# Priority Snapshot -- <Pillar Title>

**Framework**: MoSCoW + RICE (Reach × Impact × Confidence / Size)
**Pillar**: <pillar-slug>
**Sub-spike**: [<DOJ-XXXX>](<spike url>) -- <spike title>
**Project Linear**: [<project-name>](<project url>)
**Vision audit**: <path or "none">  (alineacion: <FUERTE|PARCIAL|DEBIL|CRITICO|N/A>)
**Issues evaluated**: <N>
**Fecha**: YYYY-MM-DD
**Previous snapshot**: <path to prev or "first snapshot">
**Command**: `/make-no-mistakes:prioritize <pillar> <flags>`

---

## Resumen ejecutivo

<1 parrafo: breakdown por bucket; top-3 Musts; gap mas relevante vs audit.>

---

## Must (N issues)

| # | Issue | Title | Rationale | RICE | Size | Flags |
|---|-------|-------|-----------|------|------|-------|
| 1 | [ALT-124](url) | Block cert generation post-quiz | D1 ⚠️ + VIOLATION | 13.5 | S | — |

## Should (N issues)
<same table>

## Could (N issues)
<same table>

## Won't (N issues)
<same table>

## Unclassified (N issues -- needs human review)

| Issue | Why unclear | Suggested clarification |

## Decompose required (N issues)

<XL issues. Para cada uno: `/make-no-mistakes:spike-recommend <id>` como next action.>

| Issue | Title | Size | Suggested decomposition |

---

## Diff vs previous snapshot

<Si existe prev:>

### Changed buckets
| Issue | Previous | Current | Razon |

### New issues since last snapshot
<lista>

### Closed/Done since last snapshot
<lista>

<Si no:>
First priority snapshot. No comparison available.

---

## Linear mutations <applied|proposed>

<Tabla por issue + status + sub-spike comment link.>

| Issue | Description | Sub-spike comment |
|-------|-------------|-------------------|
| ALT-124 | applied ✓ | ref: <comment url> |

---

## Appendix A: RICE calculations

<Por issue, breakdown completo de R/I/C/S + score + flags.>

## Appendix B: Rule trace (audit log)

<Por issue, reglas matched + not-matched del scoring-rules.md.>

## Appendix C: Warnings

<Delimiter collisions, parse warnings del spike, audit stale, etc.>
```

---

## Sub-spike comment template

### Target

El spike del pillar: `pillars.<slug>.spike` (ej: DOJ-3222 para Pathways).

**NO** postear en el spike maestro DOJ-3228 (constitucion umbrella).

### Formato

```markdown
## Priority Snapshot -- YYYY-MM-DD

**Framework**: MoSCoW + RICE
**Issues evaluated**: <N>
**Report**: [`<codebase>/audits/<pillar>/priority-YYYY-MM-DD.md`](<github url>)
**Vision audit**: [<audit filename>](<url>) (alineacion: <status>)

### Must (<N>) -- top 5 por RICE
| Issue | Title | RICE |
|-------|-------|------|
| ALT-124 | Block cert generation post-quiz | 13.5 |
<hasta 5 rows, resto en el report>

### Should (<N>) -- top 5 por RICE
<same>

### Could (<N>)
<count only, linked to report>

### Won't (<N>)
<count only, linked to report>

### Unclassified (<N>)

### Decompose required (<N>)

---

> Regenerated by `/make-no-mistakes:prioritize <pillar>` on YYYY-MM-DD.
> Previous snapshot comment: [link if exists] (YYYY-MM-DD).
```

### Reglas de comment

1. **Cada run = nuevo comment**. NUNCA editar un comment anterior (Linear no tiene historial bueno de edits).
2. **Link al anterior**: si existe comment previo de priority-snapshot en el mismo spike, agregar link al footer del nuevo.
3. **Timeline natural**: el thread del spike se convierte en el historial de priorization snapshots. Util para ver como evoluciona el pillar.

### Deteccion de comment previo

Para encontrar el comment anterior del mismo pillar:

1. `mcp__linear-server__list_comments` en el spike.
2. Filtrar por comments cuyo body matchea regex `^## Priority Snapshot -- \d{4}-\d{2}-\d{2}$` en la primera linea.
3. Tomar el mas reciente (por `createdAt`).
4. Usar su URL como "Previous snapshot comment" en el nuevo.

Si no hay match: primer snapshot, no hay link.

---

## Mutation failure handling

### Description update failures

Si `mcp__linear-server__save_issue` falla para un issue:

1. Log error completo al Appendix C del report.
2. Continuar con los otros issues del batch (no abortar).
3. Al final, reportar al usuario: "<N>/<M> descriptions updated, <M-N> failed. See Appendix C for details."
4. Exit code 3 si hubo alguna falla.

### Sub-spike comment failure

Si `mcp__linear-server__save_comment` falla:

1. Log error.
2. Incluir en Appendix C del report con instruccion: "Manual action required: copy the 'Sub-spike comment template' section below and post as comment on <spike-id>."
3. Exit code 3.

### Dry-run behavior

`--dry-run=true`:

1. Skip Artifacts 2 y 3 (no tocar Linear).
2. Report titulo: "Proposed mutations (dry-run, not applied)".
3. Incluir en el report una seccion "Proposed mutations" con lo que se HARIA si no fuera dry-run.
4. Exit 0 si el report se escribio sin errores.

---

## Version history

- `v=1` (2026-04-21): primera implementacion. Description footer + sub-spike comment + report markdown.
- `v=2` (TBD): agregar labels MoSCoW (`moscow/must|should|could|wont`) cuando Juan Carlos apruebe crearlas en el workspace.
- `v=3+` (hipotetico): custom field "Priority" en Linear si el workspace lo habilita.

Backward compat: `v=1` bloques siempre seran reconocibles por `dojo:prioritize:start v=1`.
````

- [ ] **Step 2: Verify**

```bash
wc -l /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/linear-mutations.md
```

Expected: ~250 lines.

---

## Task 7: Write llm-fallback-bucket.md prompt

**Files:**
- Create: `skills/prioritize/references/prompts/llm-fallback-bucket.md`

- [ ] **Step 1: Write the file with exact content below**

Use `Write` tool for `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/prompts/llm-fallback-bucket.md`:

````markdown
# LLM Fallback Prompt -- UNCLASSIFIED bucket resolution

Este prompt se usa cuando las reglas deterministicas de `../scoring-rules.md` no matchean ningun bucket para un issue. El fallback pide al LLM que sugiera un bucket + razon + confidence.

## Invocation

Dispatch via `Agent` tool (sync, no background, model=sonnet por costo-eficiencia):

```
description: "LLM fallback bucket assignment for <issue-id>"
subagent_type: "general-purpose"
model: "sonnet"
prompt: <el prompt debajo>
```

## Prompt template

````
Eres un product strategist senior. Tu tarea es asignar un bucket MoSCoW (Must/Should/Could/Won't) a un issue de Linear, usando como referencia el sub-spike PIBER+IDCF del pillar correspondiente.

## Reglas

1. Tu output debe incluir:
   - bucket: MUST | SHOULD | COULD | WONT | UNCLASSIFIED
   - confidence: 0.0 a 1.0
   - rationale: 1-2 oraciones citando la thesis/feature/capability/antipattern del spike que justifica el veredicto.

2. Si confidence < 0.6, responder `bucket: UNCLASSIFIED` (deja para review humana).

3. NO inventar thesis/feature/capability que no existan en el spike. Si tu razon es "suena importante", retornar UNCLASSIFIED.

4. Priorizar bucket en este orden: MUST > SHOULD > COULD > WONT. Si el issue podria ser MUST o SHOULD, elegir SHOULD y explicar por que NO MUST.

5. Responder en JSON valido, sin markdown wrapping:

```json
{
  "bucket": "SHOULD",
  "confidence": 0.75,
  "rationale": "Matches capability 'Peer-verification framework' marked Build in spike. Audit status is PARTIAL. SHOULD because no killshot thesis affected."
}
```

## Input

### Issue
- Identifier: <issue-identifier>
- Title: <issue-title>
- Description: <issue-description-first-500-chars>
- Labels: <labels-comma-separated>
- Size: <size-label-or-"missing">

### Spike (relevantes)

**Design Theses** (con killshot flag ⚠):
<paste theses table from spike>

**Features** (P0, P1, P2, P3):
<paste features lists>

**Capabilities** (Build/Buy/Partner):
<paste capabilities table>

**Anti-patterns**:
<paste anti-patterns list>

### Audit (si existe)

Status per thesis: <map thesis_id -> OK/PARTIAL/MISSING/DRIFT>
Anti-pattern violations: <list>

### Context adicional
- Phase locks activos: <list or "none">
- Sub-spike North Star metric: <metric name + status>

## Tu output

Responder SOLO el JSON, sin preamble, sin explicacion adicional, sin code fence.
````

## Parsing del output

La skill parsea el JSON retornado:

1. Si `bucket` no es uno de los 5 valores validos -> mantener UNCLASSIFIED.
2. Si `confidence < 0.6` -> mantener UNCLASSIFIED + log `llm_rationale` al Appendix del report.
3. Si `confidence >= 0.6` -> asignar `bucket`, anotar `matched_rules: ["llm-fallback"]`, guardar `llm_rationale`.

## Safety limits

- Max 20 UNCLASSIFIED fallbacks por run (si >20, exit 2 con sugerencia de refinar scoring-rules).
- Max 2000 input tokens por prompt (trim description si muy larga).
- Max 500 output tokens (el JSON es corto).

## Por que LLM y no mas reglas

Las reglas deterministicas cubren el 80-95% de los casos. El residual 5-20% son:

- Issues ambiguos donde multiples theses aplican parcialmente.
- Refactors tecnicos sin thesis directo pero con impacto indirecto.
- Features cross-pillar donde la tabla del spike no lista el caso exacto.

Un LLM con contexto del spike completo puede resolver esos casos con alta fidelidad. Las reglas deterministicas son preferibles cuando aplican (deterministicas, reproducibles, auditables), pero fallar al capturar el caso dificil + tirar error no es aceptable si hay una alternativa razonable.

## Referencias

- Ver `../scoring-rules.md` para las reglas deterministicas que este prompt complementa.
- Ver `../../SKILL.md` seccion "Paso B: UNCLASSIFIED fallback" para cuando se invoca.
````

- [ ] **Step 2: Verify**

```bash
wc -l /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/prompts/llm-fallback-bucket.md
```

Expected: ~100 lines.

---

## Task 8: Write v2 framework stubs (batch)

**Files:**
- Create: `skills/prioritize/references/frameworks/rice.md`
- Create: `skills/prioritize/references/frameworks/moscow.md`
- Create: `skills/prioritize/references/frameworks/ice.md`
- Create: `skills/prioritize/references/frameworks/wsjf.md`
- Create: `skills/prioritize/references/frameworks/kano.md`

- [ ] **Step 1: Write rice.md stub**

Use `Write` tool for `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/frameworks/rice.md`:

````markdown
# Framework: rice (v2 stub)

**Status**: Not yet implemented. Reserved for v2.

RICE puro sin MoSCoW bucket-ing. Util cuando no hay vision declarada (spike PIBER+IDCF) pero si hay backlog y ganas de ordenar por impacto/esfuerzo.

## Cuando se implementaria

- Cuando un pillar aun no tiene sub-spike PIBER+IDCF (pre-vision stage).
- Cuando el product manager quiere contrastar un ranking RICE puro con el moscow-rice hybrid (sanity check).

## Planned formula

```
RICE = (Reach × Impact × Confidence) / Effort
```

Sin el filtro MoSCoW, TODOS los issues reciben ranking. El output es un single sorted list en vez de 4 buckets.

## Diferencias con moscow-rice (v1)

- `Effort` usa T-shirt sizes (same as v1).
- `Impact` no depende de thesis matching -> usa escala 1-10 libre estimada por el PM.
- `Confidence` no usa audit (si existe, podria opcionalmente).
- Output: single sorted list descendente por score.

## Status actual

Invocar `/make-no-mistakes:prioritize --framework rice` retorna:

```
Error: framework 'rice' not yet implemented. Use --framework moscow-rice (default) or ver docs/superpowers/specs para roadmap.
```

Ver `./moscow-rice.md` para la implementacion activa.
````

- [ ] **Step 2: Write moscow.md stub**

Use `Write` tool for `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/frameworks/moscow.md`:

````markdown
# Framework: moscow (v2 stub)

**Status**: Not yet implemented. Reserved for v2.

MoSCoW puro, sin RICE intra-bucket. Util para release planning rapido cuando el tiebreak cuantitativo no importa.

## Cuando se implementaria

- Release planning donde "tener Must resueltos" es el objetivo, no "ordenar Musts".
- Pillars chicos (<10 issues) donde RICE no aporta.
- PO que quiere simplicidad sobre cuantificacion.

## Diferencias con moscow-rice

- Sin calculo de RICE.
- Buckets mantienen orden natural (spike-derived, ALT-identifier asc).
- Output report mas corto (no Appendix A de RICE calculations).

## Status actual

Invocar `/make-no-mistakes:prioritize --framework moscow` retorna:

```
Error: framework 'moscow' not yet implemented. Use --framework moscow-rice (default) o ver docs/superpowers/specs.
```
````

- [ ] **Step 3: Write ice.md stub**

Use `Write` tool for `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/frameworks/ice.md`:

````markdown
# Framework: ice (v2 stub)

**Status**: Not yet implemented. Reserved for v2.

ICE = Impact × Confidence × Ease. Similar a RICE pero sin Reach (asume uniforme). Preferido por equipos pequenos (growth, experimentos).

## Planned formula

```
ICE = Impact × Confidence × Ease
```

Con escalas 1-10 por variable. Max score = 1000, mas legible que RICE fraccional.

## Cuando se implementaria

- Experimentos de growth (A/B tests, feature flags).
- Backlogs donde Reach es homogeneo (todo afecta al mismo target user).

## Status actual

Invocar `/make-no-mistakes:prioritize --framework ice` retorna error equivalente a los stubs anteriores.
````

- [ ] **Step 4: Write wsjf.md stub**

Use `Write` tool for `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/frameworks/wsjf.md`:

````markdown
# Framework: wsjf (v2 stub)

**Status**: Not yet implemented. Reserved for v2.

WSJF = Weighted Shortest Job First. Del Scaled Agile Framework (SAFe). Privilegia "costo de retraso" -- que pasa si NO hacemos esto?

## Planned formula

```
WSJF = (User Value + Time Value + Risk Reduction) / Job Size
```

Todas las variables en escala Fibonacci (1, 2, 3, 5, 8, 13, 21).

## Cuando se implementaria

- Organizaciones que adoptan SAFe (poco probable en DojoOS pero util para clientes).
- Pillars con dependencies temporales (deadline-driven).

## Incompatibilidad parcial con DojoOS

- `Time Value` asume time pressure medible (deadlines). DojoOS tiene la regla `no time estimates`.
- Adaptacion: usar `Opportunity Window` (high/med/low) en vez de weeks.

## Status actual

Stub.
````

- [ ] **Step 5: Write kano.md stub**

Use `Write` tool for `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/frameworks/kano.md`:

````markdown
# Framework: kano (v2 stub)

**Status**: Not yet implemented. Reserved for v2.

Kano classifica features por satisfaccion del cliente:
- **Basic** (must-have, no feature = anger).
- **Performance** (more = better).
- **Excitement** (delighters, absence OK).
- **Indifferent** (neutral).
- **Reverse** (less is more).

## Cuando se implementaria

- Research fases post-MVP (cuando hay usuarios reales para validar).
- Requiere customer survey data para clasificar -- no se puede derivar de spike solo.

## Incompatibilidad

- Kano requiere input de usuarios, no del spike. No es determinista sobre vision sola.
- Posible uso hibrido: `moscow-rice` para backlog interno + `kano` para validar con usuarios externos.

## Status actual

Stub.
````

- [ ] **Step 6: Verify all 5 stubs exist**

```bash
ls /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/skills/prioritize/references/frameworks/
```

Expected output:
```
ice.md  kano.md  moscow-rice.md  moscow.md  rice.md  wsjf.md
```

6 files total (moscow-rice.md + 5 stubs).

---

## Task 9: Update linear-setup.json in both repos

**Files:**
- Modify: `dojo-os/linear-setup.json`
- Modify: `dojo-agent-openclaw-plugin/linear-setup.json`

- [ ] **Step 1: Read dojo-os/linear-setup.json**

Read `/home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-os/linear-setup.json`. Note existing structure (team key, projects, other fields).

- [ ] **Step 2: Add `pillars` field to dojo-os config**

If the file does NOT have a `pillars` key, use `Edit` to add it as a top-level key (after `team` if that exists). Merge with existing content.

**Content to add**:

```json
  "pillars": {
    "pathways": {
      "project": "Pathways",
      "spike": "DOJ-3222",
      "codebase": "."
    },
    "community": {
      "project": "Community",
      "spike": "DOJ-3227",
      "codebase": "."
    },
    "launchpad": {
      "project": "Launchpad",
      "spike": "DOJ-3224",
      "codebase": "."
    },
    "hackathons": {
      "project": "Hackathons",
      "spike": "DOJ-3225",
      "codebase": "."
    },
    "marketplace": {
      "project": "Marketplace",
      "spike": "DOJ-3226",
      "codebase": "."
    },
    "score": {
      "project": "Dojo Score",
      "spike": "DOJ-3230",
      "codebase": "."
    },
    "projects": {
      "project": "Dojo Projects (B2B)",
      "spike": "DOJ-3223",
      "codebase": "."
    }
  }
```

**Note**: `codebase: "."` since `linear-setup.json` lives at the repo root of dojo-os. If user runs `prioritize pathways` from outside the repo, the `--codebase` flag can override.

- [ ] **Step 3: Validate dojo-os/linear-setup.json is valid JSON**

```bash
cd /home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-os && python3 -c "import json; json.load(open('linear-setup.json')); print('valid')"
```

Expected: `valid`.

- [ ] **Step 4: Read dojo-agent-openclaw-plugin/linear-setup.json**

Read `/home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-agent-openclaw-plugin/linear-setup.json`.

- [ ] **Step 5: Add `pillars` field to plugin config**

Use `Edit` to add:

```json
  "pillars": {
    "agent-doji": {
      "project": "Agent",
      "spike": "DOJ-3229",
      "codebase": "."
    }
  }
```

- [ ] **Step 6: Validate plugin/linear-setup.json is valid JSON**

```bash
cd /home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-agent-openclaw-plugin && python3 -c "import json; json.load(open('linear-setup.json')); print('valid')"
```

Expected: `valid`.

---

## Task 10: Update toolkit README

**Files:**
- Modify: `README.md` (toolkit root)

- [ ] **Step 1: Read current README.md**

Read `/home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/README.md`.

- [ ] **Step 2: Locate the commands list section**

Search for "commands" header or a list of slash commands. If found, add `/prioritize` with description.

If no such section exists, add a "Commands" section near the top with this content:

```markdown
## Commands

| Command | Description |
|---------|-------------|
| `/implement` | Execute Linear issues with discipline (worktree, reviewers, CI) |
| `/prioritize` | Apply MoSCoW + RICE to pillar issues, traceable to PIBER+IDCF sub-spike |
| `/spike-recommend` | Analyze a Linear issue and produce bilingual implementation brief |
| `/spec-recommend` | Turn spec files or SRD tasks into implementation briefs |
| `/review-open-prs` | Cross-reference open PRs with Linear + Greptile scoring |
| `/review-active-issues` | Review active Linear issues with GitHub cross-reference |
| `/rebase` | Sync branches after a release or team-wide rebase |
| `/takeover-pr` | Pick up a teammate's open PR |
| `/pentest-runner` | Automated pentest following Cyber Kill Chain + OWASP |
| `/e2e-test-runner` | Execute E2E tests from test-suite.json |
| `/e2e-test-builder` | Generate test-suite.json from use-case docs |
| `/e2e-test-preview` | Qt-based visual previewer for test-suite.json |
| `/daily-standup-post-slack` | Post daily standup to Slack |
| `/daily-standup-add-completed` | Append completed work to standup file |
| `/goodmorning` | Bootstrap your day from next-day handoff files |
| `/goodnight` | Save session context to next-day handoff |
| `/summarize` | Generate session recap |
| `/pending-left` | Prioritized actionable list of pending work |
| `/remind` | Recall decisions, feedback, instructions from memory |
| `/linear-projects-setup` | Bootstrap Linear workspace (labels, projects, milestones) |

Chain natural: `product-vision-audit -> prioritize -> spike-recommend -> implement`.
```

Use `Edit` to insert this after the first heading/description section. If a Commands section exists, insert the `/prioritize` row in alphabetical or chain order.

- [ ] **Step 3: Verify README has the /prioritize entry**

```bash
grep -n "prioritize" /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit/README.md
```

Expected: at least 1 match with a description.

---

## Task 11: Dogfood run #1 -- pathways dry-run

**Files:**
- Generates: `dojo-os/audits/pathways/priority-2026-04-21.md` (dry-run, no Linear mutations)

- [ ] **Step 1: Verify prereqs**

```bash
ls /home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-os/audits/pathways/vision-audit-2026-04-17.md && ls /home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-os/linear-setup.json
```

Expected: both files listed (already moved in earlier session).

- [ ] **Step 2: Invoke the command in dry-run mode**

Invoke `/make-no-mistakes:prioritize pathways --dry-run` via the Skill tool or direct SKILL.md execution.

The skill should:
1. Read `dojo-os/linear-setup.json`, resolve `pillars.pathways`.
2. Dispatch 3 subagents (fetch-issues, fetch-spike, load-audit).
3. Apply MoSCoW + RICE.
4. Write the report to `dojo-os/audits/pathways/priority-2026-04-21.md`.
5. Skip Artifacts 2 and 3 (dry-run).

- [ ] **Step 3: Verify the report was written**

```bash
ls -la /home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-os/audits/pathways/priority-2026-04-21.md
```

Expected: file exists, non-empty.

- [ ] **Step 4: Sanity check the report content**

Read the first 50 lines of the report. Verify:
- Title `# Priority Snapshot -- Pathways`
- Metadata block with pillar, spike, project, audit, fecha.
- Bucket sections (Must, Should, Could, Won't, Unclassified, Decompose required).
- "Proposed mutations (dry-run, not applied)" in the Linear mutations section.

If any check fails, fix the SKILL.md logic and re-run.

- [ ] **Step 5: Validate RICE ranges**

In the Must section, verify RICE scores fall between 0.5 and 15 (typical range per `moscow-rice.md`). If any Must has RICE > 20, investigate -- likely a size-label missing fallback error.

---

## Task 12: Dogfood run #2 -- agent-doji with real mutations (1-2 test issues)

**Files:**
- Generates: `dojo-agent-openclaw-plugin/audits/agent-doji/priority-2026-04-21.md`
- Mutates: 1-2 test issues in the Agent project (description footer + comment on DOJ-3229)

- [ ] **Step 1: Verify prereqs**

```bash
ls /home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-agent-openclaw-plugin/audits/agent-doji/vision-audit-2026-04-17.md && ls /home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-agent-openclaw-plugin/linear-setup.json
```

Expected: both files present.

- [ ] **Step 2: Run with --issue-ids targeting 2 specific test issues**

First, list issues in the Agent project to pick 2 safe test targets (ideally issues in Backlog, not assigned, not critical):

Use `mcp__linear-server__list_issues` with project filter = "Agent" and state = Backlog, limit=5.

Pick 2 issue identifiers. Note them.

- [ ] **Step 3: Invoke with those specific issues**

```
/make-no-mistakes:prioritize agent-doji --issue-ids <id1>,<id2>
```

Note: NO --dry-run this time. We want to verify the Linear mutations work.

- [ ] **Step 4: Verify the report**

```bash
ls /home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-agent-openclaw-plugin/audits/agent-doji/priority-2026-04-21.md
```

- [ ] **Step 5: Verify description footer applied to issue 1**

Use `mcp__linear-server__get_issue` with the first issue ID. Check that the description contains the `<!-- dojo:prioritize:start v=1 date=2026-04-21 -->` block.

- [ ] **Step 6: Verify description footer applied to issue 2**

Same check for the second issue.

- [ ] **Step 7: Verify sub-spike comment posted**

Use `mcp__linear-server__list_comments` on DOJ-3229. Verify the latest comment has:
- Body starting with `## Priority Snapshot -- 2026-04-21`.
- Bucket sections with counts.
- Link to the priority report path.

- [ ] **Step 8: Test idempotency**

Re-run the exact same command. Verify:
- The report gets a new filename with suffix `-2` (coexistence rule).
- The description footer on each issue is REPLACED (not stacked).
- A new comment on DOJ-3229 is created (one per run, with link to previous).

- [ ] **Step 9: Rollback test mutations if desired**

If the test issues should be pristine after testing, manually remove the dojo:prioritize block from their description (or note it as an intentional real priority for those issues).

---

## Task 13: Slack response to Juan Carlos + labels ask

**Files:**
- No files. Composes a Slack message.

**Context**: Juan Carlos sent a message at https://dojocoding.slack.com/archives/C08FZTCT1BN/p1776477341077779. The user asked this to be addressed post-implementation. This message bundles:
1. Response to whatever JC asked.
2. Summary of the `/prioritize` work shipped.
3. Ask to create MoSCoW labels in the workspace so v2 can use `--target=labels`.

- [ ] **Step 1: Read JC's original message**

Use `mcp__claude_ai_Slack__slack_read_thread` (or equivalent) with the message URL/ts to understand what JC asked.

- [ ] **Step 2: Compose Spanish response**

Per user memory (`feedback_slack_spanish.md`): all Slack messages to the Dojo team must be in Spanish.
Per user memory (`feedback_slack_no_unicode_bullets.md`): use `-` not `•`.
Per user memory (`feedback_slack_mention_bot.md`): if addressing Dojo-kun (bot), mention `<@U0AKQTC67H6>`. Not applicable here -- addressing JC.

Draft message structure:
1. Acknowledge JC's original point/ask.
2. Brief what we shipped: `/make-no-mistakes:prioritize` + updated `product-vision-audit` output convention.
3. Ask for labels approval with explicit label names and rationale.

Example (adapt to JC's actual message content):

```
Hola @JC -- respondo a <reference to JC's message>.

Recap de lo que shippee hoy:
- `/business-model-toolkit:product-vision-audit` ahora escribe el report en `<codebase>/audits/<pillar>/vision-audit-<fecha>.md` (antes iba a ./business/ del toolkit). Los 2 audits de ayer (pathways, agent-doji) ya estan en sus repos correctos.
- `/make-no-mistakes:prioritize <pillar>` nuevo: aplica MoSCoW + RICE-adaptado a los issues del project del pillar, traceable a Design Theses del sub-spike + vision audit. Output:
  - Report md en `<codebase>/audits/<pillar>/priority-<fecha>.md` (coexiste con el vision-audit).
  - Footer autogenerado en la description de cada issue (delimiter HTML idempotente, v=1).
  - Comment snapshot en el sub-spike del pillar (DOJ-3222, DOJ-3229, etc.), no en DOJ-3228.

Una cosa que necesito aprobacion tuya para habilitar v2:

Para que el comando pueda aplicar labels MoSCoW directamente (en vez de solo escribir el bucket en la description), necesitamos crear 4 labels nuevos en el workspace:
- `moscow/must`
- `moscow/should`
- `moscow/could`
- `moscow/wont`

Por ahora v1 usa solo el description-footer, asi que funciona sin los labels. Pero cuando esten creados, v2 flip a `--target=labels|both` y los issues quedan filtrables nativamente en Linear (vista por label, por ejemplo "todos los Musts de Pathways este mes").

Si te parece, los creo con ese exact naming? O preferis otro patron (ej: `priority/must`, o solo 1 label custom `MoSCoW: Must`)?

Reports dogfooded para tu review:
- dojo-os/audits/pathways/priority-2026-04-21.md
- dojo-agent-openclaw-plugin/audits/agent-doji/priority-2026-04-21.md
- Spec: make-no-mistakes-toolkit/docs/superpowers/specs/2026-04-21-prioritize-command-design.md
```

- [ ] **Step 3: Send via Slack MCP**

Use `mcp__claude_ai_Slack__slack_send_message` with:
- channel: C08FZTCT1BN (from the URL)
- thread_ts: 1776477341077779 (from the URL, needs `.` inserted: `1776477341.077779`)
- text: the composed Spanish message.

- [ ] **Step 4: Verify the message was posted**

Use `mcp__claude_ai_Slack__slack_read_thread` on the same thread. Verify the new message appears.

---

## Final Summary Task: Batch commit approval

**Files:**
- None (meta-task for user approval).

- [ ] **Step 1: Run git status on make-no-mistakes-toolkit**

```bash
cd /home/kvttvrsis/Documentos/GitHub/dojocoding/make-no-mistakes-toolkit && git status --short
```

- [ ] **Step 2: Run git status on business-model-toolkit**

```bash
cd /home/kvttvrsis/Documentos/GitHub/dojocoding/business-model-toolkit && git status --short
```

- [ ] **Step 3: Run git status on dojo-os**

```bash
cd /home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-os && git status --short
```

- [ ] **Step 4: Run git status on dojo-agent-openclaw-plugin**

```bash
cd /home/kvttvrsis/Documentos/GitHub/dojocoding/dojo-agent-openclaw-plugin && git status --short
```

- [ ] **Step 5: Present summary to user + ask for commit permission**

Show the user:
- Files added to make-no-mistakes-toolkit (prioritize command + skill + references + spec + plan + README + linear-setup pillars entry).
- Files added to business-model-toolkit (updated product-vision-audit command + skill).
- Files added to dojo-os (2 audit file moved into audits/pathways/ + priority report + linear-setup.json pillars).
- Files added to dojo-agent-openclaw-plugin (audit moved + priority report + linear-setup.json pillars).

Ask: "Todo listo para commitear en los 4 repos? Branches sugeridos:
- `make-no-mistakes-toolkit`: branch `feature/prioritize-command` con PR a `main`.
- `business-model-toolkit`: branch `feature/product-vision-audit-in-repo-convention` con PR a `main`.
- `dojo-os`: branch `docs/pathways-vision-audit-and-priority` con PR a `develop`.
- `dojo-agent-openclaw-plugin`: branch `docs/agent-doji-vision-audit-and-priority` con PR a `main`.

Procedemos?"

---

## Self-Review

**Spec coverage**: Checked spec section by section against tasks. All decisions D1-D7 covered:
- D1.1 config storage → Task 9.
- D1.2 codebase resolution → Task 9 (codebase field in config).
- D2.1 rules-first + LLM fallback → Task 4 (scoring-rules) + Task 7 (llm-fallback-bucket).
- D2.2 low-confidence defaults → Task 5 (moscow-rice.md flags section).
- D3.1 coexistence of snapshots → Task 6 (linear-mutations.md, "NO se sobreescribe").
- D4 framework scope v1 → Task 5 (moscow-rice) + Task 8 (stubs).
- D5 Linear mutations no labels → Task 6 (description footer + sub-spike comment).
- D6 tracking level → Task 6 ("NO en DOJ-3228 maestro").
- D7 dogfooding → Tasks 11-12.

**Placeholder scan**: No TBD/TODO/"similar to X" found. All code blocks show complete content.

**Type consistency**: Command file, skill file, and references all use consistent field names: `bucket`, `matched_rules`, `cited_thesis`, `audit_status`, `size_label`, `--target`. Framework names match across files.

**Commits deferred**: Per user CLAUDE.md, no task auto-commits. Final task asks user.

**Missing**: None identified in self-review.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-prioritize-command.md`.

Per user's pre-stated preference (earlier message: "Cuando termines con /subagent-driven-development && /implement-advisor"): defaulting to **Subagent-Driven Execution** via superpowers:subagent-driven-development.

- Fresh subagent per task
- Review checkpoint after each task
- Final task (Slack to JC) + commit approval at the end

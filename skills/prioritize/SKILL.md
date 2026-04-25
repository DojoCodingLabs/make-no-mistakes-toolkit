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

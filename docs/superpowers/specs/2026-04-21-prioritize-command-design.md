# Design: `/prioritize` — MoSCoW + RICE para DojoOS pillars

**Status**: draft -- pending spec review
**Fecha**: 2026-04-21
**Autor**: Andres Pena + Claude Code (brainstorm session)
**Plugin target**: `make-no-mistakes-toolkit`
**Upstream dependency**: `business-model-toolkit:product-vision-audit` (convencion de output in-repo per pillar)

---

## Contexto

### Problema

DojoOS tiene 8 pillars (Pathways, Dojo Projects, Launchpad, Hackathons, Marketplace, Community, Dojo Score, Agent/Doji), cada uno con:

- Un sub-spike PIBER+IDCF que declara la vision (DOJ-3222, DOJ-3223, DOJ-3224, DOJ-3225, DOJ-3226, DOJ-3227, DOJ-3229, DOJ-3230), parent del spike maestro DOJ-3228.
- Un project de Linear 1:1 con el pillar, con issues en Backlog/Todo/In Progress.
- Un vision-audit report (cuando se corre `/business-model-toolkit:product-vision-audit`) en `<codebase>/audits/<pillar>/vision-audit-<YYYY-MM-DD>.md`.

Hoy:

- `product-vision-audit` produce un "Top 5 Recommendations" ordenado por impacto estrategico, pero **sin aplicar ningun framework canonico** y sin tocar el backlog existente.
- Los issues del project viven sin priorizacion explicita ligada a la vision. El PO decide ad-hoc cual trabajar.
- No hay trazabilidad entre `Must do this issue` y `Design Thesis ⚠️ que lo justifica`.

### Solucion propuesta

Un comando `/make-no-mistakes:prioritize <pillar>` que:

1. Resuelve automaticamente el contexto del pillar (project Linear + sub-spike + audit mas reciente) via `linear-setup.json` extendido.
2. Aplica **MoSCoW** como bucket assignment deterministico contra Design Theses/Capabilities/Features del spike.
3. Aplica **RICE-adaptado** (con T-shirt sizes en vez de weeks) para ranking intra-bucket cuando el bucket tiene >3 issues.
4. Genera un report markdown + actualiza description-bottom de cada issue + comment snapshot en el sub-spike.

### Diferenciador estrategico

A diferencia de una calculadora RICE generica (Productboard, Parabol, Atlassian, Product School), `/prioritize` es **trazable a la constitucion del producto**: cada veredicto "Must" cita la thesis killshot ⚠️ o feature P0 del spike que lo justifica. No es opinion del PM -- es un derivado del spike + audit.

---

## Decisiones tomadas durante el brainstorm

| # | Decision | Valor elegido | Razon |
|---|----------|---------------|-------|
| D1.1 | Config storage | `linear-setup.json` con tabla `pillars` | Ya existe el archivo en repos con `make-no-mistakes`. Un solo lugar, portable entre workspaces. |
| D1.2 | Codebase resolution | Via config `pillars.<slug>.codebase` | Honra "un slug -> todo el contexto". Flag `--codebase` solo como override. |
| D2.1 | Bucket assignment | Rules-first + LLM fallback para `UNCLASSIFIED` | Determinista para lo que se puede inferir del spike; LLM solo cuando las reglas no matchean (nunca como primer recurso). |
| D2.2 | Datos faltantes en issues | Defaults low-confidence + flag `low-confidence-estimate` | No interrumpir el flujo preguntando issue-por-issue. El flag hace visible que el ranking de ese issue necesita revision humana. |
| D3.1 | Snapshots historicos | Coexisten (ambos archivos con su fecha) | Git ya lleva historial, pero `ls -t audits/<pillar>/priority-*.md` da la vista cronologica en seco. Sin overwrite, sin perdida. |
| D4 | Framework scope v1 | Solo `moscow-rice` implementado. `rice|moscow|ice|wsjf|kano` reservados como stubs. | YAGNI + permite agregar uno por vez sin refactor. |
| D5 | Linear mutations v1 | Description-bottom con delimiter HTML + comment en sub-spike. **NO labels todavia.** | Feedback usuario: no puede crear labels nuevas sin aprobacion admin. v2 flip a labels cuando JC apruebe. |
| D6 | Tracking level | Comment en sub-spike del pillar (DOJ-3222...), NO en maestro DOJ-3228 | Respeta jerarquia: maestro = constitucion umbrella, sub-spikes = docs vivos del pillar. |
| D7 | Testing | Dogfooding: primer run contra `pathways` + `agent-doji` | Comando es orquestador de MCP + string processing. Unit tests se justifican cuando la logica se compleje. |

---

## Contrato del comando

### Invocacion

```bash
/make-no-mistakes:prioritize <pillar-slug> [flags]
```

### Pillar slug -> contexto (via `linear-setup.json`)

```json
{
  "team": { "key": "DOJ" },
  "pillars": {
    "pathways":   { "project": "Pathways",   "spike": "DOJ-3222", "codebase": "./dojo-os" },
    "agent-doji": { "project": "Agent",      "spike": "DOJ-3229", "codebase": "./dojo-agent-openclaw-plugin" },
    "community":  { "project": "Community",  "spike": "DOJ-3227", "codebase": "./dojo-os" },
    "launchpad":  { "project": "Launchpad",  "spike": "DOJ-3224", "codebase": "./dojo-os" },
    "hackathons": { "project": "Hackathons", "spike": "DOJ-3225", "codebase": "./dojo-os" },
    "marketplace":{ "project": "Marketplace","spike": "DOJ-3226", "codebase": "./dojo-os" },
    "score":      { "project": "Dojo Score", "spike": "DOJ-3230", "codebase": "./dojo-os" },
    "projects":   { "project": "Dojo Projects (B2B)", "spike": "DOJ-3223", "codebase": "./dojo-os" }
  }
}
```

Si el pillar no existe en la config, el comando entra en modo interactivo: pide project Linear + spike ID + codebase, y ofrece guardarlos en la config antes de proceder.

### Flags

| Flag | Default | Descripcion |
|------|---------|-------------|
| `--framework <name>` | `moscow-rice` | v1 solo implementa `moscow-rice`. Otros (`rice`, `moscow`, `ice`, `wsjf`, `kano`) retornan "not yet implemented" con stub referenciando `references/frameworks/<name>.md`. |
| `--no-audit` | (off) | Ignora el audit aunque exista. Util cuando el audit esta stale o antes del primer run. |
| `--codebase <path>` | (off) | Override manual si el `linear-setup.json` no lo declara. |
| `--target <mode>` | `description` | `description` (footer con delimiter), `labels` (requiere `moscow/*` labels pre-aprobados), `both` (ambos). v1 soporta solo `description`; `labels`/`both` validan y fallan limpio si labels faltan. |
| `--dry-run` | (off) | No toca Linear. Genera el report con seccion "proposed mutations" en vez de "applied mutations". |
| `--out <path>` | (auto) | Override location del report. Por default: `<codebase>/audits/<pillar>/priority-<YYYY-MM-DD>.md`. |
| `--issue-ids <ids>` | (off) | Priorizar solo estos issue IDs (lista coma-separada). Util para re-scorear subset sin tocar el resto. |

### Exit codes

- `0` -- exito, report generado (con o sin mutations aplicadas segun `--dry-run`).
- `1` -- error de configuracion (pillar no existe, linear-setup invalido, MCPs no disponibles).
- `2` -- error de data (spike no tiene IDCF parseable, issues fetch fallo).
- `3` -- mutation error (description update fallo para 1+ issue; report se genera igual con lista de fallas).

---

## Scoring pipeline

### Paso A: Fetching (paralelo)

Usar `Agent` tool con `run_in_background: true` para 3 subagents independientes:

```
subagent-1 (fetch-issues): linear-server MCP list_issues
  filter: project = pillars.<slug>.project, state in (Backlog, Todo, In Progress)
  output: JSON con { id, identifier, title, description, labels, state, priority, size, estimates }

subagent-2 (fetch-spike): linear-server MCP get_issue
  id: pillars.<slug>.spike
  output: parsed { P, I, B, E, R, D (theses con killshot flag ⚠️), C (capabilities), F (features por tier), antipatterns }

subagent-3 (load-audit): Glob audits/<pillar>/vision-audit-*.md
  pick most recent by YYYY-MM-DD in filename
  output: parsed { alignment_global, scorecard, theses_status_map, features_status_map, antipattern_violations, recommendations }
  if no file: { audit: null }
```

Orquestador espera a los 3, luego procede al Paso B.

### Paso B: MoSCoW bucket assignment (deterministico)

Para cada issue, aplicar en orden (primer match gana):

```
MUST:
  - issue.title/description matchea killshot thesis (⚠️) Y no esta en audit como SHIPPED
  - issue resuelve un VIOLATION antipattern del audit
  - issue instrumenta North Star metric cuando esta MISSING
  - issue es Feature P0 del spike Y no esta SHIPPED en audit

SHOULD:
  - issue avanza una Design Thesis soft (sin ⚠️) Y audit status != SHIPPED
  - issue es Feature P1 del spike Y no esta SHIPPED en audit
  - issue cierra una Capability MISSING/PARTIAL "Build"

COULD:
  - issue es Feature P2 del spike
  - issue cierra una Capability "Buy/Partner"
  - issue es Improvement/UX/perf sin thesis asociada pero con user-facing impact

WONT:
  - issue es Feature P3 del spike
  - issue conflicta con phase actual (ej: descripcion menciona scope frozen por Ship Mode)
  - issue out-of-scope declarado en sub-spike

UNCLASSIFIED (fallback):
  - ninguna regla anterior matchea
  - action: dispatch subagent con prompt incluyendo spike + issue body, pedir bucket sugerido con rationale
  - si LLM retorna confidence < 0.6, mantener UNCLASSIFIED (no forzar bucket)
```

Cada match registra la regla aplicada (audit trail completo en Appendix B del report).

### Paso C: RICE intra-bucket ranking

Aplicar solo cuando el bucket tiene >3 issues. Sino el bucket se lista en el orden del Paso B (insertion order = spike-derived).

**Variables**:

| Variable | Rango | Fuente |
|----------|-------|--------|
| `Reach` | 1, 3, 9 | Inferido del spike: audience scope -- "every user" = 9, "pillar users" = 3, "admin-only" = 1. Fallback: 3. |
| `Impact` | 0, 1, 2, 3 | Count de theses avanzadas: 0 matches=0, 1 match=1, 2 matches=2, killshot match=3 (bonus). |
| `Confidence` | 0.5, 0.8, 1.0 | Audit lookup: `PARTIAL`=1.0, `DRIFT`=0.8, `MISSING`+no research=0.5. Sin audit o ambigio: 0.8. |
| `Size` | 1, 2, 4, 8, 16 | Mapeo T-shirt del Linear Size label: XS=1, S=2, M=4, L=8, XL=16. Sin label: 4 (M). |

**XL issues**: NO entran en ningun bucket MoSCoW y NO reciben RICE score. Se listan exclusivamente en la seccion `Decompose required` del report con flag `DECOMPOSE REQUIRED` y sugieren invocar `/make-no-mistakes:spike-recommend <issue>` para descomponerlos. Rationale: un issue XL es inactionable hasta ser splitted -- priorizar algo que no se puede empezar es ruido. Despues de decomposicion, los sub-issues entran al flow normal en el siguiente run. Consistente con la rule de `spike-recommend`: "XL = decompose, not label".

**Rango de RICE esperado**: con la formula `(R × I × C) / S` los scores caen entre 0.19 (issue minimo: R=1, I=1, C=0.5, S=16 -- pero recordar XL esta excluido, asi que max Size = L=8) y 27.0 (max teorico: R=9, I=3, C=1.0, S=1). Tipico Must para DojoOS Pathways: 3-15 range. Un Must con RICE >10 es excepcional (kill-shot + ready-to-execute + tiny size).

**Formula**:

```
RICE = (Reach × Impact × Confidence) / Size
```

Ranking desc dentro del bucket. Empates deterministicos por `issue.identifier` lexicografico (ALT-123 antes que ALT-456).

### Paso D: Confidence flags

Issues con data faltante reciben flag `low-confidence-estimate` en el report:

- Sin Size label -> fallback a M, flag on.
- Descripcion < 100 chars -> Reach/Impact inferidos por titulo, flag on.
- Sin audit disponible -> Confidence=0.8 default, flag on si el pillar tiene audit disponible pero `--no-audit` fue pasado explicitamente.

Flag visible en el report como `⚠` junto al RICE score. NO bloquea el ranking -- solo avisa al lector.

---

## Output artifacts

### Artifact 1: Priority report (markdown)

**Path**: `<codebase>/audits/<pillar>/priority-<YYYY-MM-DD>.md`

**Coexistencia**: si `priority-<prev-date>.md` ya existe en el dir, NO se sobreescribe. Ambos viven juntos. Git lleva el historial version-controlado; `ls -t audits/<pillar>/priority-*.md` da la vista cronologica en seco. La seccion "Diff vs previous snapshot" del report nuevo referencia el anterior explicitamente.

**Estructura**:

```markdown
# Priority Snapshot -- <Pillar Name>

**Framework**: MoSCoW + RICE (Reach × Impact × Confidence / Size)
**Pillar**: <pillar-slug>
**Sub-spike**: <DOJ-XXXX> -- <spike title>
**Project Linear**: <project name>
**Vision audit**: <path to audit or "none">  (alineacion: <FUERTE|PARCIAL|DEBIL|CRITICO|N/A>)
**Issues evaluated**: <N>
**Fecha**: <YYYY-MM-DD>
**Previous snapshot**: <path to prev priority-*.md or "first snapshot">

---

## Resumen ejecutivo

<1 parrafo: breakdown por bucket (Must=N, Should=N, Could=N, Wont=N, Unclassified=N); top-3 Musts por RICE; gap mas relevante vs audit (ej: "3 issues resuelven VIOLATION del audit pero ninguno esta asignado").>

---

## Must (N issues)

| # | Issue | Title | Rationale | RICE | Size | Flags |
|---|-------|-------|-----------|------|------|-------|
| 1 | [ALT-124](https://linear.app/...) | Block cert generation post-quiz (gate con judge) | D1 ⚠️ + anti-pattern VIOLATION + existing code to gate | 13.5 | S | — |
| 2 | [ALT-123](https://linear.app/...) | Create attestations table schema | D1 ⚠️ + Feature P0 + audit MISSING | 3.375 | M | — |
| 3 | [ALT-127](https://linear.app/...) | Instrument WCC materialized view | North Star MISSING + Feature P0 infra | 2.25 | S | — |
| 4 | [ALT-125](https://linear.app/...) | Refactor Score from pillar-based to dimension-based | D4 DRIFT + audit PARTIAL | 1.8 | L | — |
| ... | | | | | | |

## Should (N issues)
<same table format>

## Could (N issues)
<same table format>

## Won't (N issues)
<same table format>

## Unclassified (N issues -- needs human review)

| Issue | Why unclear | Suggested clarification |
|-------|-------------|-------------------------|
| ALT-XXX | Title matchea multiple theses con conflict | Add comment to issue: "this blocks X or advances Y?" |

## Decompose required (N issues)

<Issues con Size=XL. Incluir link a `/make-no-mistakes:spike-recommend` como siguiente accion.>

---

## Diff vs previous snapshot

<Si existe prev snapshot:>

### Changed buckets
| Issue | Previous | Current | Razon |
|-------|----------|---------|-------|
| ALT-200 | Should | Must | audit ahora detecta VIOLATION |

### New issues since last snapshot
<lista>

### Closed/Done since last snapshot
<lista>

<Si no existe prev:>
First priority snapshot for this pillar. No comparison available.

---

## Linear mutations applied

<Tabla de issues cuya description fue actualizada + link al commento en sub-spike + status de cada mutation. Si `--dry-run`, titular es "Proposed mutations (dry-run, not applied)".>

| Issue | Description updated | Status |
|-------|---------------------|--------|
| ALT-123 | ✓ | applied |
| ALT-124 | ✗ | failed -- API error: ... |

Sub-spike comment: <link to comment en DOJ-XXXX>

---

## Appendix A: RICE calculations

<Por cada issue, full breakdown para que cualquier humano pueda reproducir/refutar el numero:>

### ALT-124 -- Block cert generation post-quiz
- Reach: 9 (every course completion that would trigger cert today)
- Impact: 3 (killshot D1 "Must require certification exam with human judge attestation" + anti-pattern VIOLATION)
- Confidence: 1.0 (audit PARTIAL path exists -- we know what to gate, code change is localized)
- Size: S (2) -- add a check in certificateService
- Score: (9 × 3 × 1.0) / 2 = **13.5**
- Flags: none

### ALT-123 -- Create attestations table schema
- Reach: 9 (every future cert will reference this table)
- Impact: 3 (killshot D1 + Feature P0)
- Confidence: 0.5 (audit MISSING -- greenfield schema, no prior research)
- Size: M (4) -- new table + migration + RLS + typed client
- Score: (9 × 3 × 0.5) / 4 = **3.375**
- Flags: none

### ALT-127 -- Instrument WCC materialized view
- Reach: 3 (admin-only dashboard initially)
- Impact: 3 (North Star MISSING blocks governance)
- Confidence: 0.5 (needs to compose with Rec.2 attestor schema first)
- Size: S (2) -- SQL view + query
- Score: (3 × 3 × 0.5) / 2 = **2.25**
- Flags: low-confidence-estimate (depends on sibling Must ALT-123)

### ALT-125 -- Refactor Score from pillar-based to dimension-based
- Reach: 9 (affects every Score consumer across all pillars)
- Impact: 2 (D4 match, soft thesis -- no killshot)
- Confidence: 0.8 (audit DRIFT -- we know the target shape)
- Size: L (8) -- multiple tables, migration, score-engine refactor
- Score: (9 × 2 × 0.8) / 8 = **1.8**
- Flags: none

## Appendix B: Rule trace (audit log)

<Por cada issue, cuales reglas del Paso B matchearon y cuales no:>

### ALT-123
- Matched rules (MUST bucket):
  - ✓ Killshot thesis D1 mentioned in description (line 12)
  - ✓ Feature P0 "Core Pathway engine" mentioned in title
- Not matched:
  - ✗ North Star instrumentation (not applicable)
  - ✗ Anti-pattern VIOLATION (not detected in audit)

## Appendix C: Unresolved pillars in config

<Si algun issue del project tiene link/reference a otro pillar y la config del otro pillar no esta cargada, flaggear aqui para que el PO actualice linear-setup.json.>
```

### Artifact 2: Description footer en cada issue (Linear)

**Delimiter convention**: HTML comments grep-ables y parseables.

```html
<!-- dojo:prioritize:start v=1 date=2026-04-21 -->

## Priority (auto-generated)
- **MoSCoW**: Must
- **RICE**: 13.5 (Reach=9, Impact=3, Confidence=1.0, Size=S)
- **Rationale**: D1 ⚠️ thesis (killshot) + anti-pattern VIOLATION + audit PARTIAL (existing code to gate)
- **Report**: [priority-2026-04-21.md](https://github.com/DojoCodingLabs/dojo-os/blob/develop/audits/pathways/priority-2026-04-21.md)
- **Flags**: —

<!-- dojo:prioritize:end -->
```

**Reglas de mutacion**:

1. Si delimiters ya existen en la description -> reemplazar el bloque entero (texto entre start y end). Todo lo fuera queda intacto.
2. Si no existen -> append al final de la description con `\n\n` separator antes del bloque.
3. Si la description tiene OTROS delimiters (ej: `<!--dojo:component:...-->` de PR #167) -> ignorar, no tocar.
4. `v=1` en el start tag permite migraciones futuras sin romper el parsing.
5. `date=YYYY-MM-DD` permite detectar snapshots stale (ej: "el report fue regenerado ayer, esta description tiene fecha de hace 3 meses").

**Idempotencia**: correr el comando 2 veces seguido da el mismo resultado (los bloques se reemplazan, no se stackean).

### Artifact 3: Comment en sub-spike del pillar

**Target**: issue Linear `pillars.<slug>.spike` (ej: DOJ-3222 para Pathways).

**NO** va en el spike maestro DOJ-3228 (umbrella, no operacional).

**Formato**:

```markdown
## Priority Snapshot -- 2026-04-21

**Framework**: MoSCoW + RICE
**Issues evaluated**: 47
**Report**: [`dojo-os/audits/pathways/priority-2026-04-21.md`](link)
**Vision audit**: [dojo-os/audits/pathways/vision-audit-2026-04-17.md](link) (alineacion: DEBIL)

### Must (12) -- top 5 por RICE
| Issue | Title | RICE |
|-------|-------|------|
| ALT-124 | Block cert generation post-quiz | 13.5 |
| ALT-123 | Create attestations table schema | 3.375 |
| ALT-127 | Instrument WCC view | 2.25 |
| ALT-126 | Wire forum to peer-verification | 2.25 |
| ALT-125 | Refactor Score to dimension-based | 1.8 |
| ... (+7 more in report) |

### Should (15) -- top 5 por RICE
<same>

### Could (14)
<count only, linked to report>

### Won't (6)
<count only, linked to report>

### Unclassified (0)

### Decompose required (1)
| Issue | Title | Size |
|-------|-------|------|
| ALT-200 | Full Pathways rewrite | XL |

---

> Regenerated by `/make-no-mistakes:prioritize pathways` on 2026-04-21.
> Previous snapshot: [comment link if exists] (2026-04-10).
```

**Coexistencia de comments**: cada corrida agrega un comment nuevo, NO edita el anterior. El spike queda con timeline de priority snapshots -- util para ver como evoluciona el pillar sprint tras sprint.

---

## Command + skill structure

```
make-no-mistakes-toolkit/
├── commands/
│   └── prioritize.md                          # frontmatter + argparse + delegacion
└── skills/
    └── prioritize/
        ├── SKILL.md                           # logica principal
        └── references/
            ├── frameworks/
            │   ├── moscow-rice.md             # v1: impl completa (reglas bucket + formula RICE)
            │   ├── rice.md                    # v2 stub
            │   ├── moscow.md                  # v2 stub
            │   ├── ice.md                     # v2 stub
            │   ├── wsjf.md                    # v2 stub
            │   └── kano.md                    # v2 stub
            ├── scoring-rules.md               # tabla deterministica MUST/SHOULD/COULD/WONT
            ├── linear-mutations.md            # delimiter convention + idempotency rules
            └── prompts/
                └── llm-fallback-bucket.md     # prompt para Paso B UNCLASSIFIED fallback
```

### Frontmatter del comando

```yaml
---
description: Aplica MoSCoW + RICE-adaptado a los issues de un pillar de DojoOS, justificando cada veredicto contra el sub-spike PIBER+IDCF. Accepts pillar-slug como $ARGUMENTS.
argument-hint: "<pillar-slug> [--framework <name>] [--no-audit] [--target <description|labels|both>] [--dry-run] [--out <path>]"
priority: 85
---
```

`priority: 85` entre `pending-left` (80) y `implement` (100). No compite con `implement` porque el usuario normalmente corre `prioritize` antes para elegir que implementar.

### Description de la skill (frontmatter)

```yaml
---
name: prioritize
description: >
  Applies MoSCoW (bucket) + RICE-adapted (intra-bucket ranking) to Linear issues of a DojoOS pillar,
  traceable to its PIBER+IDCF sub-spike and the latest vision audit. Use when the user asks to
  "prioritize issues", "aplicar MoSCoW", "rank the backlog", "RICE scoring", "priorizar el pillar",
  "/prioritize", or wants a data-backed decision on what to work on next within a pillar.
  Do NOT trigger for: generic backlog ranking without pillar context (use spike-recommend or
  implement-advisor instead), issue creation, or PR review.
---
```

---

## Error handling + edge cases

| Escenario | Comportamiento |
|-----------|----------------|
| Spike sin IDCF (solo PIBER) | Fallback a MoSCoW puro sin mapping por thesis. Warn en executive summary. |
| Audit inexistente | Continuar con Confidence=0.8 default. Warn: "no audit found -- consider running `/business-model-toolkit:product-vision-audit <pillar>` first". |
| `linear-setup.json` sin pillar | Modo interactivo: pedir project + spike + codebase. Ofrecer guardar con `yes/no`. |
| Issue sin Size label | Default Size=M (4). Flag `low-confidence-estimate` on. |
| Labels MoSCoW no existen + `--target=labels` | Exit 1 con mensaje: "Labels `moscow/must|should|could|wont` no existen en el workspace. Pedir a admin crearlas. Mientras tanto usa `--target=description` (default)." |
| Description tiene otros delimiters (PR #167) | Ignorar. Solo tocar `<!-- dojo:prioritize:start/end -->`. |
| `--dry-run` + mutations | No ejecutar mutations. Report titulo = "Proposed mutations (dry-run, not applied)". |
| Linear MCP no disponible | Exit 1 con mensaje: "linear-server MCP requerido. Configurar con `claude mcp add ...`". |
| Issue XL-sized | Incluir en bucket asignado + flag `DECOMPOSE REQUIRED` + sugerencia de invocar `/make-no-mistakes:spike-recommend <issue>`. |
| Issues > 100 en el project | Paginar el fetch. Si > 200, sugerir `--issue-ids` con subset o filtrar issues cerrados. |
| Sub-spike no devuelve IDCF parseable (XML/markdown mixto) | Best-effort parsing. Issues mal-mapeados terminan en UNCLASSIFIED. Appendix A del report lista parsing warnings. |

---

## Testing + verificacion

**v1 strategy: dogfooding sequencial**.

1. **Run 1 -- `pathways`**: vision audit existe (DEBIL), project existe, 47 issues estimados. Expected: ~10-15 Musts (incluyendo los 5 recommendations del audit), ~15 Shoulds, Coulds/Wonts variados, 0-3 Unclassified.
2. **Run 2 -- `agent-doji`**: vision audit existe (PARCIAL), plugin separado como codebase. Expected: ~8-12 Musts (features P0 missing), balance hacia Should-Could por Q3/Q4 features futuros.
3. **Validacion humana**: PO del pillar (Andres para ambos) revisa el report y marca "yes/no/edit" en cada Must. Si >80% de los Musts son aceptados sin edit, v1 shipped.

**No unit tests en v1**. Se agregan cuando:
- Se implementa segundo framework (`rice`, `ice`, etc.) -- entonces test de regresion del scoring.
- La rule table de MoSCoW crece >10 reglas -- entonces tests por regla.

**Validacion pre-merge**:
- `bun run typecheck` (si el plugin usa TS).
- Dry-run con `pathways` sin errores.
- Report parsea como markdown valido.
- Sub-spike comment se crea sin corromper el cuerpo del spike.

---

## Out of scope (explicitamente diferido a v2+)

- Frameworks adicionales (`rice|moscow|ice|wsjf|kano|value-effort|opportunity-scoring`). Stubs reservados.
- Labels en Linear (`moscow/must|should|could|wont`). Pendiente de aprobacion de admin (JC).
- `prioritize-advisor` skill (auto-trigger por natural language). YAGNI -- el comando se invoca explicitamente.
- Multi-pillar en una corrida (`/prioritize pathways agent-doji community`). Posible v2 si el uso lo justifica.
- Auto-actualizacion de `linear-setup.json` con pillars detectados (hoy interactivo manual).
- Integracion con `/implement`: el comando actual solo prioriza, no invoca implement. v2 podria ofrecer "queres implementar el top-3 Must con `/implement`?" al final.
- Comparacion cross-pillar (ver que pillar esta peor alineado). Requiere multi-run, posible `/prioritize --all` en v2.
- Historia agregada (trendline de alignment a lo largo del tiempo). Requiere parsear N priority-*.md antiguos. v2+.

---

## Dependencias externas

| Dep | Requerido? | Notas |
|-----|------------|-------|
| `mcp__linear-server` | Si | Para fetch issues, fetch spike, write comment, update description. |
| `audits/<pillar>/vision-audit-*.md` | No (enriquece si existe) | Output de `/business-model-toolkit:product-vision-audit`. |
| `linear-setup.json` | Si (o modo interactivo) | Resuelve pillar -> project/spike/codebase. |
| `Agent` tool (subagents) | Si | Paralelizar fetches del Paso A. |
| `Grep` / `Glob` / `Read` | Si | Load audit + parse spike cuando sale como file. |

---

## Action items post-spec (no bloqueantes para v1)

- [ ] Pedir a Juan Carlos aprobacion para crear labels `moscow/must|should|could|wont` en Linear workspace dojo-coding (mensaje en Slack #C08FZTCT1BN, combinable con el tracking del spec). Cuando apruebe, v1.1 flip `--target=labels` a funcional.
- [ ] Documentar en README del toolkit el comando nuevo + ejemplo dogfooded.
- [ ] Considerar agregar entrada en `make-no-mistakes-toolkit/README.md` comparando `/prioritize` vs `/spike-recommend` vs `/implement` (todos consumen Linear pero con scope distinto).

---

*Spec generado en brainstorming session 2026-04-21 con Claude Opus 4.7. Pending spec review + implementation plan.*

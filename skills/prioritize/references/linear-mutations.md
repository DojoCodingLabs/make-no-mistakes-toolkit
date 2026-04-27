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

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

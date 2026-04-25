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

```
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

{
  "bucket": "SHOULD",
  "confidence": 0.75,
  "rationale": "Matches capability 'Peer-verification framework' marked Build in spike. Audit status is PARTIAL. SHOULD because no killshot thesis affected."
}

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
```

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

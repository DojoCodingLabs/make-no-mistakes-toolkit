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

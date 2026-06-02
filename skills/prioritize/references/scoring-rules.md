# MoSCoW Scoring Rules -- deterministic bucket assignment

Tabla deterministica que mapea un issue a su MoSCoW bucket aplicando reglas en
orden. **La primera regla que matchea gana**.

Las reglas se dividen en dos familias:

- **Evidence-driven rules** (fire only when `--evidence` was provided — a
  Linear issue ID, e.g. a PIBER+IDCF sub-spike, OR a local markdown doc). Cite
  thesis / feature / capability / anti-pattern from the anchor.
- **Label-driven rules** (always fire — anchor-independent). Cite labels,
  Size, priority, and phase locks.

An issue matches an evidence-driven rule when:
- Its `title` or `description` contains keywords from the anchor target
  (thesis/feature/capability/antipattern), OR
- A label on the issue explicitly cites the target (e.g. `thesis/D1`,
  `feature/P0`).

An issue matches a label-driven rule when the declared condition holds (Size
label, literal label, lock file in the codebase, etc.). These rules do not
require an anchor.

**Workspace-agnostic mode**: when `--evidence` is NOT provided, all
evidence-driven rules are skipped automatically. The issue falls through to
label-driven rules; if those also don't match, it lands in UNCLASSIFIED → LLM
fallback. The final report notes the absence of an anchor in the executive
summary.

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

Each rule in order. MUST-1 through MUST-4 are **evidence-driven** (skipped when
no `--evidence` was provided). MUST-5 is **label-driven** (always fires).

### MUST-1: killshot-thesis-match (evidence-driven)

- Condition: issue mentions thesis #N, AND the anchor declares thesis #N with
  ⚠️ (killshot).
- Additional: audit status of the thesis != "OK" (i.e., pending work).
- Match: cite `thesis_id`, `killshot: true`, `audit_status`.
- `matched_rules: ["must/killshot-thesis-match"]`

### MUST-2: anti-pattern-violation (evidence-driven)

- Condition: issue describes resolving an anti-pattern from the anchor, AND
  audit detected VIOLATION.
- Match: cite `antipattern_name`, `audit_status: "VIOLATION"`.
- `matched_rules: ["must/anti-pattern-violation"]`

### MUST-3: north-star-instrumentation (evidence-driven)

- Condition: issue implements instrumentation of the North Star metric from the
  anchor, AND audit status is MISSING.
- Match: cite `north_star_metric`.
- `matched_rules: ["must/north-star-instrumentation"]`

### MUST-4: feature-p0-missing-or-partial (evidence-driven)

- Condition: issue implements a Feature P0 from the anchor, AND audit status
  != "SHIPPED" (or there is no audit).
- Match: cite `feature_name`, `feature_tier: "P0"`, `audit_status`.
- `matched_rules: ["must/feature-p0-missing-or-partial"]`

### MUST-5: explicit-must-label (label-driven)

- Condition: issue carries an explicit MoSCoW Must label
  (`moscow/must`, `priority/must`, `MoSCoW: Must`, or the emoji-prefixed
  equivalent if the workspace uses one).
- Match: cite the literal label string.
- `matched_rules: ["must/explicit-must-label"]`

---

## SHOULD (soft theses + P1 + build-capability)

SHOULD-1 through SHOULD-3 are **evidence-driven**. SHOULD-4 is
**label-driven**.

### SHOULD-1: soft-thesis-match (evidence-driven)

- Condition: issue advances a Design Thesis NOT marked with ⚠️, AND audit
  status != "OK".
- Match: cite `thesis_id`, `killshot: false`.
- `matched_rules: ["should/soft-thesis-match"]`

### SHOULD-2: feature-p1-missing-or-partial (evidence-driven)

- Condition: issue implements a Feature P1 from the anchor, AND audit status
  != "SHIPPED".
- `matched_rules: ["should/feature-p1-missing-or-partial"]`

### SHOULD-3: build-capability-missing (evidence-driven)

- Condition: issue covers a Capability marked `Build` in the anchor with audit
  status MISSING or PARTIAL.
- Match: cite `capability_name`.
- `matched_rules: ["should/build-capability-missing"]`

### SHOULD-4: explicit-should-label (label-driven)

- Condition: issue carries an explicit MoSCoW Should label
  (`moscow/should`, `priority/should`, etc.).
- Match: cite the literal label string.
- `matched_rules: ["should/explicit-should-label"]`

---

## COULD (P2 + buy-partner + UX)

COULD-1 and COULD-2 are **evidence-driven**. COULD-3 and COULD-4 are
**label-driven**.

### COULD-1: feature-p2 (evidence-driven)

- Condition: issue implements a Feature P2 from the anchor.
- `matched_rules: ["could/feature-p2"]`

### COULD-2: buy-partner-capability (evidence-driven)

- Condition: issue covers a Capability marked `Buy` or `Partner` (not
  `Build`).
- `matched_rules: ["could/buy-partner-capability"]`

### COULD-3: ux-improvement-no-anchor-match (label-driven)

- Condition: `issue.labels` contains `ux`, `perf`, or `improvement`, AND no
  evidence-driven rule matched (or no evidence provided).
- `matched_rules: ["could/ux-improvement-no-anchor-match"]`

### COULD-4: explicit-could-label (label-driven)

- Condition: issue carries an explicit MoSCoW Could label
  (`moscow/could`, `priority/could`, etc.).
- Match: cite the literal label string.
- `matched_rules: ["could/explicit-could-label"]`

---

## WONT (P3 + out-of-scope + phase-conflict)

WONT-1 and WONT-2 are **evidence-driven**. WONT-3 and WONT-4 are
**label-driven**.

### WONT-1: feature-p3 (evidence-driven)

- Condition: issue implements a Feature P3 from the anchor.
- `matched_rules: ["wont/feature-p3"]`

### WONT-2: out-of-scope-explicit (evidence-driven)

- Condition: anchor has an `Out of scope` section and the issue lands there by
  title/description.
- `matched_rules: ["wont/out-of-scope-explicit"]`

### WONT-3: phase-conflict (label-driven)

- Condition: the codebase has a phase-lock (e.g. `.claude/ship-gate.lock`,
  `.claude/design-freeze.lock`), AND the issue is a new Feature (not Bug, not
  Chore).
- Match: cite the lock file and (when available) the anchor reason.
- `matched_rules: ["wont/phase-conflict"]`

### WONT-4: explicit-wont-label (label-driven)

- Condition: issue carries an explicit MoSCoW Won't label
  (`moscow/wont`, `priority/wont`, etc.).
- Match: cite the literal label string.
- `matched_rules: ["wont/explicit-wont-label"]`

---

## UNCLASSIFIED (fallback)

Ninguna regla anterior matcheo. Proceder con LLM fallback via `references/prompts/llm-fallback-bucket.md`.

Si el LLM retorna confidence < 0.6 -> mantener UNCLASSIFIED en el output.
Si >= 0.6 -> asignar el bucket sugerido + anotar `matched_rules: ["llm-fallback"]` + `llm_rationale: <quote>`.

---

## Keyword detection heuristics

These heuristics only apply when an `--evidence` anchor was provided. In
workspace-agnostic runs without an anchor, keyword detection is skipped and the
rule engine relies on label-driven rules + the LLM fallback.

When the issue does NOT carry explicit labels (e.g. `thesis/D1`), search for
anchor keywords:

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

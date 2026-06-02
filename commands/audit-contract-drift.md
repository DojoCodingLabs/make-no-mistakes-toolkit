---
description: >
  Audit a repo for consumer-driven contract drift — a producer (Edge Function /
  server) and a consumer (frontend) validating the same payload with separate
  schemas that have silently diverged (the FE↔EF validation-drift pattern).
  Emits a findings doc, an OpenSpec remediation change, Bilingual Linear issues,
  and 4-cure scaffold proposals. Accepts a target path as $ARGUMENTS.
---

# /audit-contract-drift

Trigger the **`audit-engine`** skill with the `contract-drift` (`CDC`) detector
profile (`references/detectors/contract-drift.md`) against $ARGUMENTS (default:
the current repo).

The engine owns the full flow (preflight → scope → detect → verify → cure-map →
emit). Deterministic verification uses `diffValidationSchemas` from
`src/audit/verifiers/contract-drift.ts` — it parses the producer and consumer
validation schemas for the same payload into field→type maps and reports every
diverged field (missing on either side, or a type mismatch).

## Usage

```
/audit-contract-drift [path]
```

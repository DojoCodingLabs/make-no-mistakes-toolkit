---
description: >
  Audit a repo for Explicit Architecture violations (Herberto Graça) — the
  Hexagonal / Onion / Clean dependency rule (source dependencies must point
  inward, toward the domain), Hexagonal ports & adapters (missing port
  interfaces, primary vs secondary adapter misplacement), Onion/Clean layer
  leakage, and CQRS command/query mixing. Emits a findings doc, an OpenSpec
  remediation change, Bilingual Linear issues, and cure scaffold proposals.
  Accepts a target path as $ARGUMENTS.
---

# /audit-explicit-architecture

Trigger the **`audit-engine`** skill with the `explicit-architecture` (`ARC`)
detector profile (`references/detectors/explicit-architecture.md`) against
$ARGUMENTS (default: the current repo).

The engine owns the full flow (preflight → scope → detect → verify → cure-map →
emit). Deterministic verification uses `findDependencyRuleViolations` from
`src/audit/verifiers/explicit-architecture.ts` — it classifies each file and its
imports into a layer (`domain`/`application`/`infrastructure`/`ui`|`presentation`
by folder convention), builds `LayeredFile[]`, ranks the layers (`domain` 0 …
`ui` 3), and reports every import that points OUTWARD (target rank higher than
the file's). The ports & adapters, layer-leakage, and CQRS signals have no
deterministic check — they are carried as LLM-side `probable` findings.

This family audits **layered dependency direction *within* a context** — does
each source dependency point inward toward the domain — not bounded-context
crossings (which context a module belongs to and whether an import crosses that
seam), which is the separate `DDD` family.

## Usage

```
/audit-explicit-architecture [path]
```

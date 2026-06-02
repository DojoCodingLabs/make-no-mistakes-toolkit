---
description: >
  Audit a repo for DDD bounded-context boundary leakage — a module owned by one
  context importing another context's internals instead of going through a
  shared/published interface (Conway's-Law drift), plus domain purity at the
  context seam and ubiquitous-language drift. Emits a findings doc, an OpenSpec
  remediation change, Bilingual Linear issues, and 4-cure scaffold proposals.
  Accepts a target path as $ARGUMENTS.
---

# /audit-ddd

Trigger the **`audit-engine`** skill with the `ddd-boundaries` (`DDD`) detector
profile (`references/detectors/ddd-boundaries.md`) against $ARGUMENTS (default:
the current repo).

The engine owns the full flow (preflight → scope → detect → verify → cure-map →
emit). Deterministic verification uses `findCrossContextImports` from
`src/audit/verifiers/ddd-boundaries.ts` — it assembles the import graph
(`SourceFile[]`) and an ownership map (`OwnershipRule[]`, from CODEOWNERS / an
explicit map / folder layout), resolves each path to its owning context by the
longest matching prefix, and reports every import that crosses a context seam
(skipping shared/published contexts and unowned paths).

This family audits **context crossings only** — *which context a module belongs
to and whether an import crosses that seam* — not layered dependency direction
(domain→infra), which is the separate `ARC` family.

## Usage

```
/audit-ddd [path]
```

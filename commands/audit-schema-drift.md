---
description: >
  Audit a repo for schema drift — 1NF violations, the same logical column
  duplicated across tables without a single source of truth (the *_bio-in-5-tables
  pattern), and tables written by multiple owners with no canonical owner.
  Emits a findings doc, an OpenSpec remediation change, Bilingual Linear issues,
  and 4-cure scaffold proposals. Accepts a target path as $ARGUMENTS.
---

# /audit-schema-drift

Trigger the **`audit-engine`** skill with the `schema-drift` (`SCH`) detector
profile (`references/detectors/schema-drift.md`) against $ARGUMENTS (default: the
current repo).

The engine owns the full flow (preflight → scope → detect → verify → cure-map →
emit). Deterministic verification uses `findDuplicatedColumns` from
`src/audit/verifiers/schema-drift.ts`.

## Usage

```
/audit-schema-drift [path]
```

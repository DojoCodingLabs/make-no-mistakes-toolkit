---
description: >
  Run the full repo-health sweep in one shot — all six audit-engine families
  (schema-drift, contract-drift, ddd, explicit-architecture, strangler,
  enforcement-hooks) — and delegate the COMPONENT layer to `atomic-design-toolkit`'s
  audit when it is installed. Aggregates every family into one cross-family report
  and emits 4-cure scaffold proposals against
  `schemas/repo-health-rules.schema.json`. The meta-dispatcher front door to the
  whole audit family. Accepts a target path as $ARGUMENTS.
---

# /audit

Run the **complete repo-health sweep**. This is the meta-dispatcher: it triggers
the **`audit-engine`** skill once per family, in dependency order —

```
SCH → CDC → DDD → ARC → STR → ENF
```

(data foundation → data contracts → context boundaries → internal layering →
migration health → enforcement coverage **last**, since `ENF` checks whether the
cures the other five recommend are actually installed).

Each family runs the engine's full flow (preflight → scope → detect → verify →
cure-map → emit) with its own detector profile under `references/detectors/`.
Findings never collide because the report contract namespaces every finding-ID
(`SCH-### … ENF-###`).

## Component layer — cross-plugin delegation (composition, not fusion)

The six families above are MNM's architecture/process layers. The **component
layer** (atomic-design: atoms/molecules/organisms, `E###` findings) stays owned
by **`atomic-design-toolkit`**. If that plugin is installed, `/audit` delegates
the component sweep to its `audit` skill and folds the result into the same
roll-up. This is **composition** — `/audit` calls the other plugin; it does not
absorb it. If `atomic-design-toolkit` is absent, `/audit` notes the component
layer was skipped and continues.

## Output

One aggregated cross-family report (findings rolled up by severity across all
families, plus the delegated component findings), and — per confirmed finding
whose `cure_map` includes `hook` — a **cure-scaffold proposal** shaped against
`schemas/repo-health-rules.schema.json` (the unified `.repo-health-rules.json`
contract: `families` keyed by namespace, each rule
`{ id, pattern, message, severity, exemptionMarker }`).

Proposals are **proposed, not applied** in this slice: `/audit` emits the rule
objects; writing them into a repo's `.repo-health-rules.json` and installing the
live PreToolUse/PostToolUse hooks is the Phase-2-later apply step. v1 =
*propose*; Phase-2-later = *apply* (gated on human consent).

## Usage

```
/audit [path]
```

Runs against `$ARGUMENTS` (default: the current repo).

---
description: >
  Audit a monolith → microservices migration's health (Strangler Fig — Fowler /
  microservices.io) — whether a façade/proxy/gateway/sidecar fronts the legacy
  system, whether old and new paths coexist behind a router for a safe
  incremental cutover (vs a big-bang rewrite), how far the route migration has
  progressed, and whether there is a plan to retire the strangled legacy code.
  Emits a findings doc, an OpenSpec remediation change, Bilingual Linear issues,
  and cure scaffold proposals. Accepts a target path as $ARGUMENTS.
---

# /audit-strangler

Trigger the **`audit-engine`** skill with the `strangler-fig` (`STR`) detector
profile (`references/detectors/strangler-fig.md`) against $ARGUMENTS (default:
the current repo).

The engine owns the full flow (preflight → scope → detect → verify → cure-map →
emit). Deterministic verification uses `assessStranglerHealth` from
`src/audit/verifiers/strangler-fig.ts` — it takes the `StranglerSignals`
assembled from Stage 2 (does a façade front the legacy system; do old and new
paths coexist behind a router; how many of the total routes are migrated; is
there a retirement plan; what big-bang indicators were observed) and returns one
finding per rule that holds (`no-facade`, `big-bang-risk`, `no-coexistence`,
`no-retirement-plan`), sorted by `code` — so the result is deterministic and
diffable.

This family audits the **health of a monolith → microservices migration** —
façade, incremental cutover vs big-bang, coexistence of old + new, and legacy
retirement. It is especially relevant to modular-monolith → microservices work
(e.g. a Serverpod backend with sidecar services). It does **not** audit the
internal layering of any one service (that is `ARC`) or bounded-context
crossings (that is `DDD`).

## Usage

```
/audit-strangler [path]
```

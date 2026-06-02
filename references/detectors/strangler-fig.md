# Detector Profile — `STR` (Strangler Fig)

This is the **`STR`** detector profile for the `audit-engine` skill. The engine
loads it during Stage 2 (detect) and Stage 3 (verify). It defines the
anti-pattern, the LLM detection prompt, the deterministic verify recipe, default
severity, and the `cure_map` template. Field definitions, finding-ID rules, and
the severity ladder come from the contract:
[`references/audit-report-schema.md`](../audit-report-schema.md).

> **Scope (STR).** This family audits the **health of a monolith →
> microservices migration**: whether new functionality is routed behind a façade
> and cut over incrementally, or whether the team is mid–big-bang rewrite. It is
> especially relevant to **modular-monolith → microservices** work — e.g. a
> Serverpod backend with sidecar services being peeled off one capability at a
> time. It does **not** audit the internal layering of any one service (that is
> `ARC`) or bounded-context crossings (that is `DDD`).

---

## Anti-pattern

The **Strangler Fig** pattern (Martin Fowler, 2004;
[microservices.io/patterns/refactoring/strangler-application](https://microservices.io/patterns/refactoring/strangler-application))
incrementally replaces a legacy system by **routing functionality to new
services behind a façade**, gradually "strangling" the monolith — named for the
fig vine that grows around a host tree until the original is gone. The new and
old implementations **coexist** behind that façade while routes are cut over one
at a time, so each step is small, reversible, and shippable.

The **anti-pattern** is the **big-bang rewrite**: pausing delivery to rebuild the
system from scratch and swap it in all at once. Its smells:

- **No façade / seam.** There is no reverse-proxy, API gateway, or sidecar in
  front of the legacy system, so new code cannot be routed in incrementally —
  callers bind directly to old or new with no single point of interception.
- **No coexistence.** Old and new paths do not run side by side behind a router
  (no dual-path, dual-write, or feature-flag cutover), so there is no safe
  incremental rollout and no cheap rollback — a cutover is all-or-nothing.
- **Big-bang indicators.** A single giant cutover PR, a long-lived
  "rewrite-from-scratch" branch, or the absence of any incremental migration
  path — the team is rebuilding wholesale rather than strangling.
- **No retirement plan.** Routes get migrated but the strangled legacy code is
  never scheduled for removal, leaving two systems to maintain indefinitely
  (a "stranglehold that never finishes").

The canonical smell is **migration without a façade**: there is no seam through
which old and new can coexist, so the only way forward becomes a big-bang
rewrite — the very outcome the pattern exists to prevent.

---

## Stage 2 — LLM detection prompt

Run this prompt against the repo (and its deployment/proxy config, branch and PR
history, and migration docs):

> You are auditing a codebase for Strangler-Fig migration health — is a monolith
> being incrementally replaced by new services behind a façade, or is the team
> mid–big-bang rewrite?
>
> 1. **Identify the legacy monolith and the new services.** Name the legacy
>    system (the host being strangled) and each new service/module taking over a
>    capability. Anchor each to a `file:line` (entrypoint, route table, service
>    manifest).
> 2. **Determine whether a façade fronts them.** Look for a reverse-proxy, API
>    gateway, sidecar, or routing layer that intercepts requests and dispatches
>    to old vs new (e.g. proxy config, gateway routes, ingress rules). Record
>    `hasFacade` with its `file:line`.
> 3. **Determine whether old and new coexist behind a router.** Look for a
>    dual-path / dual-write / feature-flag cutover where a request can hit the
>    legacy or the new path under a routing decision. Record `hasDualPath`.
> 4. **Estimate `routesMigrated` / `routesTotal`.** Count the routes /
>    capabilities already cut over to new services vs the total in scope to
>    migrate, from the route table or façade config.
> 5. **Detect big-bang indicators.** Flag a single giant cutover PR, a
>    long-lived "rewrite-from-scratch" branch, or the absence of any incremental
>    path. List each as a short string in `bigBangIndicators` with a `file:line`
>    or PR/branch anchor.
> 6. **Determine whether there is a retirement plan.** Look for a documented plan
>    (ADR, migration doc, tracked issues) to retire the strangled legacy code
>    once routes are migrated. Record `hasRetirementPlan`.
>
> For every observation, emit a `file:line` (or PR/branch) evidence anchor. An
> observation without an anchor is invalid — drop it.

Output: a `StranglerSignals` object (`hasFacade`, `routesMigrated`,
`routesTotal`, `hasDualPath`, `hasRetirementPlan`, `bigBangIndicators`) plus the
anchors backing each field, ready for the deterministic verify in Stage 3.

---

## Stage 3 — Deterministic verify recipe

`STR` has a deterministic check that turns the assembled signals into findings.
Run it; do **not** fall back to a refutation agent unless the signals can't be
assembled (e.g. the proxy/routing config is generated at deploy time and not
inspectable).

1. **Assemble `StranglerSignals`** from the Stage 2 observations: set
   `hasFacade`, `hasDualPath`, `hasRetirementPlan` from what was found,
   `routesMigrated` / `routesTotal` from the route count, and
   `bigBangIndicators` from the flagged big-bang signals.
2. **Call the verifier:**
   ```ts
   import { assessStranglerHealth } from "../../src/audit/verifiers/strangler-fig";

   const findings = assessStranglerHealth(signals);
   // -> [{ code: "no-facade", message: "No façade/proxy in front of the legacy system — ..." }, ...]
   ```
   The verifier applies the rules below and returns one finding per condition
   that holds, sorted by `code` — so its output is deterministic and diffable:
   - `!hasFacade` → `no-facade`
   - `bigBangIndicators.length > 0` → `big-bang-risk`
   - `routesMigrated > 0 && routesMigrated < routesTotal && !hasDualPath` →
     `no-coexistence`
   - `routesMigrated > 0 && !hasRetirementPlan` → `no-retirement-plan`
   - a fully-healthy migration (façade, dual path, retirement plan, no big-bang
     indicators) → `[]`.
3. **Reconcile** the verifier findings with the Stage 2 observations: each
   finding must carry the anchor of the signal that produced it (the missing
   façade config, the big-bang PR/branch, the route table showing partial
   migration, the absent retirement doc). Drop any finding whose backing
   observation has no anchor.
4. **Stamp `confidence`:** `confirmed` when `assessStranglerHealth` returns the
   finding AND its backing observation resolves to an anchor; `probable` when a
   signal is only partially observable (e.g. routes are routed dynamically and
   the count is estimated); never emit `unverified` findings.

Log any coverage cap (e.g. *"counted 14 of an estimated 22 routes from the
gateway config; the remaining 8 are mounted dynamically"*). Never truncate
silently.

---

## Default severity

| Condition                                                                  | Severity |
| -------------------------------------------------------------------------- | -------- |
| `no-facade` — no seam through which old and new can coexist                | `high`   |
| `big-bang-risk` — big-bang rewrite indicators present                      | `high`   |
| `no-coexistence` — migration in progress with no dual path behind a router | `medium` |
| `no-retirement-plan` — routes migrated with no plan to retire the legacy   | `medium` |

`no-facade` and `big-bang-risk` are `high` because each removes the safety the
pattern exists to provide: without a façade there is no incremental seam, and a
big-bang rewrite reintroduces the all-or-nothing cutover risk the Strangler Fig
is meant to eliminate. `no-coexistence` and `no-retirement-plan` are `medium` —
the migration can still proceed but is not safely incremental, or never
finishes. Governance owns promotion up the ladder from there (see the contract's
severity section).

---

## `cure_map` template

| Cure         | Why                                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_rule` | A repo rule that requires new functionality to be added behind the façade and routed incrementally (dual-path / feature-flag cutover), never as a wholesale rewrite, and that every migrated route carry a retirement step for the legacy code it replaces. |
| `ownership`  | Make the migration map explicit — a tracked inventory of `route → owner → status (legacy / dual-path / migrated / retired)` — so coexistence and retirement are owned, not implicit. |

Start every `STR` finding's `cure_map` from `["agent_rule", "ownership"]`. The
pairing names the **incremental-cutover rule** (façade + coexistence, no
big-bang) plus an **owned migration map** that tracks each route from legacy
through dual-path to retired. Generate scaffold-proposal text for each (the agent
rule, the route-status inventory) in Stage 4 — proposals only, never
auto-applied in v1.

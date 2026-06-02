# Detector Profile — `ARC` (Explicit Architecture)

This is the **`ARC`** detector profile for the `audit-engine` skill. The engine
loads it during Stage 2 (detect) and Stage 3 (verify). It defines the
anti-pattern, the LLM detection prompt, the deterministic verify recipe, default
severity, and the `cure_map` template. Field definitions, finding-ID rules, and
the severity ladder come from the contract:
[`references/audit-report-schema.md`](../audit-report-schema.md).

> **Scope (ARC vs DDD).** This profile audits **layered dependency direction
> *within* a context** — does each source dependency point INWARD (toward the
> domain). It does **not** audit bounded-context crossings (which context a
> module belongs to and whether an import crosses that seam); that is the
> separate `DDD` family. Keep `ARC` findings about **layer direction**, never
> about context crossings.

---

## Anti-pattern

**Explicit Architecture (Herberto Graça, 2017)** is the synthesis of three
overlapping styles — **Hexagonal (ports & adapters)**, **Onion**, and **Clean**
architecture — plus **CQRS**. Its deterministic core is the **dependency rule**:
source dependencies must point **inward**, toward the most stable, most abstract
code. Layers ranked from innermost to outermost: `domain` (0), `application`
(1), `infrastructure` (2), `ui`/`presentation` (3). A file may depend on its own
or any inner layer, never an outer one.

- **Dependency rule (the deterministic signal).** A file at rank R may import a
  target at rank ≤ R. Importing a target at a HIGHER rank points OUTWARD and is
  a violation — e.g. `domain` importing `infrastructure`/`application`/`ui`, or
  `application` importing `infrastructure`/`ui`. The canonical breach is
  **`domain` reaching into `infrastructure`** (a database client, an HTTP SDK)
  directly instead of depending on an abstraction the outer layer implements.
- **Hexagonal — ports & adapters.** The application core defines **ports**
  (interfaces) for everything external; **adapters** implement them on the
  outside. Two smells: a **missing port interface** for an external dependency
  (the core imports a concrete adapter/SDK instead of an abstraction it owns),
  and **primary vs secondary adapter misplacement** — a driving (primary)
  adapter (controller, CLI) sitting where a driven (secondary) adapter
  (repository, gateway) belongs, or vice versa.
- **Onion / Clean — layer leakage.** Concentric layers with the same inward
  rule; leakage is an inner layer knowing about an outer one (domain entity
  importing a framework type, application service importing a UI view-model).
- **CQRS — command/query mixing.** A single handler or model that both mutates
  state (command) and returns read-side projections (query), instead of
  separating the write model from the read model.

The canonical smell is the **`domain`-imports-`infrastructure`** pattern: the
innermost, framework-free layer binds directly to a concrete outer-layer
dependency, so the core can no longer be tested, reasoned about, or re-targeted
independently of its infrastructure.

---

## Stage 2 — LLM detection prompt

Run this prompt against the repo's layered import graph:

> You are auditing a codebase for Explicit Architecture violations — Hexagonal
> (ports & adapters), Onion, and Clean dependency-rule breaches, plus CQRS
> command/query mixing.
>
> 1. **Classify each file into a layer.** Use the folder convention: `domain/`
>    → `domain`, `application/` → `application`, `infrastructure/` →
>    `infrastructure`, `ui/` or `presentation/` → `ui`. Do the same for every
>    import it makes. Layer ranks: domain 0, application 1, infrastructure 2, ui
>    3.
> 2. **(a) Dependency-rule direction.** Flag every import whose target layer
>    rank is HIGHER than the importing file's rank — the dependency points
>    OUTWARD (e.g. domain → infrastructure, application → ui). This is the
>    deterministic signal verified in Stage 3.
> 3. **(b) Hexagonal ports & adapters.** Flag a **missing port** — the core
>    (`domain`/`application`) imports a concrete external dependency (DB client,
>    HTTP SDK, vendor library) directly rather than an interface it owns. Flag
>    **primary vs secondary adapter misplacement** — a driving adapter
>    (controller/CLI) where a driven adapter (repository/gateway) belongs, or
>    vice versa.
> 4. **(c) Onion / Clean layer leakage.** Flag an inner layer referencing an
>    outer-layer type/concept (framework type in a domain entity, view-model in
>    an application service) even where no direct import crosses a folder.
> 5. **(d) CQRS command/query mixing.** Flag a single handler or model that both
>    mutates state and returns a read-side projection, rather than separating
>    write and read models.
>
> For every candidate, emit a `file:line` evidence anchor on the offending
> import or declaration. A candidate without an anchor is invalid — drop it.

Output: candidate dependency-rule breaches (each with `{ file, line }`,
`fromLayer`, `toLayer`); plus ports/adapters, layer-leakage, and CQRS-mixing
candidates with their anchors. Signals (b), (c), (d) have no deterministic check
— they are LLM-side `probable` findings.

---

## Stage 3 — Deterministic verify recipe

`ARC` has a deterministic check for the **dependency-rule direction** dimension
only. Run it; do **not** fall back to a refutation agent unless the deterministic
check can't be applied (e.g. imports are built dynamically and can't be
statically resolved). The ports & adapters, layer-leakage, and CQRS signals have
**no deterministic check** — do not invent one; carry them at `probable`.

1. **Classify files and imports into layers.** For each module, assign a `Layer`
   by folder convention (`domain/` → `domain`, `application/` → `application`,
   `infrastructure/` → `infrastructure`, `ui/`|`presentation/` → `ui`); classify
   each of its imports the same way. Build `LayeredFile[]` (`{ path, layer,
   imports: [{ path, layer }] }`).
2. **Call the verifier:**
   ```ts
   import { findDependencyRuleViolations } from "../../src/audit/verifiers/explicit-architecture";

   const violations = findDependencyRuleViolations(files);
   // -> [{ file: "src/domain/order.ts", importPath: "src/infrastructure/db.ts",
   //       fromLayer: "domain", toLayer: "infrastructure" }, ...]
   ```
   The verifier ranks layers `{ domain: 0, application: 1, infrastructure: 2,
   ui: 3 }` and returns one violation per import whose target rank is HIGHER than
   the file's (an OUTWARD dependency), sorted by `file` then `importPath` — so
   its output is deterministic and diffable.
3. **Reconcile** the verifier output with the LLM candidate breaches from Stage
   2. Keep only direction breaches the verifier confirms; an empty `violations`
   array means every source dependency points inward — drop the candidate. The
   ports/adapters, layer-leakage, and CQRS findings have no deterministic check;
   carry them at `probable`.
4. **Classify each breach's severity input.** For each confirmed violation, note
   whether it is a `domain` → `infrastructure` breach (the deepest purity
   breach) or any other outward dependency — drives severity, below.
5. **Stamp `confidence`:** `confirmed` when `findDependencyRuleViolations`
   returns the breach AND the importing-statement anchor resolves; `probable`
   for a ports/adapters, layer-leakage, or CQRS finding, or when imports are only
   partially statically resolvable; never emit `unverified` findings.

Log any coverage cap (e.g. *"classified 180 of 205 files into a layer; 25 sit
outside the `domain/application/infrastructure/ui` convention"*). Never truncate
silently.

---

## Default severity

| Condition                                                                          | Severity |
| ---------------------------------------------------------------------------------- | -------- |
| A `domain` → `infrastructure` dependency (the innermost layer reaching outward)    | `high`   |
| Any other outward dependency / ports / layer-leakage / CQRS-mixing finding         | `medium` |

A `domain` → `infrastructure` breach is `high` because the framework-free core
now binds directly to a concrete outer dependency — the domain can no longer be
tested, reasoned about, or re-targeted independently of its infrastructure.
Governance owns promotion up the ladder from there (see the contract's severity
section).

---

## `cure_map` template

| Cure         | Why                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------- |
| `agent_rule` | A repo rule that forbids outward dependencies — an inner layer must depend only on its own or inner layers, reaching outward only through a port (interface) the inner layer owns and the outer layer implements. |
| `ci_guard`   | Add a CI check that classifies files into layers and calls `findDependencyRuleViolations`, failing the build on any new outward dependency. |
| `ownership`  | *(optional)* Make the layer map explicit (a `prefix → layer` map) where the folder convention is ambiguous, so each module has one unambiguous layer. |

Start every `ARC` finding's `cure_map` from `["agent_rule", "ci_guard"]`, adding
`ownership` only where the layer of some module is ambiguous and needs an
explicit map. The pairing is an **inward-only dependency rule** (so the
direction is named) plus a **lint/CI guard** that fails on outward dependencies.
Generate scaffold-proposal text for each (the agent rule, the CI layer-graph
script, the optional layer map) in Stage 4 — proposals only, never auto-applied
in v1.

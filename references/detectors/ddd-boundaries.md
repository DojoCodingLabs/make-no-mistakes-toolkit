# Detector Profile — `DDD` (Bounded-Context Boundaries)

This is the **`DDD`** detector profile for the `audit-engine` skill. The engine
loads it during Stage 2 (detect) and Stage 3 (verify). It defines the
anti-pattern, the LLM detection prompt, the deterministic verify recipe, default
severity, and the `cure_map` template. Field definitions, finding-ID rules, and
the severity ladder come from the contract:
[`references/audit-report-schema.md`](../audit-report-schema.md).

> **Scope (DDD vs ARC).** This profile audits **bounded-context boundary
> leakage** only — *which context a module belongs to and whether an import
> crosses that seam*. It does **not** audit layered dependency direction
> (domain→infra); that is the separate future `ARC` family. Keep `DDD` findings
> about **context crossings**, never about layers.

---

## Anti-pattern

**Bounded-context boundary leakage** = a module owned by one bounded context
imports the **internals** of another context directly, instead of going through
that context's shared/published interface. This is **Conway's-Law drift**: the
code's import graph stops matching the intended ownership map, and contexts grow
tendrils into each other's guts.

- **Bounded contexts (Evans, *Domain-Driven Design*).** A bounded context owns
  its model and exposes a deliberate published interface. Reaching past that
  interface into another context's internals couples two models that were meant
  to evolve independently — a change inside one context now silently breaks the
  other.
- **Conway's Law.** The system's structure mirrors the org's communication
  structure. When team A's module reaches into team B's internals, the import
  graph has drifted away from the ownership boundaries the org actually
  maintains — coordination cost the boundary was supposed to remove.
- **Cross-pillar import leakage.** The canonical smell: a `pathways/` module
  imports `hackathons/internal/...` directly rather than consuming a published
  `hackathons` facade. The seam is breached, and the two pillars can no longer
  be reasoned about — or deployed — separately.
- **Ubiquitous-language inconsistency.** A softer signal of the same drift: the
  same domain concept is named differently across contexts (`Enrollment` here,
  `Registration` there), revealing that one model has bled into another without
  a translating anti-corruption layer.

The canonical smell is the **`pathways`-imports-`hackathons/internal`** pattern:
a module owned by one context binds directly to another context's internals, so
the import graph no longer matches the ownership map and the two contexts are no
longer independently changeable.

---

## Stage 2 — LLM detection prompt

Run this prompt against the repo's import graph and ownership map:

> You are auditing a codebase for bounded-context boundary leakage — a module
> owned by one context importing another context's internals instead of going
> through its published interface.
>
> 1. **Build the import graph.** For each source module, list the modules it
>    imports (resolved to repo-relative paths where possible).
> 2. **Map each module to its owning context.** Use, in priority order:
>    CODEOWNERS, an explicit ownership map (`prefix → context`), then the folder
>    convention (top-level pillar directory). Record the owning context for both
>    every importing file and every imported path.
> 3. **Flag cross-context crossings.** An import is a candidate violation when
>    its owning context differs from the importing file's context AND the target
>    context is not a shared/published context (`platform` / `shared` /
>    `common`). Ignore imports into unowned paths (node_modules, relative
>    utilities) — only known context-to-context crossings count.
> 4. **Also flag ubiquitous-language inconsistency.** Where the same domain
>    concept is named differently across contexts (e.g. `Enrollment` vs
>    `Registration` for the same entity), note it as a softer boundary-drift
>    signal.
>
> For every candidate crossing, emit a `file:line` evidence anchor on the
> importing statement. A crossing without an anchor is invalid — drop it.

Output: candidate cross-context imports, each with `{ file, line }` evidence on
the importing statement, plus its `fromContext` and `toContext`; and any
ubiquitous-language inconsistencies found.

---

## Stage 3 — Deterministic verify recipe

`DDD` has a deterministic check for the import-crossing dimension. Run it; do
**not** fall back to a refutation agent unless the deterministic check can't be
applied (e.g. imports are built dynamically and can't be statically resolved).

1. **Assemble the inputs.**
   - Build `SourceFile[]` — one entry per module with its resolved import paths
     — from the import graph.
   - Build `OwnershipRule[]` (`{ prefix, context }`) from CODEOWNERS, the
     explicit ownership map, or the top-level folder layout. List shared
     contexts (defaults: `platform`, `shared`, `common`).
2. **Call the verifier:**
   ```ts
   import { findCrossContextImports } from "../../src/audit/verifiers/ddd-boundaries";

   const violations = findCrossContextImports(files, ownership, {
     sharedContexts: ["platform", "shared", "common"],
   });
   // -> [{ file: "src/pathways/enroll.ts", importPath: "src/hackathons/internal/judge.ts",
   //       fromContext: "pathways", toContext: "hackathons" }, ...]
   ```
   The verifier resolves each path's context by the LONGEST matching prefix,
   skips unowned paths and shared-context targets, and returns one violation per
   cross-context import, sorted by `file` then `importPath` — so its output is
   deterministic and diffable.
3. **Reconcile** the verifier output with the LLM candidate crossings from Stage
   2. Keep only crossings the verifier confirms; an empty `violations` array
   means the import graph respects the ownership map — drop the candidate. The
   ubiquitous-language findings have no deterministic check; carry them at lower
   confidence (`probable`).
4. **Classify each crossing's path.** For each confirmed violation, inspect
   whether the crossing sits on a core domain path and reaches into another
   context's *internals* (vs. a near-boundary helper) — drives severity, below.
5. **Stamp `confidence`:** `confirmed` when `findCrossContextImports` returns the
   crossing AND the importing-statement anchor resolves; `probable` for a
   ubiquitous-language inconsistency or when imports are only partially
   statically resolvable; never emit `unverified` findings.

Log any coverage cap (e.g. *"resolved 180 of 205 imports; 25 built via dynamic
`import()` the parser can't follow"*). Never truncate silently.

---

## Default severity

| Condition                                                                          | Severity |
| ---------------------------------------------------------------------------------- | -------- |
| A context reaches into another context's **internals** on a **core** domain path  | `high`   |
| Any other cross-context crossing (near-boundary helper, non-core path, UL drift)   | `medium` |

A context reaching into another's internals on a core path is `high` because the
two models are now coupled where they were meant to be independent — a change in
one silently breaks the other and the contexts can no longer be deployed or
reasoned about separately. Governance owns promotion up the ladder from there
(see the contract's severity section).

---

## `cure_map` template

| Cure         | Why                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------- |
| `ownership`  | Make the ownership map explicit (CODEOWNERS / a `prefix → context` map) so each module has one owning context and the seam is declared. |
| `agent_rule` | A repo rule that forbids importing another context's internals — cross-context access must go through that context's published interface (facade / anti-corruption layer). |
| `ci_guard`   | Add a CI check that rebuilds the import graph and calls `findCrossContextImports`, failing the build on any new cross-context crossing. |

Start every `DDD` finding's `cure_map` from `["ownership", "agent_rule",
"ci_guard"]` and narrow only if a cure clearly doesn't apply. The pairing is a
**declared ownership boundary** (so contexts are named) plus a **published
interface + lint/CI guard** that fails on internals-reaching imports. Generate
scaffold-proposal text for each (the ownership map / CODEOWNERS entry, the agent
rule, the CI import-graph script) in Stage 4 — proposals only, never
auto-applied in v1.

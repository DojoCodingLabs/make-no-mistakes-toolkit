# Detector Profile — `CDC` (Contract Drift)

This is the **`CDC`** detector profile for the `audit-engine` skill. The engine
loads it during Stage 2 (detect) and Stage 3 (verify). It defines the
anti-pattern, the LLM detection prompt, the deterministic verify recipe, default
severity, and the `cure_map` template. Field definitions, finding-ID rules, and
the severity ladder come from the contract:
[`references/audit-report-schema.md`](../audit-report-schema.md).

---

## Anti-pattern

**Contract drift** = a **producer** (e.g. an Edge Function / server) and a
**consumer** (e.g. the frontend) each validate the **same payload** with
**separate schemas** that have silently diverged. This is the **validation
contract drift FE↔EF** problem — the "24 latent validation drifts" smell, where
two copies of "the same" shape disagree about which fields exist and what type
each one is.

- **Consumer-Driven Contracts (CDC).** The contract between a producer and its
  consumers is a shared, verifiable artifact. When each side owns a private,
  hand-maintained copy of the schema, there is no contract — only two guesses
  that drift apart on every change.
- **DRY (Don't Repeat Yourself).** The same payload shape defined in two places
  (a Zod schema in the frontend, a Yup/JSON-schema/Dart model on the producer)
  means two places to keep in sync — and they drift.
- **No single source of truth.** Neither side is canonical, so a field added or
  retyped on one side is a latent runtime failure waiting on the other.

The canonical smell is the **FE-validates-`age:string`-while-EF-validates-`age:number`**
pattern: a producer schema and a consumer schema for the same payload disagree
on a field's presence or type, and nothing fails until the divergent value hits
the wire.

---

## Stage 2 — LLM detection prompt

Run this prompt against the discovered validation schemas (Zod / Yup /
JSON-schema / Dart models) on both sides of each payload:

> You are auditing a codebase for consumer-driven contract drift. The same
> payload is validated in two places — by a **producer** (Edge Function /
> server / API handler) and by a **consumer** (frontend / client / mobile).
>
> 1. **Locate the validation schemas.** Find every payload that is validated on
>    both sides: a Zod/Yup object, a JSON-schema, a Dart model `fromJson`, etc.
>    on the producer, and its counterpart on the consumer.
> 2. **Pair them by payload.** Match a producer schema to its consumer schema by
>    the endpoint / message / DTO they describe (route name, function name,
>    shared type name). Each pair is one candidate contract.
>
> For every pair, emit a `file:line` evidence anchor on BOTH the producer schema
> and the consumer schema. A pair missing either anchor is invalid — drop it.

Output: candidate contract pairs, each with `{ file, line }` evidence on both
the producer and the consumer side.

---

## Stage 3 — Deterministic verify recipe

`CDC` has a deterministic check. Run it; do **not** fall back to a refutation
agent unless the deterministic check can't be applied (e.g. one side's schema
isn't statically parseable).

1. **Parse each side into a `SchemaShape`.** Normalize the producer schema and
   the consumer schema each into a field-name → normalized-type map
   (`Record<string, string>`), e.g. `{ age: "number", email: "string" }`.
   Collapse language-specific types to a shared vocabulary (`int`/`double` →
   `number`, `String` → `string`, etc.) so both sides are comparable.
2. **Call the verifier:**
   ```ts
   import { diffValidationSchemas } from "../../src/audit/verifiers/contract-drift";

   const drifts = diffValidationSchemas(producer, consumer);
   // -> [{ field: "age", kind: "type_mismatch", producerType: "number", consumerType: "string" }, ...]
   ```
   The verifier returns one drift per diverged field — `missing_in_consumer`,
   `missing_in_producer`, or `type_mismatch` (with both types) — sorted by field
   name, so its output is deterministic and diffable.
3. **Reconcile** the verifier output with the LLM candidate pairs from Stage 2.
   Keep only pairs the verifier confirms drift on; an empty `drifts` array means
   the contract is in sync — drop it.
4. **Classify each drift's path.** For each confirmed drift, inspect the
   payload's route / handler to decide whether it sits on a security or payment
   path and whether the diverged field is required (drives severity, below).
5. **Stamp `confidence`:** `confirmed` when `diffValidationSchemas` returns the
   drift AND both evidence anchors resolve; `probable` when only one side parses
   cleanly; never emit `unverified` findings.

Log any coverage cap (e.g. *"paired 9 of 11 payloads; 2 producer schemas built
dynamically the parser can't read"*). Never truncate silently.

---

## Default severity

| Condition                                                                       | Severity |
| ------------------------------------------------------------------------------- | -------- |
| A required field's type diverges or is missing on a security / payment path     | `high`   |
| Any other diverged field (optional, or off the security/payment path)           | `medium` |

A required field that disagrees on a security or payment path is `high` because
the divergent copy is a correctness AND a money/auth hazard — the value that
passes one validator is silently rejected or mis-coerced by the other.
Governance owns promotion up the ladder from there (see the contract's severity
section).

---

## `cure_map` template

| Cure         | Why                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------- |
| `ci_guard`   | Add a CI check that diffs the producer and consumer schemas (via `diffValidationSchemas`) and fails the build on any drift. |
| `agent_rule` | A repo rule that forbids hand-maintaining a second copy of a validated payload — both sides must derive from one shared contract. |
| `ownership`  | (Optional) Assign a single owner for the shared contract so changes go through one canonical source. |

Start every `CDC` finding's `cure_map` from `["ci_guard", "agent_rule"]` (add
`ownership` when the payload has no canonical owner) and narrow only if a cure
clearly doesn't apply. The pairing of cures is a **shared contract** (one source
of truth both sides derive from) plus a **lint/CI check** that fails on drift.
Generate scaffold-proposal text for each (the shared-schema module, the CI diff
script, the agent rule) in Stage 4 — proposals only, never auto-applied in v1.

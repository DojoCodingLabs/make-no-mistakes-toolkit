# Detector Profile — `SCH` (Schema Drift)

This is the **`SCH`** detector profile for the `audit-engine` skill. The engine
loads it during Stage 2 (detect) and Stage 3 (verify). It defines the
anti-pattern, the LLM detection prompt, the deterministic verify recipe, default
severity, and the `cure_map` template. Field definitions, finding-ID rules, and
the severity ladder come from the contract:
[`references/audit-report-schema.md`](../audit-report-schema.md).

---

## Anti-pattern

**Schema drift** = the same logical attribute realized inconsistently across a
data model, with no single source of truth. Three citations apply:

- **1NF — First Normal Form (Codd 1970).** "A Relational Model of Data for Large
  Shared Data Banks." A logical attribute belongs in one place; scattering it
  across tables is a normalization failure.
- **DRY (Don't Repeat Yourself).** The same column defined and written in N
  places means N places to keep in sync — and they drift.
- **Multiple writers, no owner.** A table written by several teams / services
  with no single canonical owner has no one accountable for its shape, so drift
  compounds unchecked.

The canonical smell is the **`*_bio-in-5-tables`** pattern: a `bio` (or `email`,
`avatar_url`, …) column duplicated across `users`, `profiles`, `authors`,
`members`, `accounts`, each written by a different surface, with no single
source of truth.

---

## Stage 2 — LLM detection prompt

Run this prompt against the parsed schema (migrations, `CREATE TABLE` blocks,
`information_schema`) and the ownership map:

> You are auditing a database schema for drift. Read every table definition and
> the ownership / GRANT map.
>
> 1. **Duplicated logical columns.** Find columns that represent the **same
>    logical attribute** across **multiple tables** (e.g. `bio`, `email`,
>    `avatar_url`, `display_name`, `website_url` appearing in `users`,
>    `profiles`, `authors`, …). Ignore structural keys (`id`, `*_id`) and
>    bookkeeping timestamps (`created_at`, `updated_at`, `deleted_at`).
> 2. **Multiple writers, no canonical owner.** Find tables written by **multiple
>    owners / services** with **no single canonical owner** in CODEOWNERS or the
>    ownership map.
>
> For every candidate, emit a `file:line` evidence anchor pointing at the column
> or table definition. A candidate with no anchor is invalid — drop it.

Output: candidate findings, each with at least one `{ file, line }` evidence
object.

---

## Stage 3 — Deterministic verify recipe

`SCH` has a deterministic check. Run it; do **not** fall back to a refutation
agent unless the deterministic check can't be applied (e.g. no parseable SQL).

1. **Parse the schema.** Collect `CREATE TABLE` migrations or dump
   `information_schema.columns`. Concatenate the DDL into a single `sql` string.
2. **Call the verifier:**
   ```ts
   import { findDuplicatedColumns } from "../../src/audit/verifiers/schema-drift";

   const dupes = findDuplicatedColumns(sql, { minTables: 2 });
   // -> [{ column: "bio", tables: ["users", "profiles", "authors"] }, ...]
   ```
   The verifier already excludes the allowlist (`id`, `created_at`,
   `updated_at`, `deleted_at`) and any `*_id` column, so its output is the set
   of genuinely duplicated logical columns appearing in `>= minTables` tables.
3. **Reconcile** the verifier output with the LLM candidates from Stage 2. Keep
   only candidates the verifier confirms; drop the rest as unverified.
4. **Cross-check GRANT / owner.** For each confirmed duplicated column — and for
   each multi-writer table candidate — inspect `GRANT` statements / the
   ownership map to confirm there is no single canonical owner.
5. **Stamp `confidence`:** `confirmed` when `findDuplicatedColumns` returns the
   column AND the owner cross-check holds; `probable` when only one side holds;
   never emit `unverified` findings.

Log any coverage cap (e.g. *"parsed 8 of 11 migration files; 3 used dynamic SQL
the parser can't read"*). Never truncate silently.

---

## Default severity

| Condition                                                              | Severity |
| ---------------------------------------------------------------------- | -------- |
| Duplicated PII-ish column (`bio`, `email`, `*_url`, `display_name`, …) | `high`   |
| Any other duplicated column / multi-writer-no-owner table              | `medium` |

PII-ish duplication is `high` because divergent copies of personal data are both
a correctness and a privacy/compliance hazard. Governance owns promotion up the
ladder from there (see the contract's severity section).

---

## `cure_map` template

| Cure        | Why                                                                       |
| ----------- | ------------------------------------------------------------------------- |
| `ownership` | Assign a single canonical owner for the attribute / table (CODEOWNERS).   |
| `ci_guard`  | Add a CI check that fails the build when the column reappears in a new table without going through the canonical source. |

Start every `SCH` finding's `cure_map` from `["ownership", "ci_guard"]` and
narrow only if a cure clearly doesn't apply. Generate scaffold-proposal text for
each (the CODEOWNERS line, the CI guard script) in Stage 4 — proposals only,
never auto-applied in v1.

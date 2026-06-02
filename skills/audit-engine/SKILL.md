---
name: audit-engine
description: >
  Audit a repo for structural anti-patterns and repo health: schema drift,
  duplicated logical columns, multiple writers with no owner, and the broader
  six-family sweep. Use when the user asks to "audit" a repo, hunt for "drift"
  or an "anti-pattern", check "repo health", or run a named detector profile
  (e.g. schema-drift / SCH). Owns the full flow: preflight, scope, detect,
  verify, cure-map, emit (findings doc + OpenSpec change + Bilingual Linear
  issues + 4-cure scaffold proposals). Do NOT trigger for premortems, code
  review of a single PR, or generic status reports.
---

# Audit Engine

You are a senior staff engineer running a structural audit on a repository. You
are stack-agnostic and evidence-driven. Your output is governed by the
**audit-report contract** at [`references/audit-report-schema.md`](../../references/audit-report-schema.md)
(machine schema: [`schemas/audit-report-schema.schema.json`](../../schemas/audit-report-schema.schema.json)).
Read the contract before emitting — it is the SSOT for finding IDs, severities,
the `cure_map` vocabulary, and the report envelope.

The engine runs as a **named detector profile** from
[`references/detectors/`](../../references/detectors/). The caller (usually a
`/audit-<family>` command) names which profile to run. For schema drift that is
[`references/detectors/schema-drift.md`](../../references/detectors/schema-drift.md)
(family `SCH`).

A run moves through six stages, **0 → 5**, in order. Do not skip a stage.

---

## Stage 0 — Agent-teams preflight

Fan-out is the engine's default execution model, so check for Agent Teams first.

1. Read `~/.claude/settings.json` and look for:
   ```json
   "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
   ```
2. **If present**, proceed with Agent Teams fan-out.
3. **If missing**, recommend enabling it and show the user the exact one-line diff:
   ```diff
     "env": {
   +   "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
     }
   ```
   **Apply this only with the user's explicit consent.** Never silently edit
   global settings.
4. **If the user declines** (or consent isn't available), PREFER the
   `superpowers:subagent-driven-development` skill — dispatch **one subagent per
   finding** on the latest Opus (4.8).
5. A **sequential single-context crawl** is the *last resort*. It is valid only
   when fan-out doesn't pay off: very few findings, subagents unavailable, or an
   explicit cost / quota limit the user has stated.

Record which execution mode you chose; it determines how Stages 2–3 fan out.

---

## Stage 1 — Scope & context

Before detecting anything, build a picture of the repo.

- **Detect the stack.** Look for Supabase / Postgres (a `supabase/` dir,
  `migrations/`, `*.sql`), Serverpod / Dart (`pubspec.yaml`, `*.dart`,
  generated protocol), or Node (`package.json`, `tsconfig.json`). Record the
  stack string for the report envelope (e.g. `supabase`).
- **Read the governance + ownership context:**
  - `CLAUDE.md` / `AGENTS.md` (project conventions and constraints)
  - `docs/repo-health/governance.md` (if present — the promotion cadence)
  - the ownership map / `CODEOWNERS`
  - prior reports in `docs/repo-health/` — **skip findings already exempted**
    there or carried as accepted waivers.

The goal is to enter Stage 2 knowing the stack, who owns what, and what's
already been triaged so you don't re-report settled issues.

---

## Stage 2 — Detect (LLM-first)

Run the named profile's LLM detection prompt (for `SCH`, the prompt block in
[`references/detectors/schema-drift.md`](../../references/detectors/schema-drift.md)).

- Detection is **LLM-first**: read the relevant sources and surface candidate
  findings by reasoning, not by grep alone.
- **Every candidate finding MUST carry a `file:line` evidence anchor.** No
  anchor → not a candidate. This is non-negotiable; an unanchored claim cannot
  be verified or remediated.

Output of this stage is a list of *candidate* findings, each with at least one
`{ file, line }` evidence object.

---

## Stage 3 — Verify (deterministic + adversarial)

Every candidate must survive verification before it becomes a finding.

- **If the profile has a deterministic check, run it.** For `SCH`, call
  `findDuplicatedColumns(sql, { minTables: 2 })` from
  [`src/audit/verifiers/schema-drift.ts`](../../src/audit/verifiers/schema-drift.ts)
  against the parsed migrations / schema and reconcile its output with the LLM
  candidates.
- **Otherwise, dispatch a refutation agent.** The refuter **defaults to "not a
  finding"** and only confirms when it can *prove* the violation from the
  evidence anchor. This adversarial default keeps false positives out.
- **Fan out one verifier per candidate** (Agent Teams or subagents, per the
  Stage 0 mode).
- **Drop unverified candidates.** Then stamp each surviving finding's
  `confidence` (`confirmed` / `probable` / `unverified` per the contract).
- **ALWAYS log any coverage cap.** If you could only verify a subset, say so
  explicitly (e.g. *"verified 40 of 52 candidates; 12 deferred — schema files
  too large to parse in budget"*). **Never truncate silently.**

---

## Stage 4 — Map to cures

For each confirmed finding, compute the applicable `cure_map` subset from the
contract vocabulary: `ownership | ci_guard | agent_rule | hook`. Use the
profile's `cure_map` template as the starting point (for `SCH`: `ownership` +
`ci_guard`) and adjust to the specific finding.

For each cure, generate **scaffold-proposal text**: a concrete, human-reviewable
description of the diff that would apply the cure (e.g. the CODEOWNERS line, the
CI check, the agent rule). These are proposals, not edits — see Stage 5.

---

## Stage 5 — Emit

Assemble the `AuditReport` (the canonical intermediate representation) and
produce the **four artifacts** per
[`references/audit-report-schema.md`](../../references/audit-report-schema.md):

1. **Findings doc** → `docs/repo-health/<family>-audit-YYYY-MM-DD.md`.
   Render it to conform to
   [`schemas/audit-report-schema.schema.json`](../../schemas/audit-report-schema.schema.json).
   The `renderFindingsDoc(report)` helper in
   [`src/audit/emit/findings-doc.ts`](../../src/audit/emit/findings-doc.ts)
   produces the canonical Markdown format — use its output shape.
2. **OpenSpec remediation change** — a proposed change in the repo's OpenSpec
   workflow that captures the remediation.
3. **Bilingual-Layer Linear issues** — one issue per `blocker` | `high` finding,
   authored in the Bilingual Format (Human Layer + Agent Layer).
4. **4-cure scaffold PROPOSALS** — the suggested diffs from Stage 4. **In v1
   these are never auto-applied.** Present them for the user to review and apply.

End the run with a short chat summary: counts by severity, the coverage cap (if
any), and where the four artifacts landed.

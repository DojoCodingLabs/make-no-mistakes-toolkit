---
name: domain-driven-advisor
description: >
  Guided entry point for repo health when you don't know which audit you need.
  Use when the user asks "which audit", "where do I start", wants to check
  "repo health", or mentions "domain driven" design. Inspects the repo, asks a
  few plain-language questions, recommends which audit(s) to run (or the full
  ordered sweep), runs them via the audit-engine, and finishes with a premortem
  on the remediation plan. Best first command for a new repo.
---

# Domain-Driven Advisor

You are a pragmatic principal engineer helping someone figure out **where to
start** on repo health. They may not know the audit-engine families yet, so you
route them to the right one(s) with plain-language questions, then run the work.

The routing logic mirrors `recommendAudits()` in
[`src/audit/advisor-routing.ts`](../../src/audit/advisor-routing.ts). The
question/family mapping lives in
[`references/domain-driven-advisor-triage.md`](../../references/domain-driven-advisor-triage.md).

Run these steps in order.

---

## Step 1 — Repo signals (cheap pre-weighting scan)

Before asking anything, do a fast scan to pre-weight each `AdvisorSignals`
field. You're guessing the likely answer so you can skip questions later.

| Signal                | Scan heuristic |
| --------------------- | -------------- |
| `sharedDatabase`      | a `migrations/` dir, `supabase/`, shared `*.sql` schema. |
| `feAndBackendValidate`| frontend validation files **plus** edge / server validation (e.g. zod schemas on both a `web/` or `app/` side and an `api/` / edge-function side). |
| `migratingMonolith`   | new services sitting **beside** a monolith (a `services/` or `packages/` tree next to a large legacy app). |
| `layeredArchitecture` | `domain/` + `application/` folders (clean / hexagonal layering). |
| `crossModuleImports`  | imports that reach across module / domain boundaries. |

Record, for each signal, whether the scan made it **clearly true**, **clearly
false**, or **ambiguous**.

---

## Step 2 — Triage (only the ambiguous ones)

Ask the plain-language questions from
[`references/domain-driven-advisor-triage.md`](../../references/domain-driven-advisor-triage.md),
**but only for signals the scan left ambiguous.** Don't re-ask what the scan
already settled. One question at a time; confirm the scanned ones briefly rather
than interrogating.

If the user is unsure or says "all", leave the signals empty — that triggers the
full ordered sweep in Step 3.

---

## Step 3 — Recommend

Apply `recommendAudits()` semantics to the resolved signals to produce the
**ordered set** (canonical order `SCH → CDC → DDD → ARC → STR → ENF`; empty
signals → full sweep).

**Only offer audits whose command currently exists.** Today those are
`/audit-schema-drift` (`SCH`), `/audit-contract-drift` (`CDC`), `/audit-ddd`
(`DDD`), and `/audit-explicit-architecture` (`ARC`) — all **LIVE**. The remaining
families (`STR`, `ENF`) are **"coming soon"** until their follow-up plan ships —
list them in the recommended order so the user sees the full picture, but mark
them unavailable and do not attempt to run them. (live: SCH/CDC/DDD/ARC; coming
soon: STR/ENF)

---

## Step 4 — Agent-teams preflight

Before executing, surface the Agent Teams recommendation (the audit-engine fans
out per finding). Check `~/.claude/settings.json` for
`"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"`; if missing, show the one-line
diff and apply **only with the user's explicit consent** — never silently edit
global settings:

```diff
  "env": {
+   "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
```

(This is the same preflight as Stage 0 of the `audit-engine` skill.)

---

## Step 5 — Execute (gated)

**With the user's consent**, run the recommended **available** audits by
invoking the `audit-engine` skill with each family's detector profile (e.g.
`schema-drift` for `SCH`). Aggregate the findings across all audits run into a
single remediation picture.

This is a gate: do not run audits without consent.

---

## Step 6 — Premortem tail

Invoke the existing `premortem` skill on the **aggregated remediation plan**.
This stress-tests the plan against failure modes before the user commits to the
fixes. The advisor's job ends with a remediation plan that has already survived
a premortem.

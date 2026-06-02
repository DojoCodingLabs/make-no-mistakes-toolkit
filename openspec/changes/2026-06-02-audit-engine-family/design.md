# Design — Audit-engine family + domain-driven-advisor

**Date**: 2026-06-02
**Status**: Proposed
**Supersedes/relates**: extends the productization pattern of `atomic-design-toolkit`;
reuses the `premortem` skill; consumes `governance.md` severity + exception model.

## Decision summary (ADRs)

- **ADR-1 — Composition, not fusion.** `atomic-design-toolkit` keeps the
  component layer (`audit`/`generate`/`migrate`). MNM owns the
  architecture/process layers. Rationale: DDD bounded contexts + SOLID-SRP —
  the two plugins are different domains; fusing them would itself be the
  cohesion violation we audit. DRY is honored by a *shared contract*, not by
  merging code.
- **ADR-2 — Shared report contract is the SSOT.** One schema defines finding
  shape, namespaced IDs, severity, cure-map. Both plugins conform. A meta-report
  can aggregate across families because IDs never collide.
- **ADR-3 — Hybrid detection.** LLM-first detection (portable across the
  polyglot fleet) + deterministic verification where a cheap check exists
  (grep/AST/SQL introspection) + adversarial verification (a second agent tries
  to *refute* each finding) to keep false positives near zero.
- **ADR-4 — Detectors are data.** Each family is a `references/detectors/*.md`
  profile the engine reads, not bespoke code. Keeps commands thin and detectors
  versionable (mirrors `.atomic-design-rules.json` parametrizing the atomic hook).
- **ADR-5 — v1 emits cure *proposals*, not enforcement.** The 4-cure scaffold is
  suggested diffs, applied by a human. Auto-install + unified
  `.repo-health-rules.json` hook is Phase 2 ("hooks first" per the thesis).
- **ADR-6 — Advisor composes, never duplicates.** `/domain-driven-advisor`
  orchestrates the engine + `premortem`; it contains routing logic only.
- **ADR-7 — Agent-teams preflight.** Detection verify + cure-mapping are
  per-finding fan-out, so they get dramatically faster with parallel subagents.
  The engine and advisor run a **preflight** that checks
  `~/.claude/settings.json` for `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"`;
  if absent, they **recommend** adding it (and offer the exact one-line diff) so
  the user can parallelize audits across an agent team. Recommend-only by
  default — never silently edit the user's global settings (gated style); apply
  only on explicit consent. If the user declines, **prefer**
  **subagent-driven-development** (`superpowers:subagent-driven-development`):
  dispatch one subagent per finding on the latest Opus model (4.8), keeping the
  work parallel without agent teams. A sequential single-context crawl is the
  last resort, valid only when fan-out doesn't pay off — e.g. very few findings,
  subagents unavailable in the environment, or an explicit cost/quota limit.

## 1. Shared report contract — `references/audit-report-schema.md`

Canonical SSOT for every audit run, plus a machine-checkable
`audit-report-schema.schema.json`.

**Finding-ID namespaces** (collision-free aggregation):

| Namespace | Family |
|---|---|
| `SCH-###` | schema-drift (1NF) |
| `CDC-###` | contract-drift |
| `DDD-###` | ddd-boundaries |
| `ARC-###` | explicit-architecture (hexagonal/onion/clean/CQRS) |
| `STR-###` | strangler-fig |
| `ENF-###` | enforcement-hooks (Cure-4 coverage) |
| `E###` | component layer (owned by `atomic-design-toolkit`, registered here) |

**Severity** (aligned with `governance.md` advisory→blocking promotion):
`blocker | high | medium | low | advisory`.

**Finding fields**: `id`, `title`, `severity`, `anti_pattern` (citation),
`evidence[]` (`file:line` + snippet), `owner` (from ownership map / CODEOWNERS),
`cure_map` (subset of `{ownership, ci_guard, agent_rule, hook}` + scaffold
pointer), `exemption` (honors `@repo-health-exempt: <reason>`), `confidence`
(set by the verify stage). Report front-matter: family, repo, stack, date,
engine version, counts by severity.

## 2. `audit-engine` skill — shared flow

`skills/audit-engine/SKILL.md`. Invoked by every audit command with a
`{family, detector_profile}` parameter. Stages:

0. **Preflight (agent teams)** — check `~/.claude/settings.json` for
   `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"`. If missing, surface a
   recommendation + the exact one-line diff so the per-finding fan-out (stages
   3–4) can run across a parallel agent team. Recommend-only unless the user
   consents to the edit; if declined, prefer subagent-driven-development
   (one latest-Opus-4.8 subagent per finding, per
   `superpowers:subagent-driven-development`); sequential only when fan-out
   doesn't pay off (few findings, subagents unavailable, or cost limits).
1. **Scope & context** — detect stack (Supabase/PG, Serverpod/Dart, Node),
   read `CLAUDE.md`/`AGENTS.md`, `docs/repo-health/governance.md`, ownership map
   / `CODEOWNERS`, and prior `docs/repo-health/` reports (avoid re-reporting
   exempted findings).
2. **Detect (LLM-first)** — run the detector profile to produce candidate
   findings, each grounded in file evidence. No findings invented without a
   `file:line` anchor.
3. **Verify (deterministic + adversarial)** — fan out one verifier per candidate:
   run the profile's deterministic check if present (confirm/refute); otherwise
   dispatch a refutation agent that defaults to "not a finding" unless it can
   prove the violation. Drop anything that fails verification; stamp
   `confidence`.
4. **Map to cures** — for each confirmed finding compute the applicable subset of
   the 4 cures and generate the scaffold proposal text.
5. **Emit** — write the four artifacts (§5) per the contract.

Parallelization: stages 3–4 are per-finding fan-out (Agent batch). The engine
**logs any coverage cap** (e.g. "verified top 40 of 52 candidates") — no silent
truncation.

## 3. The five detector profiles — `references/detectors/*.md`

Each profile declares: the anti-pattern + citation, LLM detection prompt,
deterministic verify recipe (per stack, optional), severity defaults, and the
cure-map template.

| Command | Detects | Deterministic verify | Stack hints |
|---|---|---|---|
| `/audit-schema-drift` (`SCH`) | 1NF violations; same logical column in N tables without SSOT (`*_bio`); multiple-writers-no-owner on a table | `information_schema` introspection / migration parse; column-name repetition grep; GRANT/owner analysis | Supabase/PG, Serverpod |
| `/audit-contract-drift` (`CDC`) | producer↔consumer validation schemas that should match but diverge (FE↔Edge Function) | parse Zod/Yup/JSON-schema/Dart models; diff field sets + types | TS, Dart |
| `/audit-ddd` (`DDD`) | cross-bounded-context imports; domain importing infrastructure; ubiquitous-language inconsistency | import-graph vs ownership map; module-boundary grep | any |
| `/audit-explicit-architecture` (`ARC`) | dependency-rule direction (domain/application importing infrastructure/UI); Hexagonal ports & adapters (missing port interface; primary vs secondary adapter misplacement); Onion/Clean layer leakage; CQRS command/query mixing | layered import-direction analysis; detect `ports/`/`adapters/`/`application/`/`domain/` structure; CQRS bus/handler presence | any |
| `/audit-strangler` (`STR`) | migration health: façade/proxy present? incremental cutover vs big-bang? old+new coexist with a defined retirement path? sidecar/anti-corruption layer? | detect reverse-proxy/route config, dual-path/dual-write patterns, feature-flag cutover | Serverpod/k8s, any gateway |
| `/audit-enforcement-hooks` (`ENF`) | Cure-4 coverage: PreToolUse/PostToolUse hooks present at repo + toolkit level? rules config (`.atomic-design-rules.json` analog) present and non-stale? every structural rule backed by a hook? grandfather lists shrinking? | scan `.claude/hooks/` + `hooks.json`, parse rules JSON, cross-reference against the other families' confirmed findings | any |

**DDD vs ARC boundary (avoid overlap):** `DDD` audits *where a context begins and
ends* (context leakage, language, domain purity at the context seam). `ARC`
audits *how the layers inside a context are wired* (dependency direction, ports,
CQRS). A domain-imports-infra violation surfaces in `ARC`; a
pathways-imports-hackathons violation surfaces in `DDD`.

## 4. `/domain-driven-advisor` — guided router + premortem tail

`commands/domain-driven-advisor.md` → `skills/domain-driven-advisor/SKILL.md`.
For engineers who don't know which audit they need. Flow:

1. **Repo signals** — cheap scan: is there a DB/migrations dir? FE+backend
   validation? a monolith with new services alongside? layered `domain/`/
   `application/` folders? cross-pillar imports? Each signal pre-weights a family.
2. **Plain-language triage** — `references/domain-driven-advisor-triage.md`
   holds a small decision tree. Ask 2–4 non-jargon questions, e.g.:
   - "¿Varios equipos escriben en la misma base de datos?" → `SCH`
   - "¿El frontend y el backend validan los mismos datos por separado?" → `CDC`
   - "¿Estás partiendo un sistema grande en piezas / migrando un monolito?" → `STR`
   - "¿Tu código separa lógica de negocio de base de datos y framework?" → `ARC` / `DDD`
3. **Recommend** — map (signals + answers) → ordered audit set. If broad or the
   user is unsure, recommend **all six in sequence** in dependency order:
   `SCH → CDC → DDD → ARC → STR → ENF` (data foundation → data contracts →
   context boundaries → internal layering → migration → enforcement coverage
   last, since `ENF` checks whether the cures for everything above are installed).
4. **Execute (gated)** — first run the **agent-teams preflight** (ADR-7): if
   `~/.claude/settings.json` lacks `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"`,
   recommend it (one-line diff), else fall back to subagent-driven-development on
   Opus 4.8. Then, with consent, run the recommended audits via the engine and
   aggregate findings into one cross-family roll-up.
5. **Premortem tail** — feed the aggregated remediation plan into the existing
   **`premortem`** skill (`/premortem`): "it's 6 months out and this remediation
   failed — why?" Produces the standard HTML + transcript deliverable so the plan
   ships stress-tested, not raw.

The advisor holds **routing + orchestration only** — detection lives in the
engine, stress-testing in `premortem`. No detection logic is duplicated.

## 5. Emission (the contract's four targets)

- **Findings doc** — `docs/repo-health/<family>-audit-YYYY-MM-DD.md`, front-matter
  + finding table per the contract (matches `atomic-design-audit-*.md`).
- **OpenSpec change** — `openspec/changes/YYYY-MM-DD-<family>-remediation/`
  with `proposal.md` (PDR), `design.md` (ADR), `tasks.md` (phased remediation).
- **Linear issues** — one Bilingual-Layer issue per `blocker|high` finding
  (`👤 HUMAN LAYER` / `🤖 AGENT LAYER`), with pillar/service labels in the
  sidebar, not the body.
- **4-cure scaffold proposals** — per finding, suggested diffs for: ownership
  entry, CI guard stub, `CLAUDE.md`/`AGENTS.md` rule snippet, hook config.
  *Proposed only* in v1; never auto-applied.

The advisor's roll-up additionally emits a single combined findings doc +
the premortem deliverable.

## 6. Testing

- **Golden fixtures** per family under `src/__fixtures__/<family>/`: a `dirty/`
  tree with known violations (assert each expected finding-ID is produced) and a
  `clean/` tree (assert zero findings — false-positive guard).
- **Deterministic verifiers** unit-tested in isolation (schema introspection,
  schema-diff, import-direction analysis).
- **Contract** validated by `audit-report-schema.schema.json` (CI checks every
  emitted findings doc's front-matter parses).
- **Advisor** routing tested with table-driven cases: (signals + answers) →
  expected ordered audit set.

## 7. Open questions

1. Unified `.repo-health-rules.json` (superset of `.atomic-design-rules.json`)
   for Phase 2 enforcement, or per-family rules files?
2. Should `/domain-driven-advisor` be allowed to run audits **non-interactively**
   (CI mode) or always require the triage dialogue?
3. Cross-plugin contract dependency: vendor the schema into each plugin, or
   publish it as a tiny shared package both depend on?

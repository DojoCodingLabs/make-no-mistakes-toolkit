# Tasks — Audit-engine family + domain-driven-advisor

Ordering reflects dependencies: contract → engine → detectors → commands →
advisor → emission → tests → release. No time estimates (sequential).

## Phase 0 — Shared report contract (SSOT)

- [ ] Write `references/audit-report-schema.md` (finding fields, namespaces, severity, cure-map, exemption marker)
- [ ] Write `references/audit-report-schema.schema.json` (machine-checkable front-matter + finding shape)
- [ ] Register finding-ID namespaces: `SCH`, `CDC`, `DDD`, `ARC`, `STR`, `ENF`, + `E###` (atomic-design-toolkit)
- [ ] Add a CHANGELOG note that `atomic-design-toolkit`'s `audit-report-schema.md` becomes a conformant profile (follow-up, non-blocking)

## Phase 1 — `audit-engine` skill (shared flow)

- [ ] Write `skills/audit-engine/SKILL.md` with stages 0–5 (preflight → scope → detect → verify → map-to-cures → emit)
- [ ] Implement Stage 0 agent-teams preflight: detect `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` in `~/.claude/settings.json`; recommend enabling (one-line diff; apply only on consent), else prefer subagent-driven-development on Opus 4.8 (sequential only as the documented last resort)
- [ ] Implement stack detection (Supabase/PG, Serverpod/Dart, Node) + context loading (CLAUDE.md/AGENTS.md, governance, ownership/CODEOWNERS, prior reports)
- [ ] Implement per-finding fan-out for verify + cure-mapping (Agent batch)
- [ ] Implement adversarial verification (refutation-default agent) + confidence stamping
- [ ] Enforce "no finding without `file:line`" and "log any coverage cap" (no silent truncation)

## Phase 2 — Detector profiles (`references/detectors/*.md`)

- [ ] `schema-drift.md` (`SCH`) — 1NF + duplicated-column-no-SSOT + multiple-writers; SQL introspection / migration-parse verify
- [ ] `contract-drift.md` (`CDC`) — producer↔consumer schema diff; Zod/Yup/JSON-schema/Dart parse verify
- [ ] `ddd-boundaries.md` (`DDD`) — context leakage + domain purity + ubiquitous language; import-graph-vs-ownership verify
- [ ] `explicit-architecture.md` (`ARC`) — dependency direction + ports&adapters + onion/clean layering + CQRS; layered import-direction verify
- [ ] `strangler-fig.md` (`STR`) — façade/proxy + incremental cutover + coexistence/retirement + sidecar/ACL; routing/dual-path detection verify
- [ ] `enforcement-hooks.md` (`ENF`) — Cure-4 coverage: repo+toolkit hooks present? rules config non-stale? every structural rule backed by a hook? cross-reference the other families' findings; scan `.claude/hooks/` + `hooks.json` + rules JSON
- [ ] Document the DDD-vs-ARC boundary in both profiles (avoid double-reporting)

## Phase 3 — Audit commands (thin triggers)

- [ ] `commands/audit-schema-drift.md`
- [ ] `commands/audit-contract-drift.md`
- [ ] `commands/audit-ddd.md`
- [ ] `commands/audit-explicit-architecture.md`
- [ ] `commands/audit-strangler.md`
- [ ] `commands/audit-enforcement-hooks.md`
- [ ] Each: `description` frontmatter, `$ARGUMENTS` for target path, delegates to `audit-engine` with its profile

## Phase 4 — `/domain-driven-advisor`

- [ ] `references/domain-driven-advisor-triage.md` (decision tree: repo signals + plain-language questions → ordered audit set)
- [ ] `skills/domain-driven-advisor/SKILL.md` (signals scan → triage → recommend → gated execute → premortem tail)
- [ ] `commands/domain-driven-advisor.md` (trigger)
- [ ] Wire the premortem tail to the existing `premortem` skill on the aggregated remediation plan
- [ ] Run the agent-teams preflight (ADR-7) before executing audits; surface the one-line settings diff
- [ ] Sequence default `SCH → CDC → DDD → ARC → STR → ENF` when "run all / unsure" (ENF last — checks cures for the rest)

## Phase 5 — Emission (the four targets)

- [ ] Findings doc writer → `docs/repo-health/<family>-audit-YYYY-MM-DD.md`
- [ ] OpenSpec change writer → `openspec/changes/YYYY-MM-DD-<family>-remediation/{proposal,design,tasks}.md`
- [ ] Linear issue writer → Bilingual Layer, one per `blocker|high`, labels in sidebar
- [ ] 4-cure scaffold writer → suggested diffs (ownership / CI guard / CLAUDE.md rule / hook config), proposals only
- [ ] Advisor roll-up → combined findings doc + premortem deliverable

## Phase 6 — Testing

- [ ] Golden fixtures per family: `src/__fixtures__/<family>/{dirty,clean}/` + assertions (true positives + zero false positives)
- [ ] Unit tests for deterministic verifiers (SQL introspection, schema-diff, import-direction)
- [ ] CI validates emitted front-matter against `audit-report-schema.schema.json`
- [ ] Table-driven advisor routing tests: (signals + answers) → expected ordered set

## Phase 7 — Docs & release

- [ ] Update toolkit `README.md` (new audit family + advisor)
- [ ] Bump version in all manifests
- [ ] Branch + PR + tag Greptile; loop until 5/5
- [ ] `gh pr merge --squash --delete-branch`

## Out of scope (Phase 2 follow-up — "hooks first")

- [ ] 4-cure auto-installer (apply scaffolds instead of proposing)
- [ ] Unified `.repo-health-rules.json` (superset of `.atomic-design-rules.json`) + PreToolUse/PostToolUse enforcement hooks
- [ ] `/audit` meta-dispatcher that delegates the component layer to `atomic-design-toolkit`

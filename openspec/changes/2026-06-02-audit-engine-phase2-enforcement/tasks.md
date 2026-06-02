# Tasks — Audit-engine Phase 2 (enforcement) foundation

Ordering reflects dependencies: rules schema → emitter (TDD) → command → docs/wire-in.
No time estimates (sequential). Items are marked **[slice]** (in this change) or
**[later]** (documented Phase-2 follow-up, NOT built here).

## Phase 0 — Unified rules schema (the contract everything targets)

- [x] **[slice]** `schemas/repo-health-rules.schema.json` (draft-07): `version`, `enforcementLevel` (`advisory|strict`), `families` keyed by `SCH|CDC|DDD|ARC|STR|ENF`, each a `{ id, pattern, message, severity, exemptionMarker }[]`
- [x] **[slice]** Superset comment referencing `schemas/atomic-design-rules.schema.json` (junk-drawer / exemption-marker lineage)
- [x] **[slice]** `src/audit/repo-health-rules.contract.test.ts` — ajv-validate a sample + empty-families config; reject bad enforcementLevel / unknown family / missing exemptionMarker / bad severity (mirror `contract.test.ts`)

## Phase 1 — Cure-scaffold emitter (TDD)

- [x] **[slice]** Write `src/audit/cure-scaffold.test.ts` FIRST (red): hook→proposal, family from id, severity/message carried, deterministic slug id, pattern from extension + fallback, no-hook→null, empty cure_map→null
- [x] **[slice]** Implement `src/audit/cure-scaffold.ts`: `HookRuleProposal` interface + `proposeHookRule(finding): HookRuleProposal | null`, pure + deterministic, matching `Finding`/`Cure`/`AuditFamily`/`Severity`
- [x] **[slice]** Green: new tests pass, full suite stays green

## Phase 2 — `/audit` meta-dispatcher

- [x] **[slice]** `commands/audit.md`: runs all six families `SCH → CDC → DDD → ARC → STR → ENF`, delegates the component layer to `atomic-design-toolkit` (composition), aggregates one report, emits cure-scaffold proposals per the rules schema; `$ARGUMENTS` = path; `## Usage`

## Phase 3 — Docs & wire-in

- [x] **[slice]** README: linked `/make-no-mistakes:audit` row under `### Commands`; `### Commands (29)` → `(30)`; Architecture tree `# 29` → `# 30`
- [x] **[slice]** Version `1.29.0` → `1.30.0` in `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (×2), README `**Version:**` header
- [x] **[slice]** CHANGELOG `## [1.30.0] - 2026-06-02` (### Added: `/audit` + repo-health-rules schema + cure-scaffold emitter) + reference link
- [x] **[slice]** Commit: code+tests, then docs/wire-in (conventional messages)

## LATER — same Phase 2, deliberately NOT in this slice

- [ ] **[later]** Live `pre-write-repo-health-*.sh` PreToolUse + PostToolUse hooks that READ `.repo-health-rules.json` (the `pre-write-atomic-design-structure.sh` analog)
- [ ] **[later]** Apply step / 4-cure auto-installer — write proposals into a repo's `.repo-health-rules.json` + land ownership / CI-guard / agent-rule cures
- [ ] **[later]** `/repo-health-rules-init` scaffolder (the `/atomic-rules-init` analog)
- [ ] **[later]** `/audit` invokes the apply step (still gated on human consent)

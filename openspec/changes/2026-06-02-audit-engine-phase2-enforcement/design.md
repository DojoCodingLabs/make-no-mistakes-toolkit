# Design — Audit-engine Phase 2 (enforcement) foundation

**Date**: 2026-06-02
**Status**: Proposed
**Supersedes/relates**: extends `2026-06-02-audit-engine-family` ADR-5 (v1 emits
cure *proposals*) and resolves its open question #1 (unified
`.repo-health-rules.json` vs per-family files — answer: unified, keyed by family).
**Reuses**: the `Finding`/`Cure`/`AuditFamily`/`Severity` types in
`src/audit/types.ts`; the report contract `references/audit-report-schema.md`;
the `.atomic-design-rules.json` enforcement precedent.

## Decision summary (ADRs)

- **ADR-1 — Foundation slice, not whole Phase 2.** This change lands only the
  load-bearing pieces (rules schema, `proposeHookRule` emitter, `/audit`
  command). The live `.sh` hooks + apply step are a *separate later* Phase-2
  change. Rationale: gated working style — ship the contract + emitter, review,
  then wire the runtime that consumes them.

- **ADR-2 — `proposeHookRule` is pure + deterministic.** Same `Finding` in →
  same `HookRuleProposal` out. No `Date.now`, no filesystem, no randomness
  (consistent with the rest of `src/audit` — see the `date`-is-passed-in note in
  `types.ts`). Makes it golden-testable and diffable.

- **ADR-3 — The emitter targets the rules schema, but does not write files.**
  `HookRuleProposal` is shape-compatible with one `families[<F>][]` rule object
  in `schemas/repo-health-rules.schema.json`, minus `exemptionMarker` (supplied
  at apply time with the repo's chosen marker family). *Propose* = produce the
  object; *apply* (LATER) = merge it into `.repo-health-rules.json`.

- **ADR-4 — Unified rules file, keyed by family (resolves family open-Q #1).**
  One `.repo-health-rules.json` with a `families` object beats six per-family
  files: one PreToolUse hook reads one file; finding-IDs already namespace
  cleanly so rules never collide. It is a **superset** of
  `.atomic-design-rules.json` — the junk-drawer / canonical-folder / forbid-
  pattern / `exempt_markers` concepts generalize to a per-family
  `pattern` + `severity` + `exemptionMarker` rule. The schema comment points back
  at `atomic-design-rules.schema.json` for the lineage.

- **ADR-5 — Component layer stays in `atomic-design-toolkit` (composition).**
  The six MNM families are the rules-file keys; the atomic-design `E###`
  component layer is **not** a family here. `/audit` *delegates* the component
  sweep to `atomic-design-toolkit`'s `audit` when installed, then aggregates.
  Fusing the two would be the cohesion violation the audits flag.

- **ADR-6 — `enforcementLevel` mirrors governance promotion.** `advisory` =
  PostToolUse warns only; `strict` = PreToolUse blocks on `blocker|high`. Same
  advisory→blocking promotion model as `governance.md`, so a repo can adopt
  enforcement gradually.

- **ADR-7 — `exemptionMarker` honors the contract's exemption story.** Default
  family `@repo-health-exempt` (the same marker the `Finding.exemption` field
  honors). A legitimate write carries `// @repo-health-exempt: <reason>` and the
  (LATER) hook lets it through — the documented bypass.

## 1. `proposeHookRule` — the emitter (IN THIS SLICE)

`src/audit/cure-scaffold.ts`.

```ts
export interface HookRuleProposal {
  family: AuditFamily; id: string; pattern: string; message: string; severity: Severity;
}
export function proposeHookRule(finding: Finding): HookRuleProposal | null;
```

Derivation (deterministic):

| field      | source |
|------------|--------|
| (gate)     | `finding.cure_map` must include `"hook"`, else return `null` |
| `family`   | prefix of `finding.id` (`"SCH-001"` → `"SCH"`) |
| `id`       | `<family-lowercase>-<slugified-title>` |
| `pattern`  | glob from first evidence file's extension (`x.sql` → all-`.sql` glob); match-all when none / dotfile |
| `message`  | `finding.title` |
| `severity` | `finding.severity` |

## 2. `schemas/repo-health-rules.schema.json` — the rules contract (IN THIS SLICE)

draft-07. `{ version: 1, enforcementLevel: advisory|strict, families: { SCH?|CDC?|DDD?|ARC?|STR?|ENF? : rule[] } }`,
`rule = { id, pattern, message, severity (blocker|high|medium|low|advisory), exemptionMarker }`.
`additionalProperties:false` everywhere; family keys constrained to the six
namespaces. Validated by `repo-health-rules.contract.test.ts` (ajv), mirroring
`contract.test.ts`.

## 3. `/audit` meta-dispatcher (IN THIS SLICE)

`commands/audit.md`. Triggers `audit-engine` across `SCH → CDC → DDD → ARC →
STR → ENF` (ENF last — it checks whether the cures for the rest are installed),
notes the cross-plugin delegation to `atomic-design-toolkit` for the component
layer, aggregates one report, and emits cure-scaffold proposals per
`schemas/repo-health-rules.schema.json`. `$ARGUMENTS` = target path.

## 4. Testing (IN THIS SLICE — TDD)

- `cure-scaffold.test.ts` (written red first): `hook` in cure_map → proposal with
  right family/severity/message; family parsed from `SCH-001`-style id; slug id
  deterministic; pattern from extension + match-all fallback; no `hook` → `null`;
  empty cure_map → `null`.
- `repo-health-rules.contract.test.ts`: ajv-validate a good sample + minimal
  empty-families config; reject bad `enforcementLevel`, a family outside the six,
  a rule missing `exemptionMarker`, and a bad `severity`.

## 5. Explicitly LATER (same Phase 2, separate change)

- Live `pre-write-repo-health-*.sh` PreToolUse + PostToolUse hooks that READ
  `.repo-health-rules.json` (the `pre-write-atomic-design-structure.sh` analog).
- The **apply step / 4-cure auto-installer** that writes proposals into a repo's
  `.repo-health-rules.json` and lands the ownership / CI-guard / agent-rule
  cures.
- A `/repo-health-rules-init` scaffolder (the `/atomic-rules-init` analog).

## 6. Open questions

1. At apply time, does `proposeHookRule` gain a sibling that merges into an
   existing `.repo-health-rules.json` (dedupe by `id`), or does the apply step
   own merge?
2. Should `enforcementLevel: strict` block on `medium` too, or stay
   `blocker|high` only?
3. Cross-plugin: does `/audit` read `atomic-design-toolkit`'s findings via its
   report contract, or shell out to its command?

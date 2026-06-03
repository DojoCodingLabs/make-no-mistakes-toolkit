# Proposal — Audit-engine Phase 2 (enforcement) foundation

**Date**: 2026-06-02
**Status**: Proposed — pending review
**Builds on**: `openspec/changes/2026-06-02-audit-engine-family/` (Phase 1 — detection + cure *proposals*)
**Citing**: dojo-os drift thesis (`docs/repo-health/atomic-design-drift-thesis.md`, the 4-cure model: ownership / CI guard / agent rule / PreToolUse+PostToolUse hooks) · dojo-os `.atomic-design-rules.json` + `pre-write-atomic-design-structure.sh` precedent · `references/audit-report-schema.md` (the report contract SSOT) · `schemas/atomic-design-rules.schema.json`
**Anti-pattern in scope**: detection-without-enforcement — Phase 1 *proposes* cures but nothing *applies* them, so confirmed `hook`-curable findings never become live guardrails.

## Why

Phase 1 shipped the **detection** half of the drift thesis: six audit families
(`SCH|CDC|DDD|ARC|STR|ENF`), the shared report contract, and a
`/domain-driven-advisor`. Per ADR-5 of that change, v1 deliberately stops at
*cure proposals* — suggested diffs a human applies. The thesis itself names the
next step as **"hooks first"**: turn the confirmed findings whose `cure_map`
includes `hook` into **applied enforcement**, backed by a unified rules config
the PreToolUse/PostToolUse hooks read.

dojo-os already proved the enforcement shape with `.atomic-design-rules.json` +
`pre-write-atomic-design-structure.sh` (the component layer). Phase 2
generalizes that precedent across the other five families so drift is *blocked
at write time*, not just *reported after the fact*.

This change delivers the **FOUNDATION of Phase 2 — not the whole thing.** It
lands the pieces that everything else depends on (the rules schema, the
proposal-to-rule emitter, the meta-dispatcher command) and clearly defers the
live `.sh` hooks + the apply step to a later Phase-2 change.

## What

Three foundation pieces, each marked IN THIS SLICE vs LATER:

1. **4-cure auto-installer (foundation only).** The mechanism that turns a
   confirmed finding whose `cure_map` includes `hook` into an applied
   enforcement rule.
   - **IN THIS SLICE** — `proposeHookRule(finding)` (`src/audit/cure-scaffold.ts`):
     a pure, deterministic emitter that maps a `Finding` → a `HookRuleProposal`
     (family from the id prefix, slugified rule id, glob pattern from the first
     evidence file's extension, finding title as message, finding severity).
     Returns `null` when the finding is not `hook`-curable. This is *propose*.
   - **LATER** — the apply step that writes the proposal into a repo's
     `.repo-health-rules.json` and the 4-cure auto-installer that also lands the
     ownership / CI-guard / agent-rule cures.

2. **Unified `.repo-health-rules.json` (foundation only).** A superset of
   `.atomic-design-rules.json`, consumed by PreToolUse/PostToolUse hooks.
   - **IN THIS SLICE** — `schemas/repo-health-rules.schema.json` (draft-07):
     `version`, `enforcementLevel` (`advisory|strict`), and a `families` object
     keyed by the six namespaces, each an array of
     `{ id, pattern, message, severity, exemptionMarker }` rules. Validated by
     `src/audit/repo-health-rules.contract.test.ts` with ajv.
   - **LATER** — the live PreToolUse/PostToolUse `.sh` hooks that READ this file
     and block/warn, and the `/atomic-rules-init` analog that scaffolds it.

3. **`/audit` meta-dispatcher (foundation only).** One command that runs the
   full repo-health sweep.
   - **IN THIS SLICE** — `commands/audit.md`: triggers `audit-engine` across all
     six families (`SCH → CDC → DDD → ARC → STR → ENF`), delegates the COMPONENT
     layer to `atomic-design-toolkit`'s audit if installed (composition, not
     fusion), aggregates into one report, and emits cure-scaffold proposals
     against `schemas/repo-health-rules.schema.json`.
   - **LATER** — the meta-dispatcher invoking the apply step to install the
     proposed rules (still gated on human consent).

## Impact

- **New files** in `make-no-mistakes-toolkit`:
  `schemas/repo-health-rules.schema.json`, `src/audit/cure-scaffold.ts` (+ test),
  `src/audit/repo-health-rules.contract.test.ts`, `commands/audit.md`.
- **No behavioral change** to the six existing audits or the advisor; the
  emitter is additive and pure.
- **Composition preserved (no fusion)**: the component layer stays owned by
  `atomic-design-toolkit`; `/audit` *delegates* to it.
- **Version bump** `1.29.0 → 1.30.0` across the manifests + README header +
  CHANGELOG.
- **Explicitly out of this slice (LATER, same Phase 2)**: the live
  PreToolUse/PostToolUse `.sh` hooks, the apply step / 4-cure auto-installer, and
  the `.repo-health-rules.json` scaffolder. v1 = *propose*; Phase-2-later =
  *apply*.

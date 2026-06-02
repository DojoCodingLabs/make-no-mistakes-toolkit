---
description: >
  Audit Cure-4 enforcement-hook coverage — are the PreToolUse/PostToolUse hooks
  that prevent the other audits' drift actually installed? Checks for repo-level
  hooks (`.claude/hooks/`), inherited toolkit hooks, a rules config for them to
  enforce, and whether every structural rule the other five audits recommend is
  backed by a real hook (detection-without-enforcement is the anti-pattern).
  Emits a findings doc, an OpenSpec remediation change, Bilingual Linear issues,
  and cure scaffold proposals. Accepts a target path as $ARGUMENTS.
---

# /audit-enforcement-hooks

Trigger the **`audit-engine`** skill with the `enforcement-hooks` (`ENF`)
detector profile (`references/detectors/enforcement-hooks.md`) against
$ARGUMENTS (default: the current repo).

The engine owns the full flow (preflight → scope → detect → verify → cure-map →
emit). Deterministic verification uses `findHookCoverageGaps` from
`src/audit/verifiers/enforcement-hooks.ts` — it takes the `EnforcementConfig`
assembled from Stage 2 (which repo-level hooks exist; are the toolkit hooks
inherited; is there a rules config for them to enforce; which structural rules
the other five audits recommend) and returns one gap per rule that holds
(`no-repo-hooks`, `no-toolkit-hooks`, `no-rules-config`,
`rule-without-hook:<rule>`), sorted by `code` — so the result is deterministic
and diffable.

This family is the **meta-audit that closes the loop**: it does not re-detect
schema, contract, domain, layering, or migration drift — it audits whether the
**Cure-4 enforcement hooks** for that drift are installed. For that reason it
**runs LAST** of the six (`SCH → CDC → DDD → ARC → STR → ENF`): it
cross-references the confirmed findings of the other five and verifies each
hook-mappable cure is backed by a real PreToolUse/PostToolUse hook.

## Usage

```
/audit-enforcement-hooks [path]
```

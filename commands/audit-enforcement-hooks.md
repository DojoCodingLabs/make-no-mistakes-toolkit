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
emit). Deterministic verification runs **two** verifiers, because coverage and
efficacy are different questions:

`findHookCoverageGaps` from `src/audit/verifiers/enforcement-hooks.ts` asks
**does a gate exist for this rule?** — shapes 1 and 3 of the seven vacuous-gate
shapes.

`findHookEfficacyGaps` from `src/audit/verifiers/enforcement-hooks-efficacy.ts`
asks **does the gate that exists actually bind?** — shapes 2 and 4-7: it looks at
the adjacent property, it denies on an exit code that does not deny, it passes on
an empty input set, it is registered in a file the harness never loads, it names
an escape hatch that does not exist, it runs only in CI, or its incentive is
inverted so complying costs more than not complying.

A repo with full coverage and zero efficacy gaps has gates that are present AND
binding, which is the only combination worth calling enforcement.

The coverage verifier takes the `EnforcementConfig` assembled from Stage 2
(which repo-level hooks exist; are the toolkit hooks inherited; is there a
rules config for them to enforce; which structural rules the other five audits
recommend) and returns one gap per rule that holds (`no-repo-hooks`,
`no-toolkit-hooks`, `no-rules-config`, `rule-without-hook:<rule>`), sorted by
`code` — so the result is deterministic and diffable.

The efficacy verifier takes an `EfficacyConfig` (one
`HookObservation` per gate, plus the registry file the harness actually reads)
and returns gaps stamped with the `shape` they instance and a `confidence` of
`direct` or `proxy`. An observation left `undefined` produces no gap: the
verifier reports what was looked up, never what was assumed.

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

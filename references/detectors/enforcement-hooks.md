# Detector Profile — `ENF` (Enforcement Hooks)

This is the **`ENF`** detector profile for the `audit-engine` skill. The engine
loads it during Stage 2 (detect) and Stage 3 (verify). It defines the
anti-pattern, the LLM detection prompt, the deterministic verify recipe, default
severity, and the `cure_map` template. Field definitions, finding-ID rules, and
the severity ladder come from the contract:
[`references/audit-report-schema.md`](../audit-report-schema.md).

> **Scope (ENF).** This family is the **meta-audit that closes the loop**: it
> checks whether the repo actually HAS the PreToolUse/PostToolUse hooks that
> *enforce* the structural rules the OTHER five audits (`SCH`, `CDC`, `DDD`,
> `ARC`, `STR`) recommend. It does **not** re-detect schema, contract, domain,
> layering, or migration drift — it audits whether the **cures** for that drift
> are installed. For that reason **`ENF` runs LAST**: it cross-references the
> confirmed findings of the other five and verifies each hook-mappable cure is
> backed by a real hook.

---

## Anti-pattern

The dojo-os **drift thesis** holds that structural drift is never cured by a
one-time fix: detection and remediation buy a clean snapshot, but the same drift
returns the moment the next change lands unguarded. The 4-cure model names the
durable cures, and the load-bearing one is **Cure 4 — PreToolUse/PostToolUse
hooks**: a hook intercepts the offending tool call *before* it lands (PreToolUse
ownership/dependency enforcement) or telemeters the drift *after* it lands
(PostToolUse drift telemetry), so the rule sticks with no human in the loop.

The **anti-pattern** is **detection-without-enforcement**: a repo runs the audits,
fixes the findings, recommends the cures — and then installs no hooks, so the
drift returns and the audit has to be re-run forever. Its smells:

- **No repo hooks.** There is no `.claude/hooks/` (or `hooks.json` wiring) at the
  repo level — Cure 4a is absent, so nothing enforces this repo's own rules.
- **No toolkit hooks inherited.** The shared make-no-mistakes enforcement hooks
  do not run for this repo — Cure 4b is absent, so even the baseline ruleset is
  off.
- **No rules config.** There is no rules config (the `.atomic-design-rules.json`
  analog) — the hooks, even if wired, have nothing to enforce.
- **Rule without a hook.** A structural rule was recommended (by one of the other
  five audits' confirmed, `hook`-mappable findings) but no hook's name covers it
  — the rule is documented but unenforced.

The canonical smell is the **rule without a hook**: a confirmed finding from
`SCH`/`CDC`/`DDD`/`ARC`/`STR` whose `cure_map` includes `hook`, with no hook
actually installed to enforce it — detection that will silently drift back.

---

## Stage 2 — LLM detection prompt

Run this prompt against the repo (its `.claude/hooks/` + `hooks.json`, its rules
config, and the confirmed findings of the OTHER five families):

> You are auditing a codebase for Cure-4 enforcement-hook coverage — does the
> repo actually HAVE the PreToolUse/PostToolUse hooks that enforce the structural
> rules the other audits recommend, or is it detection-without-enforcement?
>
> 1. **List the repo-level hooks.** Scan `.claude/hooks/` and any `hooks.json`
>    wiring. Record each PreToolUse/PostToolUse hook by name in `repoHooks`,
>    anchored to a `file:line`.
> 2. **Determine whether toolkit hooks are inherited.** Check whether the shared
>    make-no-mistakes enforcement hooks run for this repo (plugin enabled, not
>    disabled via `CLAUDE_DISABLE_PLUGIN_HOOKS`). Record `toolkitHooksPresent`.
> 3. **Determine whether a rules config exists.** Look for a rules config (the
>    `.atomic-design-rules.json` analog, or `hooks/rules/rules.yaml|json`) that
>    the hooks read. Record `rulesConfigPresent` with its `file:line`.
> 4. **Assemble the structural rules in force.** Cross-reference the **confirmed
>    findings of the OTHER five families**: every confirmed finding whose
>    `cure_map` includes `hook` implies a structural rule that should have a
>    corresponding hook. Record each as a short substring in `structuralRules`
>    (e.g. `ownership`, `dependency-rule`, `cross-context`), anchored to the
>    finding that produced it.
>
> For every observation, emit a `file:line` (or finding-ID) evidence anchor. An
> observation without an anchor is invalid — drop it. Flag the rules that have no
> backing hook — those are the detection-without-enforcement gaps.

Output: an `EnforcementConfig` object (`repoHooks`, `toolkitHooksPresent`,
`rulesConfigPresent`, `structuralRules`) plus the anchors backing each field,
ready for the deterministic verify in Stage 3.

---

## Stage 3 — Deterministic verify recipe

`ENF` has a deterministic check that turns the assembled config into findings.
Run it; do **not** fall back to a refutation agent unless the config can't be
assembled (e.g. hooks are injected by an external orchestrator and not
inspectable from the repo).

1. **Assemble `EnforcementConfig`** from the Stage 2 observations: list
   `repoHooks` from `.claude/hooks/` + `hooks.json`, set `toolkitHooksPresent`
   and `rulesConfigPresent` from what was found, and fill `structuralRules` from
   the OTHER five families' confirmed `hook`-mappable findings.
2. **Call the verifier:**
   ```ts
   import { findHookCoverageGaps } from "../../src/audit/verifiers/enforcement-hooks";

   const gaps = findHookCoverageGaps(config);
   // -> [{ code: "no-repo-hooks", detail: "No repo-level PreToolUse/PostToolUse hooks ..." }, ...]
   ```
   The verifier applies the rules below and returns one gap per condition that
   holds, sorted by `code` — so its output is deterministic and diffable:
   - `repoHooks.length === 0` → `no-repo-hooks`
   - `!toolkitHooksPresent` → `no-toolkit-hooks`
   - `!rulesConfigPresent` → `no-rules-config`
   - one `rule-without-hook:<rule>` per structural rule that no `repoHooks` name
     includes
   - a fully-covered setup (≥1 repo hook, toolkit hooks present, rules config
     present, every structural rule backed by a hook) → `[]`.
3. **Reconcile** the verifier gaps with the Stage 2 observations: each gap must
   carry the anchor of the signal that produced it (the absent `.claude/hooks/`,
   the missing rules config, or the confirmed finding whose `hook` cure is
   unbacked). Drop any gap whose backing observation has no anchor.
4. **Stamp `confidence`:** `confirmed` when `findHookCoverageGaps` returns the
   gap AND its backing observation resolves to an anchor (a real `.claude/hooks/`
   listing, a real rules config path, a real cross-referenced finding-ID);
   `probable` when a signal is only partially observable (e.g. toolkit-hook
   inheritance is inferred rather than directly confirmed); never emit
   `unverified` findings.

Run order: **`ENF` runs LAST** of the six — it checks whether the cures for the
other five are installed, so it needs their confirmed findings as input. Log any
coverage cap (e.g. *"could not confirm toolkit-hook inheritance from the repo
alone"*). Never truncate silently.

---

## Default severity

| Condition                                                                  | Severity |
| -------------------------------------------------------------------------- | -------- |
| `no-repo-hooks` — no repo-level enforcement hooks at all (Cure 4a absent)  | `high`   |
| `no-rules-config` — no rules config for the hooks to enforce               | `high`   |
| `no-toolkit-hooks` — toolkit enforcement hooks not inherited (Cure 4b)     | `medium` |
| `rule-without-hook:<rule>` — a recommended rule has no backing hook        | `medium` |

`no-repo-hooks` and `no-rules-config` are `high` because each removes the
enforcement layer wholesale: with no hooks and nothing for them to enforce, every
structural cure the other five audits recommend will silently drift back.
`no-toolkit-hooks` and `rule-without-hook` are `medium` — the repo still has
*some* enforcement, but the baseline ruleset is off or a specific rule is
unguarded. Governance owns promotion up the ladder from there (see the contract's
severity section).

---

## `cure_map` template

| Cure        | Why                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hook`      | Install the missing PreToolUse/PostToolUse hook so the structural rule is enforced on every tool call with no human in the loop — the literal Cure 4. |
| `ci_guard`  | Add a CI check that fails the build if the enforcement hooks / rules config are absent or removed, so Cure 4 itself can't silently regress.            |

Start every `ENF` finding's `cure_map` from `["hook", "ci_guard"]`. The pairing
names the **missing hook** (install Cure 4) plus a **CI guard on the hooks
themselves** so the enforcement layer can't be silently deleted. Generate
scaffold-proposal text for each (the hook wiring, the CI assertion) in Stage 4 —
proposals only, never auto-applied in v1.

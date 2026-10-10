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

## The other half: a gate can exist and still bind nothing

Everything above asks **"does a hook exist for this rule?"** — a question about
presence, and the easy half. A gate can be present, correctly named, wired into
a config, reviewed and merged, and assert nothing at all.

**The seven shapes of a vacuous gate.** Shapes 1 and 3 are questions about the
SET of hooks and are what the coverage check above already answers. Shapes 2 and
4-7 are questions about EACH hook, and each was observed in a live repository.

| # | Shape | The question to ask |
| - | ----- | ------------------- |
| 1 | It does not look | Is any gate covering this rule? |
| 2 | It looks at the adjacent property | What proposition does it assert — and is that the proposition the rule needs? |
| 3 | It was deleted | Does the rule outlive its gate? |
| 4 | It is correct and binds nothing | Wrong exit code, empty input set, or no test that it ever denies? |
| 5 | It is correct, blocking, and too late | Does a write-time twin exist, or does CI catch what write-time should have? |
| 6 | It is registered where nothing reads | Is it in the file the harness actually loads? |
| 7 | Its incentive is inverted | Is the compliant state cheaper than the non-compliant one? |

Three of these are worth spelling out, because each cost a real repo months.

**Shape 4 — the exit code.** In the Claude Code PreToolUse contract only **exit
2** blocks. Exit 1 is an error the harness reports and then proceeds past. A repo
found twelve hooks written to deny on `exit 1`, including one guarding writes
against production. Each was correct, reviewed, and inert.

**Shape 6 — the registry.** A hook wired into `.claude/hooks/hooks.json` when the
harness reads `.claude/settings.json` never runs. Its presence in *a* registry
file reads as covered, which is why it survives review.

**Shape 7 — the inverted incentive.** The newest and the one no coverage audit
can see, because the gate exists, looks at the right thing, and binds. A doc
validator escalated to ERROR **only when a record's status was `accepted`**,
degrading `draft` and `review` to a warning. Complying cost more than not
complying, so records stayed unsettled — and every reader who noticed was trained
to stay in the lenient branch. The gate was not weak. It pointed the wrong way.

**Two of the seven are not decidable from a file listing, and the detector says
so rather than guessing.** Shape 2 is checked through its strongest correlate —
a gate whose tests assert only the exit code has nothing pinning WHAT it said, so
one that silently stopped emitting its message still passes — and that gap is
labelled `proxy`. Shape 7 needs a reader, because "which branch is cheaper"
depends on what the branches cost in that repo.

Refusing to encode the un-automatable is the point. A verifier that guessed
shape 7 would be a gate that looks at the adjacent property — shape 2, in the
tool built to find shape 2.

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

Then, for **each hook found in step 1**, record the facts the binding question
needs. Every one is a lookup, not an inference from the file name:

> 5. **`registeredIn`** — every file that registers this hook, AND
>    `harnessRegistryFile`, the one the harness actually loads. Shape 6 is only
>    decidable against that second value; without it, every registration looks
>    equally real.
> 6. **`intendsToBlock`** and **`blockingExitCode`** — does it deny or only warn,
>    and with what code. A warn-mode gate is not vacuous for being non-blocking;
>    that is its design.
> 7. **`testAssertsBlock`** and **`testAssertsMessage`** — does its suite prove a
>    violating input is denied, and does it assert the message TEXT? A suite that
>    checks only the exit code stays green if the gate stops saying anything.
> 8. **`failsOnEmptyInput`** — does it fail when its own allowlist or config is
>    empty? A gate that iterates nothing and exits 0 passes every run while
>    checking nothing.
> 9. **`namedSymbols`** — every symbol the gate NAMES and depends on: an escape
>    label, a config path, a rule key, an issue ID. For each, record whether it
>    **resolves against the system that owns it, by a command that was run**, and
>    which system was asked. A gate offering an escape hatch that is not there
>    offers no escape.
> 10. **`hasWriteTimeTwin`** — for a CI-enforced rule, does a write-time twin
>     exist? Leave `undefined` if you did not check; an unanswered question is not
>     a finding.
> 11. **`severityFavorsCompliance`** — is the compliant state at least as cheap as
>     the non-compliant one? Read the gate's severity branches and answer.
>     `undefined` if nobody read them.

Output: an `EnforcementConfig` object (`repoHooks`, `toolkitHooksPresent`,
`rulesConfigPresent`, `structuralRules`) **and** an `EfficacyConfig`
(`hooks: HookObservation[]`, `harnessRegistryFile`), plus the anchors backing
every field, ready for the deterministic verify in Stage 3.

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
3. **Call the efficacy verifier** — coverage and efficacy are different
   questions and both must run:
   ```ts
   import { findHookEfficacyGaps } from "../../src/audit/verifiers/enforcement-hooks-efficacy";

   const efficacy = findHookEfficacyGaps(efficacyConfig);
   // -> [{ code: "non-blocking-exit-code:pre-write-x", shape: 4, confidence: "direct", detail: "..." }]
   ```
   One gap per condition that holds, each stamped with the `shape` it instances
   and a `confidence` of `direct` or `proxy`, sorted by `code`:
   - registered outside `harnessRegistryFile` → `registered-where-nothing-reads:<hook>` (shape 6)
   - PreToolUse denial on an exit code other than 2 → `non-blocking-exit-code:<hook>` (shape 4)
   - passes on an empty input set → `vacuous-on-empty-input:<hook>` (shape 4)
   - blocking with no test that it denies → `no-block-assertion:<hook>` (shape 4)
   - tests assert the exit code only → `asserts-adjacent-property:<hook>` (shape 2, **proxy**)
   - names a symbol that does not resolve → `unresolved-symbol:<hook>:<symbol>` (shape 2)
   - CI-only with `hasWriteTimeTwin === false` → `enforced-too-late:<hook>` (shape 5)
   - `severityFavorsCompliance === false` → `inverted-incentive:<hook>` (shape 7)

   An `undefined` observation produces no gap. The verifier reports what was
   looked up, never what was assumed.

4. **Reconcile** the verifier gaps with the Stage 2 observations: each gap must
   carry the anchor of the signal that produced it (the absent `.claude/hooks/`,
   the missing rules config, or the confirmed finding whose `hook` cure is
   unbacked). Drop any gap whose backing observation has no anchor.
5. **Stamp `confidence`:** `confirmed` when `findHookCoverageGaps` returns the
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
| `registered-where-nothing-reads:<hook>` — inert, and reads as covered      | `high`   |
| `non-blocking-exit-code:<hook>` — denies on a code that does not deny      | `high`   |
| `unresolved-symbol:<hook>:<symbol>` — names something that does not exist  | `high`   |
| `inverted-incentive:<hook>` — complying costs more than not complying      | `high`   |
| `vacuous-on-empty-input:<hook>` — green while checking nothing             | `medium` |
| `no-block-assertion:<hook>` — no test proves it ever denies                | `medium` |
| `asserts-adjacent-property:<hook>` — **proxy**, needs a human read         | `medium` |
| `enforced-too-late:<hook>` — CI catches what write-time should have        | `medium` |

The four efficacy `high`s share one property that the `medium`s do not: each
produces a gate that **looks like coverage from every listing**. An inert hook,
a denial on the wrong exit code, a phantom symbol and an inverted incentive all
survive review, appear in the inventory, and report green. A `medium` gap is a
gate that is weak; a `high` gap is a gate that is misleading, and the second is
worse because it stops anyone from looking again.

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

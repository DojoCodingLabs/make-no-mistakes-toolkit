# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note on git tags.** Tags for the versions below do not yet exist on the remote
> (the project shipped without `v*` tags). The reference links at the bottom of
> this file are written as if the tags will be created post-merge by the
> maintainer. Until then, expect link rot on `compare/...` and `releases/tag/...` URLs.

> **Note on reconstruction.** Versions 1.1.0 through 1.12.0 below were reconstructed
> from `git log` and merged-PR history (see PR opening this CHANGELOG for the
> exact map). Some PRs landed without bumping the package version — those are
> documented under the version line they shipped on. Version 1.13.0 was
> intentionally skipped (no commit ever carried that number).

## [Unreleased]

## [1.36.0] - 2026-07-31

### Added
- **`discard-stderr` hook rule** — blocks a `Bash` command that routes stderr to
  `/dev/null`. A failing command with its stderr discarded is *indistinguishable*
  from a succeeding one that printed nothing, so the empty result gets read as
  "none found" rather than "it errored". That is not a hypothetical: on
  2026-07-31 a `gh api --jq --arg ... 2>/dev/null` — `gh` rejects that flag
  combination — produced an empty file that was reported to the team as "0 red
  PRs". Sixteen of 41 were red, twelve of them on TypeScript. The discarded
  stderr said exactly what was wrong.

  **The rule matches on order, which is the whole difficulty.** `>/dev/null 2>&1`
  is blocked: stdout is redirected first, then stderr is pointed at wherever
  stdout now goes, so both die. `2>&1 >/dev/null` is allowed: stderr is
  duplicated to the *original* stdout before the redirect, so it survives.
  Identical token sets, opposite outcomes — a matcher that keyed on the tokens
  alone would get one of the two wrong, and it is the permissive error that
  costs, because a rule that blocks working commands gets removed.

  Three shapes stay allowed and each has a test pinning it: `cmd >/dev/null`
  (stderr still reaches you), `command -v x >/dev/null` (the existence probe,
  which appears throughout these very hooks), and `cmd 2>&1 >/dev/null`. A
  quoted mention — `git grep '2>/dev/null'` — performs no redirect and is not
  blocked, because mention is not execution.

  **Ships with `bypass_marker: null`**, the first rule here to do so. Every case
  a bypass would have covered is already allowed above, so a marker would only
  buy a way past a rule nobody needs to get past. The precedent is dojo-os
  `pre-bash-block-main-target.sh`, which accepted `DOJO_HOTFIX_TO_MAIN=1` *and*
  printed that literal in its own refusal: the thing meant to stop you handed
  you the way through, and two agents filed false P0-hotfix claims that way
  (DOJ-6247). A gate whose refusal message prints the way around it is not a
  gate.

  9 tests (4 blocking, 5 allowing). Rule count: 39 → 40.

## [1.35.0] - 2026-07-29

### Added
- **`/explain <topic>`** — explains something in two layers, then converts the
  explanation into a decision. The layers are not the same content at two levels
  of detail: prose answers *what is going on and why it matters*, technical
  answers *where exactly and how*. A prose layer that is only the technical layer
  in smaller words is redundant, gets skipped, and kills the format within a few
  uses — so the command carries that as its own pass/fail test rather than as
  advice.

  Two steps carry the weight. **Step 0 requires reading the artifact before
  writing a line**, because fluent prose about a mechanism *reads as*
  understanding, which makes this format unusually good at hiding that the file
  was never opened. And **step 5 permits skipping `AskUserQuestion`** when the
  explanation leaves no decision open — a menu invented to satisfy the format
  trains the reader to ignore the menus that matter.

  The insight block earns its place only by saying something not derivable from
  the two layers above it; if it summarizes, the command says to delete it.

- **`make-no-mistakes.config.json`** (see
  `commands/make-no-mistakes.config.example.json`) — optional per-project file
  for toolkit-wide behaviour, starting with `language` (default `es`) and
  `diacritics`. A third config on purpose: `slack-config.json` and
  `linear-setup.json` answer *where things go*, and a preference parked in a
  domain config is invisible to every command that does not touch that domain.
  The boundary is written into the file itself.

  `language` governs **prose addressed to the user only**. Code, identifiers,
  commit messages, PR titles and bodies, and Linear issues follow the target
  repo's own convention. Wired into `/explain`; retrofitting the other commands
  is deliberately left as separate work.
- `normalize: strip-flags` on a rule's match condition — rewrites the field (drops `--flag` / `--flag=value`, collapses whitespace) before the pattern applies. Per-condition rather than per-rule, because a verb-scoped rule reads two surfaces of one command: the flags answer "does this target production?", the verb answers "is this a mutation?". Unknown values fail open at runtime and are rejected at build time by `build-rules.mjs`. Documented in `hooks/rules/README.md`, including why quoted arguments are deliberately left unstripped.
- `/parallelize` command — decompose a body of work and fan it out across named, worktree-isolated agents, then converge the results. Opens with a **mandatory capability gate** that reads two things instead of one: the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` flag *and* the live tool surface. Neither alone gives a correct answer — the flag can be set while a server-side gate disables the coordination layer, and `TeamCreate` is absent by design in current harnesses because team lifecycle was folded into the `Agent` tool (`name` + `isolation: "worktree"`, coordinated by `SendMessage`). The gate therefore treats *flag set + `TeamCreate` absent* as the *normal, working* configuration and aborts only when `Agent` itself lacks `isolation`; a command that reported "teams unavailable" on a missing `TeamCreate` would be reporting a harness upgrade as an outage. Also encodes: decomposition by **who can execute a step** (a stream whose central step needs a human — reading a credential's value, changing a provider setting — becomes its own agent producing *artifacts rather than actions*), per-agent worktree isolation with disjoint file ownership, `shutdown_request` via `SendMessage` rather than `TaskStop`, Opus-or-inherit for subagents, and the 3-4x cost check that makes "don't parallelize this" a valid outcome.

### Fixed
- Two advertised counts had drifted apart from the directory and from each other.
  `README.md` said **`### Commands (30)`** while its table listed 33 and
  `commands/` held 36; `marketplace.json` said 35. Three commands had no row at
  all — `resolve-open-questions` (the sibling `/explain` cites), `postmortem`,
  and `handover-pr`. Heading, table, marketplace and directory now agree at
  **37**, and the agreement is checkable in one command instead of trusted.
- `prod-ops-no-approval` blocked **read-only** commands against any resource whose name contained `prod`. A pure `<tool> services list --project=<name>-prod` was refused, so an inventory sweep came back with that project as its only unverified cell while the non-prod ones filled in normally. The rule matched the resource NAME; it now matches the **verb**. Reads (`list`, `describe`, `get`, `read`, anything not on the mutating block-list) and any command carrying `--dry-run` pass; `create` / `update` / `delete` / `deploy` / `start` / `stop` / `set-*` / `add-*` / `remove-*` and siblings stay blocked with exit 2. The verb condition matches a flag-stripped form of the command, so moving a global flag ahead of the verb no longer changes the verdict. Beyond the nuisance, a guard that blocks reads trains people to route around it, and that habit does not distinguish the read it over-blocked from the write it existed to stop.
- `/implement` Mode B documented `claude --team`, a flag that does not exist — the real one is `--agent-teams` — and framed `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` as what enables parallel execution. Corrected on both counts, with the `TeamCreate`-is-expected-absent note so the next reader does not diagnose a harness upgrade as a broken setup.
- `audit-engine` Stage 0 and `domain-driven-advisor` Step 4 gated fan-out on the agent-teams flag, so a user who declined it was routed to a slower fallback despite the fan-out primitive being fully available. Both now confirm the primitive first (`Agent` with `name` + `isolation`), fan out regardless of the flag, and recommend the flag separately for the coordination layer it actually gates. Declining now costs mid-run coordination, not parallelism. Same reframing applied to the README's "Faster with agent teams" section and the advisor's sample session.

## [1.34.0] - 2026-07-24

Consolidates work that accumulated on `feat/audit-engine-phase2-enforcement` after
`1.30.0` was squash-merged. Four commands and one skill existed locally (and in
installed caches) but had no representation on `main`; this release lands them.

> **Version note.** `1.33.0` was published twice, independently: `main` shipped
> `/handover` on 2026-06-08, while this branch shipped `/handover-pr` on
> 2026-06-15. `main`'s entry is preserved below as the canonical `1.33.0`; the
> branch's content is republished here as `1.34.0`.

### Added
- `/resolve-open-questions` command + skill — sweep a session for open decisions and buried questions, then resolve them in batches via `AskUserQuestion` (recommended option first, trade-off per option), emitting a `decision → action` log and executing without re-asking.
- `/observability-audit` command — a **runtime** audit of whether observability actually works, as opposed to whether it is configured. Where the six `audit-*` families statically inspect a repo, this one queries live systems and measures the **receiver** side: events actually received per emitting surface (a high instrumented-emitter count with a zero received count is the failure signature), whether the configured credential resolves to a live destination in the provider (matchable via secret-digest comparison without ever reading the secret's value), init branches that disable monitoring and continue with only a `console.*` line, alert-channel liveness and ownership, whether any alert fires on the **absence** of an expected outcome rather than only on thrown errors, and whether each alert has ever been demonstrated capable of going red. Encodes the rule *no control is considered deployed until it has been demonstrated capable of going red*.
- `/postmortem` command — post-incident report in the house style.
- `/handover-pr` command — the PR-scoped mirror of `/takeover-pr`. Takeover pulls a teammate's PR toward you; handover packages your own open PR(s) or current-branch work into a structured Slack thread post for someone else to pick up. Complements the broader `/handover` shipped in `1.33.0`: `/handover` hands off any body of work, `/handover-pr` specializes in the PR-context gathering `/takeover-pr` already models.

### Fixed
- `/e2e-test-runner` hardcoded a BDD toolchain in two places (the extract step and the Full Regression strategy), so it could not run in a repo with Playwright/Vitest but no cucumber-js / playwright-bdd. Both now derive `extract_cmd` / `run_cmd` from `meta.runners`, matching Step 2 which already dispatched that way. A project with no BDD extraction step declares no `extract_cmd` and the loop is a no-op.
- `/e2e-test-runner` result output honors `meta.output_dir` (default `results/`), so a caller can redirect results without editing the command.
- `/e2e-test-runner` sample output used a project-specific suite name; now generic.

### Changed
- Advertised component counts corrected across `marketplace.json`: previously `29 commands, 10 skills` against an actual `35 / 11`. Commands are auto-discovered from `commands/*.md`, so the manifest never gated availability — the description was simply misreporting the surface.

## [1.33.0] - 2026-06-08

### Added
- `/handover` command — compose and post (or draft) a structured engineering handover to Slack: hand a body of work (PRs, Linear issues, an incident + root cause, a Draft PR someone else must finish) to a specific teammate for their review/decision. Sibling of `/daily-standup-post-slack`, sharing its house Slack style: `-` bullets (never `•`), hyperlinked PRs/issues, real `<@id|Name>` mentions, Spanish tildes — composed to pass the `slack-unicode-bullets`, `slack-tables-no-codeblock`, and `slack-spanish-tildes` hooks. Adds a verify-don't-remember step (every PR status / base branch / Linear id read fresh, never recalled), one-owner/one-decision framing, and an interactive preview before posting.

## [1.32.0] - 2026-06-03

### Added
- `/audit` meta-dispatcher — runs the full repo-health sweep (all six audit families `SCH → CDC → DDD → ARC → STR → ENF` via `audit-engine`) and delegates the component layer to `atomic-design-toolkit` when installed (composition, not fusion), aggregating one cross-family report.
- `schemas/repo-health-rules.schema.json` — the unified `.repo-health-rules.json` enforcement contract (draft-07): `version`, `enforcementLevel` (`advisory|strict`), and a `families` object keyed by the six namespaces, each an array of `{ id, pattern, message, severity, exemptionMarker }` rules. Superset of `atomic-design-rules.schema.json`. Validated by `repo-health-rules.contract.test.ts`.
- `proposeHookRule` cure-scaffold emitter (`src/audit/cure-scaffold.ts`) — deterministically maps a confirmed `Finding` whose `cure_map` includes `hook` into a `HookRuleProposal` shaped against the rules schema; returns `null` otherwise. This is the foundation of the Phase-2 "hooks first" enforcement step (v1 *proposes* rules; the live PreToolUse/PostToolUse hooks + apply step are Phase-2-later).

## [1.30.0] - 2026-06-02

### Changed
- **README repositioned around `/make-no-mistakes:domain-driven-advisor` as the canonical entry point.** A new "Start here" section sits right after Install (before "What's Inside"), quoting the skill's own description verbatim ("Best first command for a new repo") and listing all six audit families (`SCH`, `CDC`, `DDD`, `ARC`, `STR`, `ENF`) in a single routing table. The deeper teaching section ("Guided repo health") remains as the long-form reference. This makes the front door obvious to a new user without scrolling through the 29-command index first.
- **Marketplace description leads with the advisor.** `marketplace.json` plugin description now opens with "Start with /make-no-mistakes:domain-driven-advisor — the canonical entry point…" instead of burying the audit engine mid-paragraph. Same 29/10/2 component counts (verified: `commands/*.md = 29`, `skills/*/SKILL.md = 10`).

### Notes
- No new commands, skills, or hooks ship in this release — it's a documentation-emphasis pass on top of 1.29.0 (which closed the six-family audit-engine loop). Cut to publish the re-announcement to `#doj-repo-health` and to surface the advisor at the top of the README/marketplace card.

## [1.29.0] - 2026-06-02

### Added
- `/audit-enforcement-hooks` (`ENF`) — the Cure-4 coverage meta-audit: detects absent or misconfigured PreToolUse/PostToolUse enforcement hooks, missing rules config, and structural rules with no hook backing them (closes the detection→enforcement loop). Adds the `findHookCoverageGaps` verifier.

### Changed
- All six audit families are now live in `/domain-driven-advisor` (no more "coming soon"); the `audit-engine` skill description and example session reflect the full family.
- Reconciled the version displays (README `**Version:**` header and `.claude-plugin/marketplace.json`) and refreshed the marketplace command/skill counts.

## [1.28.0] - 2026-06-02

### Added
- `/audit-strangler` (`STR`) — Strangler-Fig migration-health audit for monolith→microservices work (façade, incremental cutover vs big-bang, coexistence, legacy retirement). Adds the `assessStranglerHealth` verifier.

## [1.27.0] - 2026-06-02

### Added
- `/audit-explicit-architecture` (`ARC`) — Explicit Architecture audit (Graça: Hexagonal / Onion / Clean / CQRS); the deterministic core enforces the dependency rule (source dependencies must point inward). Adds the `findDependencyRuleViolations` verifier.

## [1.26.0] - 2026-06-02

### Added
- `/audit-ddd` (`DDD`) — bounded-context boundary audit (cross-context imports, domain purity, ubiquitous-language drift). Adds the `findCrossContextImports` verifier.

## [1.25.0] - 2026-06-02

### Added
- `/audit-contract-drift` (`CDC`) — consumer-driven-contract drift audit (producer↔consumer validation schemas that have silently diverged). Adds the `diffValidationSchemas` verifier.

## [1.24.0] - 2026-06-02

### Added
- **Audit-engine foundation.** Shared report contract (`schemas/audit-report-schema.schema.json` + `references/audit-report-schema.md` — the SSOT), the `audit-engine` skill (hybrid LLM-first detection → deterministic + adversarial verification → cure-mapping → four-target emission), `/audit-schema-drift` (`SCH` — 1NF + DRY duplicated-column detection via `findDuplicatedColumns`), and `/domain-driven-advisor` (guided router that recommends which audit(s) to run, then runs a premortem on the aggregated remediation plan).

### Changed
- README "What's Inside" now links every command and skill to its source file; added the `## Guided repo health: /domain-driven-advisor` teaching section.

## [1.23.0] - 2026-05-29

### Added
- **Six new `inline-db-mutation-*` rules extending the scripts-not-DB
  discipline (`feedback_scripts_not_db.md`) beyond Moodle/SSH to every DB
  CLI.** The pre-existing `ssh-db-mutation` rule only caught
  `gcloud compute ssh ... --command=` with Moodle-flavoured payloads
  (`mdl_`, `scorm_`, `php -r`). This release blocks inline mutations
  across the full surface a developer is likely to reach for:
  - `inline-db-mutation-mysql` — `mysql -e "UPDATE/DELETE/..."`,
    `mysql ... < file.sql`, `mysqldump ... | mysql ...`.
  - `inline-db-mutation-psql` — `psql -c "UPDATE/INSERT/ALTER/CREATE/
    GRANT/REVOKE/REPLACE/RENAME"` and `pg_restore`. Complements the
    existing `destructive-db-ops` rule (which already covers DROP /
    TRUNCATE / DELETE FROM via psql).
  - `inline-db-mutation-sqlite` — `sqlite3 path "<mutation>"`.
  - `inline-db-mutation-mongo` — `mongo|mongosh --eval "db.x.<mutating
    method>(...)"` and `mongorestore`.
  - `inline-db-mutation-redis` — `redis-cli SET / DEL / FLUSHDB /
    FLUSHALL / HSET / HDEL / SADD / SREM / LPUSH / RPUSH / ZADD / ZREM /
    EXPIRE / RENAME / MSET / SETEX / SETNX / INCR / DECR / COPY / MOVE /
    UNLINK / RESTORE / EVAL`.
  - `inline-db-mutation-gcloud-sql` — `gcloud sql import sql|csv|bak` and
    `gcloud sql export sql|csv|bak` (export blocked because PII-bearing
    prod exports also belong in versioned scripts).
- **Shared bypass marker `db-mutation-rule`** across all six rules. A single
  consistent escape token keeps the muscle memory cheap.
- **Per-repo escape hatch via `disable_if_repo_file`.** New optional rule
  schema field: when present, the rule no-ops if a sentinel file with
  that exact name exists in the cwd. The inline-DB-mutation family ships
  with `disable_if_repo_file: .no-make-no-mistakes-db-mutation`, so a
  repo whose entire job is inline DB work can opt out with a one-liner
  (`touch .no-make-no-mistakes-db-mutation`). Hardened path validation
  (filename must match `^[a-zA-Z0-9._-]+$`, cannot be `.` / `..`) prevents
  the runtime lookup from escaping the cwd.

### Fixed
- **Inline-DB-mutation regex bypasses** (Greptile PR #25, P1 + Security):
  - `mysql -e"..."` / `mysql --execute="..."` short/long-option-no-space
    shapes now block (spacing between `-e`/`--execute` and the SQL keyword
    is `[[:space:]]*` instead of `[[:space:]]+`).
  - `psql -c"..."` / `psql --command="..."` short/long-option-no-space
    shapes now block.
  - `mongo --eval "db.x.update(...)"` with whitespace inside the quoted JS
    expression now blocks (regex no longer requires the mutation method to
    live inside a single non-space token after `--eval`). `--eval=` shape
    also covered.
  - `gcloud --project=PROD sql export ...` and other variants with global
    flags between `gcloud` and `sql` now block (regex tolerates
    zero-or-more `--flag[=value]` tokens before the `sql` command group).
    Extended in this release to also cover SPACE-separated global flags
    (`--project my-prod`, `--configuration prod`,
    `--impersonate-service-account svc@example.com`, `--account user@...`,
    `--region us-central1`, etc.) — Greptile re-review on PR #25.
- **`disable_if_repo_file` sentinel walks up to repo root** (Greptile PR
  #25, P1). Previously the lookup only checked `./<sentinel>` in the
  process cwd, so a sentinel placed at the documented location (repo
  root) was ignored whenever the hook fired from any subdirectory. The
  lookup now walks upward looking for a `.git` marker (file or
  directory — worktrees use a file) and resolves the sentinel relative
  to that root, with a cwd fallback for non-git deployments. Added
  `hooks/test-sentinel-walkup.sh` to lock the behavior in CI.

### Changed
- `hooks/lib/eval-rule.sh` honours `disable_if_repo_file` between the
  bypass-marker check and the match-condition loop.
- `scripts/build-rules.mjs` validates the new field's shape at build time
  (same kebab-validation defense-in-depth as `bypass_marker`).
- `hooks/rules/README.md` documents the new field and the per-repo escape
  hatch pattern. README.md "Hooks" section now lists the six rules and
  the bypass marker.

### Notes
- 38 rules total (was 32). Tests pass (210 baseline + new inline-DB cases
  + space-separated Cloud SQL flag cases).
- SELECT-only reads (`SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN`, `KEYS`,
  `GET`, `.find`, `.aggregate`, ...) remain allowed inline. The rules
  only fire on the mutation keyword set per CLI tool.
- Commands that START with `./scripts/`, `bash scripts/`, `./bin/`, or
  `bash bin/` are exempted via `not_pattern` — the principle is
  "versioned scripts: yes; inline one-shots: no". When a wrapper script
  is the invocation surface, the sensitive payload lives in git history.
- Memory ref: `feedback_scripts_not_db.md` (already existed for the
  Moodle-flavoured `ssh-db-mutation` rule; this release simply expands
  the enforcement surface).
- **Parallel-version coordination:** originally claimed `1.17.0`; bumped
  to `1.20.0` after rebasing onto main (which had absorbed 1.17.0–1.19.0),
  then to `1.23.0` after PR #28 (1.21.0), #32 (1.22.0), and #29 merged
  during the rebase window. Used `git merge origin/main --no-edit` per
  policy memory `reference_use_merge_not_rebase_after_team_releases.md`
  (preserves original commit history and avoids re-pushing a rewritten
  branch onto the reviewer's diff).

## [1.22.0] - 2026-05-29

### Added

- **Cure 4b cross-cutting PreToolUse hooks (DOJ-4571).** Three generalized
  hooks distributed via the toolkit so every consumer repo inherits
  cross-cutting defenses, parametrized via a per-repo opt-in config file at
  `.claude/config/cross-cutting-hooks.json`. File absence → all three hooks
  no-op (full backward compatibility). Hooks live in
  `hooks/cross-cutting/` alongside the existing manifest-driven rules:

  - `pre-write-no-cleartext-secret-in-config.sh` — blocks Write/Edit/
    MultiEdit of JSON/YAML/TOML/env config files that introduce
    `${...KEY|SECRET|TOKEN|PASSWORD|...}` placeholders without the
    cure-shape `_FILE` / `_PATH` suffix. Generalized from DOJ-4554's
    openclaw.json-specific version (PR #266 in
    `dojo-agent-openclaw-plugin`).
  - `pre-write-cross-repo-schema-ownership.sh` — blocks new SQL
    migrations for tables not owned by this repo, per a config-driven
    `owned_tables` allowlist + `migration_paths` glob. Empty allowlist
    blocks every migration in the configured paths (the gateway pattern,
    where the repo has no migration pipeline). Generalized from
    DOJ-4554's `pre-write-plugin-side-migration.sh`.
  - `pre-write-version-bump-discipline.sh` — blocks multi-step version
    bumps on any pinned dependency by delegating to a per-repo validator
    script. Each entry in the `version_bumps` array names a file
    pattern, version-extraction regex, and validator script. Old version
    is read from the git HEAD blob; new version from the proposed
    content; both via bash native `=~` matching (avoids sed-delimiter
    clashes with regexes containing `/`).

- **Per-surface `defer_to_local_hook` flag (belt-and-braces).** Repos
  that already have a tighter Cure 4a hook for one of these surfaces
  (currently only `dojo-agent-openclaw-plugin`) set
  `defer_to_local_hook: true` on the matching config block. The 4b hook
  emits an info-stderr and fail-opens; the 4a hook owns enforcement.
  Lets the config block stay live (visible, documented, ready for the
  day 4a is retired) without firing the looser 4b version.

- **Schema:** `schemas/cross-cutting-hooks.schema.json` (JSON Schema for
  editor autocomplete + CI validation).

- **Bypass markers:** three comment leaders accepted (`#`, `//`, `--`)
  so the marker fits whichever syntax the target file uses. Trailing
  terminator class extended to include backslash so JSON-serialized
  embedded newlines (`marker\n...`) don't break detection.

- **Tests:** `hooks/cross-cutting/tests/test-cross-cutting.sh` — 23
  hermetic fixtures (≥7 per hook) spinning up isolated git repos per
  case; wired into `npm run test-hooks` after the manifest-rules block.
  Total runner now reports 248/248 passing.

- **Docs:** `hooks/cross-cutting/README.md` — opt-in walkthrough,
  surface semantics, bypass markers, belt-and-braces with local 4a
  hooks, three-layer rollback (per-surface disable /
  `CLAUDE_DISABLE_PLUGIN_HOOKS` / plugin pin), fail-open invariants.

### Changed

- `hooks/hooks.json` description updated to surface the new
  `hooks/cross-cutting/` directory alongside `hooks/rules/` and
  `hooks/atomic/`.
- `hooks/hooks.json` PreToolUse `Write|Edit|MultiEdit|NotebookEdit`
  block now registers the 3 cross-cutting scripts AFTER `pre-edit.sh`
  and alongside `hooks/atomic/pre-atomic.sh` (manifest-driven rules run
  first; atomic-design and cross-cutting hooks layer on as siblings).
- `package.json` `files[]` adds `schemas/` and `references/` so the
  JSON Schemas and example configs ship in the npm package (also
  benefits `schemas/atomic-design-rules.schema.json` and
  `references/atomic-design-rules.example.json` from 1.21.0).

### Notes

- Originally targeted `1.20.0` (per the parallel-version note in 1.21.0);
  PR #28 landed first as 1.21.0, so this rebases onto 1.22.0 to preserve
  monotonic ordering. No semantic content change vs. the originally
  proposed 1.20.0.
- Two review fixes from PR #32 (dojo-code-reviewer): replaced GNU-only
  `sed ... //I` with explicit bracket-class spelling (BSD sed
  compatibility on macOS); switched HIGH_IMPACT_RE / CURE_RE from
  quad-backslash escaping to single-quote-plus-interpolation convention.
- Consumer-repo opt-in (config files in `dojo-os` and
  `dojo-agent-openclaw-plugin`) lands in sibling PRs after `1.22.0`
  publishes. Per DOJ-4571 belt-and-braces decision,
  `dojo-agent-openclaw-plugin` keeps its existing 4a hooks AND opts in
  with `defer_to_local_hook: true` on all three surfaces; `dojo-os`
  opts in with the 4b hooks owning enforcement.
- Refs: DOJ-4571 (this work), DOJ-4554 (Cure 4a foundation), DOJ-4064
  (4-cure thesis), DOJ-4524 (the persistence-freeze incident the
  schema-ownership hook prevents), DOJ-4208 (the cleartext-key incident
  the cleartext-secret hook prevents), DOJ-4061 (the gateway-version-bump
  chain the version-bump hook prevents).

## [1.21.0] - 2026-05-29

### Added
- **Recovered atomic-design ownership-drift hooks** — the code listed in the
  1.14.0 entry was never actually shipped (changelog entry existed without
  corresponding source). This release lands the real implementation:
  - `hooks/atomic/pre-atomic.sh` — PreToolUse enforcement for atomic-design
    pillar ownership: blocks writes to junk-drawer folders, enforces
    canonical folder names (singular/plural), detects cross-pillar imports
    that bypass declared `shared_pillars`, and warns when an atom file
    contains state/effect/query hooks (Brad Frost stateless-atom rule).
  - `hooks/atomic/post-atomic-drift.sh` — PostToolUse drift telemetry scoped
    to the pillar of the file just written: organism count cap, root-flat
    cap, and duplicate-basename detection across pillars.
  - `schemas/atomic-design-rules.schema.json` — JSON Schema for the
    per-repo `.atomic-design-rules.json` config (pillars, canonical_folders,
    junk_drawers, drift_thresholds, exempt_markers).
  - `references/atomic-design-rules.example.json` — starter config that
    reflects the post-DOJ-3946 canonical pillar taxonomy (2026-05-14 audit
    outcome: 9 pillars, `course/` and `courses/` absorbed into `pathways`).
  - `commands/atomic-rules-init.md` — `/atomic-rules-init` slash command for
    bootstrapping atomic-design rules in a target repo.
  - `hooks/atomic/README.md` — operator documentation for both hooks.
  - Wired into `hooks/hooks.json` so consumers get enforcement on plugin
    install with no additional setup beyond placing a config at the repo
    root.
- New section in `skills/spec-recommend/SKILL.md` + anti-examples block
  documenting the recovered atomic-design lineage.

### Notes
- Pillar taxonomy in `references/atomic-design-rules.example.json` matches
  the canonical 9-pillar list established by the DOJ-3946 council in the
  2026-05-14 audit (pathways, launchpad, community, projects, marketplace,
  hackathons, events, agent, dojo-score, plus platform as the shared pillar).
  The example only enumerates a subset; consumers configure their own list.
- **Parallel-version coordination:** version `1.20.0` was originally
  reserved for the DOJ-4571 Cure 4b cross-repo hooks PR. PR #28
  (this release) landed first as `1.21.0`; DOJ-4571 followed as
  `1.22.0` to preserve monotonic ordering. See `[1.22.0]` above.

## [1.19.0] - 2026-05-26

### Added
- New hook: `hooks/pre-bash-stale-push.sh` (warn-only). Fires when a Bash
  tool call is a force-push (`git push --force-with-lease`, `--force`, or
  `-f`) AND the current `HEAD` is more than 5 commits behind the resolved
  base (preferring `origin/HEAD`, falling back to `develop` → `main` →
  `master`). Emits a multi-line stderr warning with a copy-pasteable
  three-line rebase recipe. Never blocks — the hook always exits 0.
  Threshold tunable via `MAKE_NO_MISTAKES_STALE_THRESHOLD` env var. Wired
  into `hooks/pre-bash.sh` after the kill-switch check so
  `CLAUDE_DISABLE_PLUGIN_HOOKS=1` disables it alongside everything else.
- New section in `skills/review-open-prs/SKILL.md`: **My PRs — Stale
  Branches (Drift Risk)**. Surfaces PRs that are >5 commits behind base
  AND have failing CI checks, separately from real CI bugs. Includes a
  matching **Action 2a** in the report's Suggested Course of Action that
  proposes a batched rebase before drilling into the failures —
  drift-induced failures often resolve themselves on rebase, and isolating
  them up front prevents wasted investigation cycles.
- 6 new hook tests in `hooks/test-hooks.sh` covering the stale-push hook
  (non-push silent, in-threshold silent, stale warns, --dry-run skipped,
  -f short form detected, non-force-push silent). Tests are hermetic —
  each spins up a throwaway upstream + local clone in `mktemp -d`.

### Motivation
- **2026-05-20 incident**: DOJ-4134 atomic migration moved
  `src/components/agent/ChatWidget.tsx` → `src/components/agent/organisms/ChatWidget.tsx`
  and updated a Vitest fixture in the same atomic merge. PRs in `dojo-os`
  that were cut from `develop` BEFORE that merge (#2105 DOJ-4135 accordion,
  #2107 VerificationBanner /home suppression, #1713 welcome flow) each kept
  the old test path, so their next CI run failed with
  `ENOENT: src/components/agent/ChatWidget.tsx`. Diagnosis took ~10 minutes
  per PR. Fix was always the same 30-second rebase + force-push-with-lease.
  This release surfaces that drift proactively (hook) and retroactively
  (skill section) so the pattern never has to be diagnosed again.

## [1.18.0] - 2026-05-26

### Added
- **New command `/make-no-mistakes:gemini-code-review`** + worker
  `scripts/gemini-code-review.sh`. A cost-optimized first-pass code review: the
  heavy diff-reading runs on **Gemini 3.5 Flash** (one-shot via a transient
  liteLLM proxy), then the orchestrator (on a Claude model) curates the findings
  against the local repo's `CLAUDE.md`. **Design B** — no nested Claude Code
  agent runs on Gemini, so there is no tool-call-translation fragility. Repo-
  agnostic: base branch auto-detected (`origin/HEAD` → `develop`/`main`/`master`),
  the rubric is generic, and the curation layer adds repo specifics. Secret
  handling via the plugin's own `/secret-input` + `/secret-use` so
  `GEMINI_API_KEY` never leaks into logs.

### Notes
- **Parallel-version coordination:** the `andres/stale-push-hook` branch also
  claims `1.18.0`. Whichever merges first keeps `1.18.0`; the other rebases onto
  the updated `main` and bumps to `1.19.0`.

## [1.17.0] - 2026-05-25

### Added
- **New PreToolUse rule `warn-greptile-review-extraction-by-created-at`
  (Bash).** Warns when a command extracts Greptile review state from
  `gh api .../comments` using chronology-based patterns that silently
  return stale data on re-reviews. The motivating bug (verified twice,
  most recently CIV-728 PR #114 forensic 2026-05-25): Greptile App
  EDITS the same review comment in-place on each re-review, so
  `comment.created_at` is frozen at original posting and only
  `comment.updated_at` moves. Three buggy patterns now trigger the
  warning:
  - `sort_by(.created_at)` / `select` on `.created_at` inside a jq
    expression over Greptile comments.
  - `greptile` + `head -N` / `tail -N` on the same command (implicit
    chronology assumption — "first match wins").
  - `capture("/commit/(?<sha>[0-9a-f]+)")` over a Greptile body — grabs
    the FIRST `/commit/` URL anywhere in the body (often a permalink
    quoted inside a finding), not the authoritative
    `<sub>Last reviewed commit: ...(commit/HASH)</sub>` footer hash.

  The rule's warning message paste-includes the corrective pattern:
  pull HEAD via `gh pr view --json headRefOid`, filter Greptile
  comments to those whose `Last reviewed commit:` footer matches HEAD,
  then `sort_by(.updated_at) | last`. Action is `warn` (not `block`)
  — there are legitimate reasons to look at creation order (e.g.
  auditing posting cadence). Bypass marker:
  `greptile-extraction-acknowledged`.

  Memories: `feedback_greptile_match_head_not_chronology.md`,
  `feedback_tail_with_desc_ordering.md`.

## [1.16.0] - 2026-05-20

### Added
- **Three new rules in `spike-recommend` (Rules 11, 12, 13) from the
  DOJ-4200 + DOJ-4075 canonical-URL migration session in `dojo-os`
  (2026-05-20).** Briefs touching URL canonical migrations or coexisting
  with an in-flight PR must now satisfy:
  - **Rule 11 — Predict semantic conflicts, not just file conflicts.**
    When a brief references an in-flight PR, the "Known Pitfalls" /
    "Technical Constraints" sections must enumerate the SEMANTIC contracts
    both PRs touch (URL shapes, type signatures, state schemas, edge
    function payload shapes, event names) — not just file paths. The
    motivating bug: a subagent on DOJ-4075 predicted "7 shared files will
    conflict" with DOJ-4200; the actual file conflict count was close (6),
    but the real drift was semantic — DOJ-4200's canonical URL shape vs
    DOJ-4075's forum URL builders silently diverged with zero file overlap.
  - **Rule 12 — Verify URL-builder output matches the declared Route mount.**
    When a brief covers a URL canonical migration, Acceptance Criteria must
    include an explicit `matchPath` check that `buildXxxUrl(...)` output is
    reachable via its declared `ROUTES.X` template. Reference test:
    `src/utils/__tests__/url-builders-match-routes.test.ts` in `dojo-os`.
    The motivating bug: Greptile P1 on DOJ-4200 (commit `dbd8a1d04`) —
    `courseBasePath = '/pathways/:slug'` produced URLs like
    `/pathways/X/Y/workbook` that had NO matching `<Route>` mount.
  - **Rule 13 — Use `useAuth().isAuthenticated` for chrome decisions, not
    URL-prefix string detection.** Briefs that propose auth-aware page
    chrome must require `useAuth()` branching inside a single wrapper
    component (the PathwaysPage / PathwayDetailPage pattern), not a
    `PUBLIC_*_ROUTE_PREFIXES` string list. The motivating bug: DOJ-4200's
    first attempt put `/pathways` in `PUBLIC_COURSE_ROUTE_PREFIXES` and
    made every visitor — authed and anon — see the public layout, losing
    the app shell for authed users on the canonical pathway-course URL.
    Fix in `dojo-os` commit `dbd8a1d04`.
- **`implement-advisor` CHANGELOG note** flagging that the redaction-quality
  gate is no longer sufficient on its own for canonical-URL migration
  issues with in-flight overlap — the brief must also satisfy spike-recommend
  Rules 11 + 12 to be considered "implementation-ready".

### Notes
- These rules complement the parallel `dojo-os` PR
  (`andres/canonical-url-lessons-hooks`) which adds:
  - `.claude/hooks/pre-write-routes-yaml-canonical.sh` — pre-write hook
    blocking `content_types.<X>.canonical: /app/...` (the canonical URL
    must never carry the legacy `/app/` prefix per the DOJ-4064 thesis).
  - `src/utils/__tests__/url-builders-match-routes.test.ts` — Vitest test
    asserting every `buildXxxUrl` reaches its declared route template via
    `matchPath`. This is the reference implementation cited by Rule 12.
- Defense-in-depth (DOJ-4064 three-layer drift thesis, Cure 4):
  - **Toolkit level (this PR)** — cross-repo enforcement; any toolkit
    consumer that runs `/spike-recommend` for a canonical-URL migration
    gets the gates above embedded in the brief.
  - **Repo level (parallel `dojo-os` PR)** — local hook + Vitest test
    enforce the same contracts in the dojo-os repo even if this toolkit
    isn't installed.

## [1.15.0] - 2026-05-14

### Added
- New rule: `warn-version-readme-changelog-sync` (Tier 2 — warn). Fires on
  `Write` / `Edit` / `MultiEdit` to `package.json`, `plugin.json`,
  `marketplace.json`, `.claude-plugin/plugin.json`, or
  `.claude-plugin/marketplace.json` when the written content includes a
  `"version": "X.Y.Z"` field, and warns the agent to also update `README.md`
  (the visible `Version:` line) and `CHANGELOG.md` in the same change. Closes
  the gap PR #21 exposed: the toolkit shipped 1.1.0 → 1.14.0 with no visible
  version surface (no README line, no CHANGELOG, no git tags); without this
  rule the same drift would reappear on every future bump. Bypass marker:
  `version-readme-changelog-sync`.

### Notes
- Defense-in-depth (DOJ-4064 three-layer drift thesis, Cure 4):
  - **Toolkit level (this PR)** — cross-repo enforcement; any consumer of
    the toolkit inherits the rule and gets the warning on every manifest bump.
  - **Repo level (parallel `dojo-os` PR)** — local `PostToolUse` hook
    `.claude/hooks/post-write-version-readme-sync.sh` enforces the same
    invariant in the dojo-os repo even if this toolkit isn't installed.
- Dogfooding: this version itself is being shipped via the rule it adds —
  `README.md` "Version" line and `CHANGELOG.md` entry are updated alongside
  the manifest bumps in the parent commits. If the rule were not warning,
  the 1.15.0 release would already have re-introduced the same drift PR #21
  fixed.
- 32 rules total (was 31). 210 / 210 tests pass.

## [1.14.0] - 2026-05-14

> **Note:** The source files described in this entry were never actually
> committed in 1.14.0 — only the version bump and keyword changes landed.
> The implementation was recovered and shipped in **1.21.0** (see entry
> above). Treat this entry as the intent record; treat 1.21.0 as the
> shipped record.

### Added
- Atomic-design enforcement hooks: `hooks/atomic/pre-atomic.sh`,
  `hooks/atomic/post-atomic-drift.sh` — per-repo PreToolUse + PostToolUse
  enforcement to prevent atomic-design ownership drift across pillars
  (DOJ-4064 Cure 4b, cross-repo cure).
- Schema: `schemas/atomic-design-rules.schema.json`.
- Slash command: `/make-no-mistakes:atomic-rules-init` for bootstrapping
  atomic-design rules in a target repo.
- New keywords on `plugin.json` + `marketplace.json`: `atomic-design`,
  `ownership-enforcement`.

### Changed
- `package.json` `files` array now ships `schemas/` and `references/` so the
  hooks framework has everything it needs at install time.
- Bumped `plugin.json` 1.11.0 → 1.14.0 and `marketplace.json` 1.12.0 → 1.14.0
  to align with `package.json` (pre-existing drift between the three manifests).

## [1.12.0] - 2026-05-13

### Added
- `/make-no-mistakes:implement` now enforces HITL (human-in-the-loop) checkpoints
  for push, PR open, merge, Linear → Done, and worktree cleanup — each step
  requires explicit per-action approval rather than blanket authorization
  ([PR #20](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/20)).
- Tracker-canonical brief generation: the sidebar (Labels / Properties / Branch)
  is the single source of truth for metadata; issue body is canonical only for
  narrative ([PR #20](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/20)).

### Skipped
- `1.13.0` — intentionally skipped, no commit ever carried this number.

## [1.11.0] - 2026-05-10

### Added
- New rule: `warn-bash-mutation-without-leading-cd` — warns when a Bash call
  starting with a state-mutating command is missing a leading `cd` (catches the
  bare-`git`-in-wrong-cwd footgun)
  ([PR #19](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/19)).

## [1.10.0] - 2026-05-10

### Added
- 6 Tier 2 discipline rules in `hooks/rules/rules.yaml`
  ([PR #18](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/18)).

### Changed
- Hook rule schema extended with `old_string` matcher field for Edit-tool rules
  ([PR #18](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/18)).

## [1.9.0] - 2026-05-10

### Added
- 5 anti-foot-shoot block rules (Tier 1) in `hooks/rules/rules.yaml`
  ([PR #17](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/17)).

## [1.8.0] - 2026-05-09

### Added
- New rule: `warn-curl-mutating-supabase-rest` — blocks raw `curl` mutations
  against the Supabase REST API in favor of migrations
  ([PR #16](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/16)).

## [1.7.0] - 2026-05-09

### Added
- 4 migration-discipline PreToolUse rules in `hooks/rules/rules.yaml`
  ([PR #15](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/15)).

## [1.6.0] - 2026-05-09

### Added
- `/make-no-mistakes:implement` makes OpenSpec mandatory when configured
  (Phase 0 enforcement) ([PR #13](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/13)).
- 4 design-system PreToolUse rules in `hooks/rules/rules.yaml` (DOJ-3924) —
  shipped on the 1.5.0 line but bundled here for completeness; the version bump
  to 1.6.0 happened in PR #13 immediately after
  ([PR #14](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/14)).

## [1.5.0] - 2026-05-05

### Added
- Manifest-driven PreToolUse + PostToolUse hooks framework — declarative
  `hooks/rules/rules.yaml` + `scripts/build-rules.mjs` build step + 10 Tier 1
  rules at launch (covers SSH+DB, manual prod, minified build, secret leaks,
  Slack format, etc.) ([PR #9](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/9)).

## [1.4.1] - 2026-05-05

### Changed
- Genericize toolkit examples — strip Dojo-specific references from
  user-facing skill prompts and command docs so the toolkit installs cleanly
  in any org ([PR #8](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/8)).

### Added (shipped on the 1.4.0 line, before this version bump)
- `/premortem` command + premortem skill — runs a "already failed 6 months
  from now" exercise and produces a revised plan with blind spots exposed
  ([PR #12](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/12)).

## [1.4.0] - 2026-04-27

### Added
- `/prioritize` command — MoSCoW + RICE-adapted prioritization for issues
  within a pillar.
- Cross-platform `/secret-input` stash — OS-native GUI prompts
  (Linux zenity/kdialog/pinentry, macOS osascript, Windows Get-Credential)
  with mode-0600 staging; values never appear in conversation log or
  terminal history.
- Companion commands: `/secret-use` (run one command with stashed secret as
  env var) and `/secret-clear` (wipe via shred/rm -P/random-overwrite)
  ([PR #7](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/7)).

## [1.3.1] - 2026-04-17

### Added
- Forward-compat `priority` frontmatter field on commands (no-op for now,
  documents intent for future ordering work)
  ([PR #6](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/6)).

## [1.3.0] - 2026-04-17

### Added
- `/make-no-mistakes:implement` documents inline sub-agent dispatch as the
  primary parallelization mode (over worktrees + agent teams for cheap
  parallel reads) ([PR #5](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/5)).

## [1.2.2] - 2026-04-12

### Added
- Label validation rules on `spike-recommend`, `spec-recommend`, and
  `linear-projects-setup` — catches stale/missing Linear labels before they
  cause downstream confusion.

## [1.2.1] - 2026-04-12

### Added
- `implement-advisor` skill — auto-suggests `/make-no-mistakes:implement`
  when the user describes Linear-issue-style work in natural language.

## [1.2.0] - 2026-04-06

### Added
- `/e2e-test-preview` command — launches a Qt-based (PySide6) visual previewer
  for `test-suite.json` files with interactive filtering, detail pane, and
  CSV export.

### Fixed (shipped on the 1.2.0 line)
- `/daily-standup-*` commands always read/write from `~/Escritorio` without
  exceptions (rolled back the previous `~/Desktop` localization).
- `slack-config.example.json` recreated without the `standupFile` key
  (which had moved to a different config layer).

## [1.1.0] - 2026-03-30

### Added
- Initial release of the `make-no-mistakes-toolkit` Claude Code plugin.
- Slash commands at launch: `/implement`, `/rebase`, `/takeover-pr`,
  `/daily-standup-*`, `/remind`, `/goodmorning`, `/goodnight`, `/summarize`,
  `/pending-left`, `/e2e-test-builder`, `/e2e-test-runner`, `/pentest-runner`,
  `/linear-projects-setup`, and others.
- Mandatory new branch + worktree enforcement for every issue worked through
  `/make-no-mistakes:implement`.
- `slack-config.example.json` template for the standup commands.
- Installation routes: `claude plugin marketplace add DojoCodingLabs/make-no-mistakes-toolkit`
  for Claude Code, and `npx @lapc506/make-no-mistakes install` for OpenCode.

### Fixed (shipped on the 1.1.0 line)
- Correct plugin install instructions and update docs
  ([PR #1](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/1)).
- `/takeover-pr` command for picking up teammate PRs in a specific repo
  ([PR #2](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/2)).
- `/takeover-pr` added to README; `/goodmorning` + `/goodnight` localized to
  English ([PR #3](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/3)).

### Documented (shipped on the 1.2.2 line)
- Product Owner Extension (SPOPC) roadmap section in README
  ([PR #4](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/pull/4)).

[Unreleased]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/compare/v1.35.0...HEAD
[1.35.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.35.0
[1.34.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.34.0
[1.33.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.33.0
[1.32.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.32.0
[1.30.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.30.0
[1.29.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.29.0
[1.28.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.28.0
[1.27.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.27.0
[1.26.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.26.0
[1.25.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.25.0
[1.24.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.24.0
[1.23.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.23.0
[1.22.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.22.0
[1.21.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.21.0
[1.14.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.14.0
[1.12.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.12.0
[1.11.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.11.0
[1.10.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.10.0
[1.9.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.9.0
[1.8.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.8.0
[1.7.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.7.0
[1.6.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.6.0
[1.5.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.5.0
[1.4.1]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.4.1
[1.4.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.4.0
[1.3.1]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.3.1
[1.3.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.3.0
[1.2.2]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.2.2
[1.2.1]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.2.1
[1.2.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.2.0
[1.1.0]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/releases/tag/v1.1.0

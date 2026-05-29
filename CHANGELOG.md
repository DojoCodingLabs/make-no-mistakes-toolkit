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

## [1.20.0] - 2026-05-29

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
  to `1.20.0` after rebasing onto main (which had absorbed 1.17.0–1.19.0).

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

[Unreleased]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/compare/v1.14.0...HEAD
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

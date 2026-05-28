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

[Unreleased]: https://github.com/DojoCodingLabs/make-no-mistakes-toolkit/compare/v1.21.0...HEAD
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

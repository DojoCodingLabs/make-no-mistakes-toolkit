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

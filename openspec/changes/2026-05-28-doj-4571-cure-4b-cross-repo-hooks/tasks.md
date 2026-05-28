# Tasks — Cure 4b cross-repo hooks (DOJ-4571)

## Toolkit (this PR)

- [ ] Create `hooks/cross-cutting/` directory with:
  - [ ] `README.md` (config schema, enablement, override semantics, rollback)
  - [ ] `lib/jq-input.sh` (shared `TOOL_NAME` / `FILE_PATH` / `PROPOSED` extractor)
  - [ ] `lib/load-config.sh` (consumer-repo config loader with fail-open)
  - [ ] `pre-write-no-cleartext-secret-in-config.sh`
  - [ ] `pre-write-cross-repo-schema-ownership.sh`
  - [ ] `pre-write-version-bump-discipline.sh`
- [ ] Create `schemas/cross-cutting-hooks.schema.json` (JSON Schema for
      consumer-repo config)
- [ ] Extend `hooks/hooks.json` to register the 3 new scripts under
      PreToolUse `Write|Edit|MultiEdit` (registered AFTER existing
      `pre-edit.sh` so manifest-driven rules fire first)
- [ ] Create `hooks/cross-cutting/tests/test-cross-cutting.sh` with
      ≥5 fixtures per hook
- [ ] Wire `test-cross-cutting.sh` into `hooks/test-hooks.sh`
- [ ] Update `package.json` `"files"` array if needed (verify `hooks/`
      already covers `hooks/cross-cutting/` and `schemas/` is included)
- [ ] Bump `package.json` + `.claude-plugin/plugin.json` from
      `1.19.0 → 1.20.0`
- [ ] Append `[1.20.0]` entry to `CHANGELOG.md`
- [ ] Update `README.md` version line if it references the version
- [ ] Run `npm run build` (toolkit lib build)
- [ ] Run `npm run test-hooks` (must include the new tests)
- [ ] Commit (Conventional, scope `hooks`), push, open PR targeting `main`
- [ ] Tag dojo-code-reviewer with `@dojo-code-reviewer review`
- [ ] Loop until reviewer 5/5
- [ ] HITL gate: `pr-open-state` — request user approval before merging
- [ ] `gh pr merge --squash --delete-branch` after approval

## Consumer-repo enablement (sibling PRs, after toolkit PR merges)

These are tracked under DOJ-4571 acceptance ("At least 2 repos consuming
the toolkit hooks") but live in their own PRs in their own repos.

### `dojo-os` PR

- [ ] Add `.claude/config/cross-cutting-hooks.json` with:
  - `cleartext_secrets.enabled: true` (built-in defaults sufficient)
  - `schema_ownership.enabled: true`, `owned_tables: [<every table in
    supabase/migrations>]`, `migration_paths: ["supabase/migrations"]`
  - `version_bumps: []` (no equivalent gateway-pin to discipline)
- [ ] Add doc reference in `docs/repo-health/hooks.md` (or equivalent)
      pointing at the toolkit README
- [ ] Verify by attempting a write of a migration touching an unowned
      table (synthetic test) — hook must block

### `dojo-agent-openclaw-plugin` PR

- [ ] Add `.claude/config/cross-cutting-hooks.json` with:
  - `cleartext_secrets.enabled: true`
  - `schema_ownership.enabled: true`, `owned_tables: []`,
    `migration_paths: ["supabase/migrations"]` (block ANY migration
    write — gateway repo has no pipeline)
  - `version_bumps: [{ file_pattern: "Dockerfile", ... validator_script:
    "scripts/check-openclaw-version-bump.sh" }]`
- [ ] After confirming the toolkit cross-cutting hooks cover the same
      ground, delete the now-redundant local Cure 4a hooks:
  - `.claude/hooks/pre-write-no-cleartext-secret-in-openclaw-json.sh`
    (replaced by toolkit `cleartext_secrets`)
  - `.claude/hooks/pre-write-plugin-side-migration.sh`
    (replaced by toolkit `schema_ownership` with empty `owned_tables`)
  - `.claude/hooks/pre-write-openclaw-version-bump-discipline.sh`
    (replaced by toolkit `version_bumps` entry)
- [ ] Update `docs/repo-health/hooks.md` accordingly

HITL gate before opening these PRs: `cross-repo-rollout` — confirm
coordination strategy (one combined effort vs. staggered, who reviews).

## Acceptance criteria mapping

| AC item | Tracked by |
|---------|------------|
| Design proposal in `openspec/changes/` | this directory |
| 3 generic hooks generalized + tested against ≥2 repo fixtures | `hooks/cross-cutting/*.sh` + tests |
| Per-repo config schema documented | `schemas/cross-cutting-hooks.schema.json` + `hooks/cross-cutting/README.md` |
| ≥2 repos consuming toolkit hooks | dojo-os PR + dojo-agent-openclaw-plugin PR |
| Versioning + rollback documented | design.md "Versioning and rollback" + README |

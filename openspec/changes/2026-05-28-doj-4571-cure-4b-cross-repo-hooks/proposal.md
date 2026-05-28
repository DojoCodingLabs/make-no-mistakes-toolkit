# Proposal — Cure 4b cross-repo hooks (DOJ-4571)

## Why

[DOJ-4554](https://linear.app/dojo-coding/issue/DOJ-4554) shipped **Cure
4a** in `dojo-agent-openclaw-plugin` — 6 PreToolUse hooks lived in the
repo's own `.claude/hooks/` directory, each tightly bound to that repo's
specific schemas (`openclaw.json`, gateway version pins, plugin-side
migration paths).

The 4-cure thesis (per
[atomic-design-drift-thesis](https://dojocoding.slack.com/archives/C0AS5K6U70E/p1778746023651289)
and DOJ-4064) has two write-time layers:

- **Cure 4a (repo-level).** `.claude/hooks/` in each repo, repo-specific
  patterns. Shipped in DOJ-4554.
- **Cure 4b (toolkit-level).** Generic hooks distributed via
  `make-no-mistakes-toolkit` so every repo using the toolkit inherits
  cross-cutting defenses without duplicating bash scripts.

Three of DOJ-4554's six hooks are generalizable beyond the gateway repo:

1. `pre-write-no-cleartext-secret-in-openclaw-json.sh` — block `${*_KEY}`
   / `${*_SECRET}` / `${*_TOKEN}` env-var placeholders that the runtime
   would substitute and write to disk in cleartext. Currently scoped to
   `openclaw.json`; the same anti-pattern applies to any config file the
   runtime templates at boot (Helm values, docker-compose env files,
   K8s ConfigMaps, application-config JSON/YAML/TOML).
2. `pre-write-plugin-side-migration.sh` — block creation of SQL
   migrations in a repo that has no migration pipeline. Currently
   hard-coded to "plugin repo writes any `supabase/migrations/*.sql`";
   the generic form is "this repo doesn't own these tables, don't write
   migrations for them" with a per-repo allowlist of owned schemas.
3. `pre-write-openclaw-version-bump-discipline.sh` — block multi-step
   version bumps (e.g. `v2026.4.10` → `v2026.5.7` in one PR, which
   triggered the DOJ-4061 fix-forward chain). Currently scoped to the
   gateway Dockerfile + `scripts/check-openclaw-version-bump.sh`; the
   generic form is "any pinned dependency in any file, with per-repo
   config naming the validator script".

The remaining 3 hooks (`pre-write-openclaw-catalog.sh`,
`pre-write-openclaw-required-fields.sh`,
`pre-write-persona-injection-tag-contract.sh`) are too repo-specific to
generalize and stay in the gateway repo as 4a hooks.

## What

Ship the 3 generalized cross-cutting hooks via the toolkit's existing
plugin distribution surface. Each repo that consumes the toolkit gets
the hooks for free; per-repo behavior is parametrized through a new
config file consulted at hook-run time.

### Hooks

1. **`hooks/cross-cutting/pre-write-no-cleartext-secret-in-config.sh`**
   Generalized cleartext-secret guard. Triggers on Write/Edit/MultiEdit
   of any config file (JSON, YAML, YML, TOML, env). Blocks high-impact
   secret placeholders (`SERVICE_ROLE`, `JWT_SECRET`, `PRIVATE_KEY`,
   `CLIENT_SECRET`, `ADMIN_TOKEN`, `ENCRYPTION_KEY`, `SIGNING_SECRET`,
   `PASSWORD`) that are not paired with the cure-shape suffix (`_FILE`,
   `_PATH`, `_REF` — extensible via config). Per-repo config names
   additional placeholder patterns to block and extra cure-shape suffixes
   to allow.

2. **`hooks/cross-cutting/pre-write-cross-repo-schema-ownership.sh`**
   Generalized plugin-side-migration guard. Reads
   `.claude/config/cross-cutting-hooks.json` at the consumer repo root
   for the `schema_ownership` block, which declares either
   `owned_tables: ["table_a", "table_b"]` (allowlist; block migrations
   that don't touch any owned table) or `migration_paths: []` /
   `migration_paths: ["supabase/migrations"]` (path scope; block writes
   inside the listed paths when `owned_tables` is empty). Default when
   no config: no-op (preserves backward compatibility for repos that
   haven't opted in).

3. **`hooks/cross-cutting/pre-write-version-bump-discipline.sh`**
   Generalized single-version-step guard. Reads
   `.claude/config/cross-cutting-hooks.json` for the `version_bumps`
   array; each entry names a file pattern (`Dockerfile`,
   `package.json`, etc.), a version-extractor regex, and a validator
   script path. On Write/Edit of a matching file, extracts the old
   version (git HEAD blob), the new version (post-edit content), and
   delegates to the named validator script. Exit 2 from the validator
   blocks. Default when no config: no-op.

### Per-repo configuration

New file at consumer-repo root: `.claude/config/cross-cutting-hooks.json`.

```json
{
  "$schema": "https://raw.githubusercontent.com/DojoCodingLabs/make-no-mistakes-toolkit/main/schemas/cross-cutting-hooks.schema.json",
  "version": 1,
  "cleartext_secrets": {
    "enabled": true,
    "defer_to_local_hook": false,
    "extra_block_patterns": [],
    "extra_cure_suffixes": []
  },
  "schema_ownership": {
    "enabled": true,
    "defer_to_local_hook": false,
    "owned_tables": [],
    "migration_paths": []
  },
  "version_bumps": []
}
```

`version: 1` is mandatory and gates future schema changes. Missing top-level
keys default to `enabled: false` (opt-in per surface).

The `defer_to_local_hook` flag (per-surface, defaults `false`) supports the
**belt-and-braces** coexistence model: when `true`, the 4b hook for that
surface fail-opens with an info-stderr ("local 4a hook covers this surface,
deferring") instead of blocking. This is the explicit escape hatch for repos
that already have a tighter repo-specific 4a hook for the same surface and
don't want the looser 4b version to double-block or diverge. Default `false`
→ both hooks fire (harmless when they agree, which they will by construction
since the 4b hooks are direct generalizations of the 4a sources).

Per-surface entries for `version_bumps` (an array, not an object) carry
`defer_to_local_hook` as a top-level array-sibling key — see
`schemas/cross-cutting-hooks.schema.json` for the full shape.

### Distribution

The hooks live in `hooks/cross-cutting/` inside the toolkit and are
registered in the toolkit's existing `hooks/hooks.json` manifest under
PreToolUse `Write|Edit|MultiEdit`. No consumer-repo `settings.json`
change is required beyond installing the plugin — Claude Code's plugin
hook discovery wires them in automatically. The per-repo config file is
the only opt-in.

### Validation

Apply the new hooks to two consumer repos in the same change cycle to
prove the cross-cutting model:

- `dojo-os` — populate `.claude/config/cross-cutting-hooks.json` with
  `owned_tables: ["chat_sessions", "chat_messages", ...]` so the
  schema-ownership hook fires when the gateway repo (after its config
  is also set) attempts to add a migration for a dojo-os-owned table.
- `dojo-agent-openclaw-plugin` — populate
  `.claude/config/cross-cutting-hooks.json` with `defer_to_local_hook:
  true` for all three surfaces (the gateway's existing 4a hooks own
  enforcement). The config still declares `owned_tables: []`,
  `migration_paths: ["supabase/migrations"]`, and the Dockerfile
  `version_bumps` entry for documentation and for the eventual day
  the 4a hooks are retired — but at PR-time the 4b hooks fail-open
  per the defer flag. The 4a hooks
  (`pre-write-no-cleartext-secret-in-openclaw-json.sh`,
  `pre-write-plugin-side-migration.sh`,
  `pre-write-openclaw-version-bump-discipline.sh`) are KEPT in
  `.claude/hooks/` per the belt-and-braces decision.

The two consumer-repo PRs land **after** this toolkit PR merges and
publishes a new minor version (`1.20.0`). They are tracked as separate
deliverables under DOJ-4571 acceptance.

## Impact

- `hooks/cross-cutting/` — new directory with 3 generic hook scripts.
- `hooks/hooks.json` — new PreToolUse Write/Edit/MultiEdit entries for
  the 3 cross-cutting scripts (registered after the existing
  `pre-edit.sh` dispatcher so manifest-driven rules run first).
- `schemas/cross-cutting-hooks.schema.json` — JSON Schema for the
  per-repo config file (enables editor autocomplete + CI validation).
- `hooks/cross-cutting/README.md` — user-facing docs (enable / disable
  per surface, config examples, override semantics, troubleshooting).
- `hooks/test-hooks.sh` — extend with fixtures for the 3 new scripts
  (positive matches, negative matches, no-config no-op, bypass markers).
- `CHANGELOG.md` — new `1.20.0` entry under `[Unreleased]`.
- `package.json` + `.claude-plugin/plugin.json` — version bump
  `1.19.0 → 1.20.0`.

## Out of scope

- Repo-specific Cure 4a hooks remain in their repos. This PR does not
  delete them from the gateway repo; the toolkit hooks are additive.
- The OpenSpec convention hook (DOJ-3849) stays in `dojo-os` —
  different concern, not generalizable until more repos adopt
  `openspec/changes/`.
- The remaining 3 gateway-specific hooks (catalog,
  required-fields, persona-injection-tag) are not candidates for 4b.
- Consumer-repo enablement PRs (`dojo-os` + `dojo-agent-openclaw-plugin`
  config files) are tracked as sibling PRs after this one merges; this
  PR ships the toolkit-side infrastructure only.

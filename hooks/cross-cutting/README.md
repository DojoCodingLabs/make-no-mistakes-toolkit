# Cross-cutting PreToolUse hooks — Cure 4b (DOJ-4571)

These hooks ship as part of the `make-no-mistakes` toolkit and apply to
every repo that installs the plugin. They are **opt-in per repo** via a
single config file at the consumer-repo root.

| File | Purpose | Surface | Source |
|------|---------|---------|--------|
| `pre-write-no-cleartext-secret-in-config.sh` | Block `${...KEY/SECRET/TOKEN/PASSWORD/...}` placeholders in any JSON/YAML/TOML/env config file that the runtime would substitute to disk in cleartext. | `cleartext_secrets` | Generalized from DOJ-4554 hook of the same family in `dojo-agent-openclaw-plugin`. |
| `pre-write-cross-repo-schema-ownership.sh` | Block new SQL migrations for tables this repo does not own. | `schema_ownership` | Generalized from DOJ-4554 `pre-write-plugin-side-migration.sh`. |
| `pre-write-version-bump-discipline.sh` | Block multi-step version bumps in pinned dependencies by delegating to a per-repo validator script. | `version_bumps` | Generalized from DOJ-4554 `pre-write-openclaw-version-bump-discipline.sh`. |

## Opt-in

Create `.claude/config/cross-cutting-hooks.json` at your repo root. File
absence → all three hooks no-op. Minimal opt-in:

```json
{
  "$schema": "https://raw.githubusercontent.com/DojoCodingLabs/make-no-mistakes-toolkit/main/schemas/cross-cutting-hooks.schema.json",
  "version": 1,
  "cleartext_secrets": { "enabled": true }
}
```

Full example (every surface enabled, every override demonstrated):

```json
{
  "$schema": "https://raw.githubusercontent.com/DojoCodingLabs/make-no-mistakes-toolkit/main/schemas/cross-cutting-hooks.schema.json",
  "version": 1,
  "cleartext_secrets": {
    "enabled": true,
    "defer_to_local_hook": false,
    "extra_block_patterns": ["MY_CUSTOM_TOKEN"],
    "extra_cure_suffixes": ["_REF", "_VOLUME"]
  },
  "schema_ownership": {
    "enabled": true,
    "defer_to_local_hook": false,
    "owned_tables": ["chat_sessions", "chat_messages"],
    "migration_paths": ["supabase/migrations"]
  },
  "version_bumps": [
    {
      "file_pattern": "Dockerfile",
      "version_regex": "openclaw/releases/download/(v[0-9]+\\.[0-9]+\\.[0-9]+)/",
      "validator_script": "scripts/check-openclaw-version-bump.sh",
      "validator_args": [],
      "defer_to_local_hook": false
    }
  ]
}
```

JSON Schema for editor autocomplete + CI validation:
[`schemas/cross-cutting-hooks.schema.json`](../../schemas/cross-cutting-hooks.schema.json).

## How each hook works

### `cleartext_secrets`

Triggers on `Write|Edit|MultiEdit` of any file ending in `.json`,
`.jsonc`, `.yaml`, `.yml`, `.toml`, `.env`, or starting with `.env.`.

Built-in blocked tails (case-sensitive, after optional `[A-Z_]*` prefix
and before optional `[A-Z0-9_]*` suffix):

- `SERVICE_ROLE`
- `JWT_SECRET`
- `PRIVATE_KEY`
- `CLIENT_SECRET`
- `ADMIN_TOKEN`
- `PASSWORD`
- `ENCRYPTION_KEY`
- `SIGNING_SECRET`

Built-in cure-shape suffixes (placeholders ending in these PASS):

- `_FILE`
- `_PATH`

Use `extra_block_patterns` and `extra_cure_suffixes` to extend both
sets. The hook only ADDS to built-ins — there is no removal API; use
the bypass marker for one-off overrides.

### `schema_ownership`

Triggers on `Write` only (`Edit`/`MultiEdit` on existing migrations is
allowed — typical for cleanup/annotation of historical artifacts).
Fires only when `FILE_PATH` lives under one of `migration_paths`
(default `["supabase/migrations"]`) AND ends in `.sql`.

Behavior depends on `owned_tables`:

- `[]` → blocks every match (the gateway pattern: no migrations belong
  in this repo at all)
- `["table_a", ...]` → extracts `CREATE/ALTER/DROP/RENAME TABLE <name>`
  identifiers from the proposed content and blocks if any referenced
  name is not in the allowlist

Conservative SQL parsing: only the four statement types above. Migrations
that only define functions, views, policies, or data are allowed (the
ownership check has no signal to act on).

### `version_bumps`

Triggers on `Write|Edit|MultiEdit` of any file whose basename matches a
configured `file_pattern`. For each match:

1. Extract `OLD_VERSION` from the git HEAD blob via the configured
   `version_regex` (single capture group).
2. Extract `NEW_VERSION` from the proposed content via the same regex.
3. If both extract, differ, and the `validator_script` is executable,
   invoke `<validator_script> <OLD_VERSION> <NEW_VERSION> [extra_args]`.
4. Validator exit codes:
   - `0` → pass
   - `2` → block (the validator's stderr is shown above the hook's block message)
   - any other → warn + fail-open (defense in depth, never block on validator infrastructure)

If `OLD_VERSION` cannot be extracted (e.g. file is new), the hook passes
silently — the rule applies to BUMPS, not introductions.

## Bypass markers

Each hook honors a kebab-case bypass marker matching its surface. Add
the marker as a comment near the offending content:

- `# hook-bypass: cross-cutting-cleartext-secret`
- `# hook-bypass: cross-cutting-schema-ownership`
- `# hook-bypass: cross-cutting-version-bump`

Three comment leaders are accepted so the marker fits whichever syntax
the target file uses:

| Leader | Used in |
|--------|---------|
| `#`    | Bash / YAML / TOML / Python (SQL also accepts this) |
| `//`   | JSON-with-comments / JS / TS / C-family |
| `--`   | SQL / Haskell / Lua |

## Belt-and-braces with local 4a hooks

If your repo already has a tighter `.claude/hooks/`-level 4a hook for
one of these surfaces (the canonical case is
`dojo-agent-openclaw-plugin`), set `defer_to_local_hook: true` on the
matching config block. The 4b hook logs an info-stderr and fail-opens;
the 4a hook owns enforcement. This lets the config block stay live
(visible, documented, ready for the day 4a is retired) without firing
the looser 4b version.

Default `false` → both hooks fire. They produce the same verdict by
construction (4b generalizes 4a) so double-blocks are harmless; the
only user-visible artifact is two stderr blocks instead of one.

## Disabling

Three layers, least to most invasive:

1. **Per surface.** Set `enabled: false` (or omit the key) in the
   per-repo config.
2. **All toolkit hooks for the current shell.** Set
   `CLAUDE_DISABLE_PLUGIN_HOOKS=1` in your environment.
3. **Plugin pin.** Pin the consumer repo to the pre-Cure-4b toolkit
   version (`1.19.0`) in your plugin install command.

A full rollback (delete the config file) is also valid — the hooks
no-op without their config.

## Fail-open invariants

Every hook exits 0 (pass) silently when any of these are true:

- `CLAUDE_DISABLE_PLUGIN_HOOKS=1`
- `jq` not on PATH
- Hook input JSON malformed
- Config file missing
- Config file present but unsupported `version`
- Per-surface `enabled` is false
- Per-surface `defer_to_local_hook` is true (with an info-stderr line)
- `version_bumps`: validator script missing/non-executable

This matches the existing toolkit hook posture (defense in depth, never
a single point of failure).

## Tests

See `hooks/cross-cutting/tests/test-cross-cutting.sh` — invoked by
`npm run test-hooks` alongside the manifest-driven `rules.json` tests.
Coverage: ≥5 fixtures per hook (block on positive, pass on negative,
no-op when disabled, no-op when config missing, bypass marker honored).

## Reference

- DOJ-4571 — this work (Cure 4b)
- DOJ-4554 — Cure 4a foundation in `dojo-agent-openclaw-plugin`
- DOJ-4524 — 15-day persistence-freeze incident that motivated the
  schema-ownership hook
- DOJ-4208 — service-role key cleartext-leak incident that motivated
  the cleartext-secret hook
- DOJ-4061 — gateway version-bump fix-forward chain that motivated
  the version-bump hook
- DOJ-4064 — 4-cure thesis

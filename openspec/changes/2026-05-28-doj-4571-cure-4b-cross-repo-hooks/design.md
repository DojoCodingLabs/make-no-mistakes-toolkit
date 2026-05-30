# Design — Cure 4b cross-repo hooks (DOJ-4571)

## Architecture decision: standalone scripts vs. rules.yaml entries

The toolkit currently has two parallel hook surfaces:

1. **Manifest-driven rules** in `hooks/rules/rules.yaml` →
   `rules.json`, evaluated by `hooks/pre-bash.sh` / `pre-edit.sh` /
   `post-slack.sh` via the shared `lib/eval-rule.sh` regex engine.
2. **Standalone hook scripts** in `hooks/atomic/` (`pre-atomic.sh`,
   `post-atomic-drift.sh`) — purpose-built scripts registered directly
   in `hooks/hooks.json` for behavior that the regex manifest cannot
   express (reading `.atomic-design-rules.json`, walking the file tree,
   etc.).

The 3 DOJ-4554 hooks have different fits:

| Hook | Stateful needs | Best fit |
|------|----------------|----------|
| no-cleartext-secret | Regex match on file content + optional config-driven extra patterns | **Standalone** (config-aware) |
| schema-ownership | Reads per-repo `owned_tables` allowlist; matches against migration SQL content | **Standalone** (config-driven) |
| version-bump-discipline | `git show HEAD:Dockerfile` to extract old version, delegates to repo-local validator script | **Standalone** (git + subprocess) |

All three need the per-repo config file mechanism, which `rules.yaml`
does not have (`rules.yaml` rules are global — the same regex fires
identically everywhere). The build-time `.private/substitutions.json`
substitution mechanism in `rules.yaml` is the closest analog, but it
substitutes a single literal at toolkit-package build time, not at hook
runtime from the consumer-repo's filesystem. That's the wrong direction
of customization for Cure 4b.

**Decision:** Ship the 3 hooks as standalone scripts in
`hooks/cross-cutting/`, register them in the existing `hooks/hooks.json`
manifest, and consult `.claude/config/cross-cutting-hooks.json` at the
consumer-repo root at hook-run time.

This mirrors the `hooks/atomic/` pattern that's already in production
in the toolkit. No new architecture is introduced — just a third
sibling directory next to `atomic/` and `rules/`.

## File layout

```
hooks/
├── atomic/                             (existing)
├── rules/                              (existing)
├── lib/                                (existing — shared helpers)
├── cross-cutting/                      ← NEW
│   ├── README.md
│   ├── lib/
│   │   ├── load-config.sh              # source the consumer-repo config
│   │   └── jq-input.sh                 # shared jq input parsing
│   ├── pre-write-no-cleartext-secret-in-config.sh
│   ├── pre-write-cross-repo-schema-ownership.sh
│   └── pre-write-version-bump-discipline.sh
├── hooks.json                          (extended)
├── pre-bash.sh                         (unchanged)
├── pre-edit.sh                         (unchanged)
└── post-slack.sh                       (unchanged)

schemas/
└── cross-cutting-hooks.schema.json    ← NEW (JSON Schema)

openspec/changes/
└── 2026-05-28-doj-4571-cure-4b-cross-repo-hooks/   ← this directory
```

## Per-repo config schema

```jsonc
{
  "$schema": ".../cross-cutting-hooks.schema.json",
  "version": 1,                              // mandatory, gates future schema changes

  "cleartext_secrets": {
    "enabled": true,
    "defer_to_local_hook": false,            // belt-and-braces: true → 4b fail-opens, 4a owns
    "extra_block_patterns": [                // each entry is an ERE regex
      "MY_CUSTOM_TOKEN"                      //   appended to the built-in pattern set
    ],
    "extra_cure_suffixes": [                 // values cured by these suffixes pass
      "_REF", "_VOLUME"                      //   defaults already include _FILE, _PATH
    ]
  },

  "schema_ownership": {
    "enabled": true,
    "defer_to_local_hook": false,            // belt-and-braces flag (same semantics)
    "owned_tables": [                        // table names this repo legitimately migrates
      "chat_sessions", "chat_messages"
    ],
    "migration_paths": [                     // path globs treated as migration directories
      "supabase/migrations"                  //   defaults to ["supabase/migrations"] when empty
    ]
  },

  "version_bumps": [                         // each entry: one file under discipline
    {
      "file_pattern": "Dockerfile",          // basename match (supports trailing-component glob)
      "version_regex": "openclaw/releases/download/(v[0-9]+\\.[0-9]+\\.[0-9]+)/",
      "validator_script": "scripts/check-openclaw-version-bump.sh",
      "validator_args": [],                  // optional args passed after old/new versions
      "defer_to_local_hook": false           // belt-and-braces flag (per-entry)
    }
  ]
}
```

### Default behavior when config is missing

- File missing → all three hooks no-op (`exit 0`). This preserves
  backward compatibility for repos that haven't opted in.
- File present but `cleartext_secrets.enabled: false` → that hook
  no-ops; others still run if their respective `enabled: true`.
- `version: 1` mismatch → all hooks log a warning to stderr and no-op
  (fail-open on schema mismatch; never block on infrastructure error).

### Override semantics

Built-in patterns are always active when `enabled: true`. Per-repo
config is purely additive (`extra_block_patterns`, `extra_cure_suffixes`).
We deliberately do NOT support pattern removal — if a consumer needs to
suppress a built-in for a specific edit, they use the bypass marker
mechanism inherited from the existing toolkit rules
(`// hook-bypass: <rule-id>` substring in the proposed content).

### Belt-and-braces: `defer_to_local_hook`

Per Andrés' Phase 0 decision, the 4a hooks in `dojo-agent-openclaw-plugin`
stay in place after Cure 4b ships. To prevent rare divergence between
the tighter 4a hook and the looser 4b hook on the same surface, the
config exposes a `defer_to_local_hook` boolean per surface (and per
entry inside the `version_bumps` array). When `true`:

- The 4b hook for that surface logs an info-stderr message
  (`[<hook>] info: defer_to_local_hook=true; local 4a hook owns this surface in this repo`)
  and `exit 0` immediately after parsing config.
- This happens AFTER the `enabled: true` check, so toggling
  `defer_to_local_hook: true` keeps the config block live (visible,
  documented, ready for the day the 4a hook is retired) without firing
  the 4b enforcement.

When `false` (default), both hooks fire. They produce the same verdict
by construction (4b generalizes 4a) so double-blocks are harmless;
the only user-visible artifact is two stderr blocks instead of one.

## Hook anatomy

Each cross-cutting hook follows this skeleton:

```bash
#!/bin/bash
set -u
HOOK_NAME="pre-write-…-config.sh"
SURFACE="cleartext_secrets"   # which config key gates this hook

source "$(dirname "$0")/lib/jq-input.sh"      # populates TOOL_NAME, FILE_PATH, PROPOSED
source "$(dirname "$0")/lib/load-config.sh"   # populates CONFIG_JSON or empty

# 1. Tool-name filter (Write|Edit|MultiEdit only).
case "$TOOL_NAME" in Write|Edit|MultiEdit) ;; *) exit 0 ;; esac

# 2. Surface-enabled check.
enabled=$(echo "$CONFIG_JSON" | jq -r ".${SURFACE}.enabled // false")
[[ "$enabled" != "true" ]] && exit 0

# 3. File-path filter (per-hook).
# 4. Content extraction (Write.content / Edit.new_string / MultiEdit.edits[]).
# 5. Pattern matching (built-ins + config-extra).
# 6. Block (exit 2) with structured message, or pass (exit 0).
```

**Fail-open invariants:**

- Missing `jq` → warn to stderr, exit 0.
- Malformed config JSON → warn, exit 0.
- Malformed hook input JSON → warn, exit 0.
- Validator script for `version_bumps` missing or non-executable → warn,
  exit 0 (never block on tooling absence).
- Unsupported `version` in config → warn, exit 0.

This matches the DOJ-4554 hooks' fail-open posture (defense in depth,
not a single point of failure).

## Bypass marker convention

Each hook ships a kebab-case bypass marker matching its filename:

- `cross-cutting-cleartext-secret`
- `cross-cutting-schema-ownership`
- `cross-cutting-version-bump`

Adding `# hook-bypass: cross-cutting-cleartext-secret` or
`// hook-bypass: cross-cutting-cleartext-secret` to the proposed
content (in a comment near the offending line) skips that hook for that
write. The marker is searched in the raw tool_input JSON string the
hook reads on stdin, identical to the bypass mechanism in
`hooks/rules/rules.yaml`.

## Versioning and rollback

### Versioning

- This PR bumps the toolkit from `1.19.0` → `1.20.0` (minor — additive
  feature, no breaking change for repos that don't opt in).
- The per-repo config file declares `version: 1`. Future breaking
  changes to the config schema bump that to `version: 2` and the hooks
  fail-open on unsupported versions (warning to stderr).
- The `$schema` link in the config file pins to `main` branch of the
  toolkit repo for editor autocomplete; consumers can pin to a release
  tag for reproducibility.

### Rollback

Three rollback layers, from least invasive to most:

1. **Per-surface disable.** Set `.cleartext_secrets.enabled = false`
   (or any other top-level key) in the consumer-repo config. The hook
   becomes a no-op for that surface only; other surfaces still run.
   Effective on next Claude Code session reload.
2. **Per-hook disable via `CLAUDE_DISABLE_PLUGIN_HOOKS`.** The existing
   toolkit kill-switch (`CLAUDE_DISABLE_PLUGIN_HOOKS=1`) already
   disables all plugin hooks. Cross-cutting hooks honor the same env
   var by exit-0-ing at the top of each script (consistent with
   `pre-bash.sh` / `pre-edit.sh` behavior). Effective for the current
   shell only.
3. **Plugin version pin.** Pin the consumer repo to `1.19.0` (the
   pre-Cure-4b version) in the plugin install command. Effective for
   that repo until the pin is bumped.

A full rollback path (delete the config file) is also valid — the
hooks no-op without their config.

## Test strategy

Extend `hooks/test-hooks.sh` to cover the new scripts. The existing
script is a thin runner that loops over the rule-tests block in
`rules.json`; cross-cutting hooks need a parallel runner because they
don't go through `rules.json`. Approach:

- Add a `test-cross-cutting.sh` script in `hooks/cross-cutting/tests/`
  that drives each script with synthetic stdin and synthetic
  `.claude/config/cross-cutting-hooks.json` fixtures.
- Wire it into `hooks/test-hooks.sh` so `npm run test-hooks` runs both
  manifest tests and cross-cutting tests.
- ≥5 fixtures per hook: (a) blocks on positive match, (b) passes on
  negative match, (c) no-op when config disabled, (d) no-op when
  config file missing, (e) bypass marker honored.

## What NOT to do

- Don't move the existing `hooks/atomic/` scripts into
  `hooks/cross-cutting/` — atomic-design enforcement is a different
  surface (consumes `.atomic-design-rules.json`, not
  `.claude/config/cross-cutting-hooks.json`).
- Don't extend `rules.yaml` to support per-repo config — that's a
  bigger architectural change that breaks the "manifest rules are
  global" invariant.
- Don't ship without the JSON Schema — without it, consumers will
  silently misconfigure (typos in keys, missing required fields).
- Don't auto-create the config file in consumer repos — the file's
  presence is the opt-in signal.

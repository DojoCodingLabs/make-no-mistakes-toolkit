# Proposal — `warn-curl-mutating-supabase-rest`

## Why

`feedback_scripts_not_db.md` mandates that schema and data mutations always go
through versioned migrations or committed scripts — never via ad-hoc `psql`,
the SQL Editor, or direct REST calls against the live Supabase project. The
existing `warn-psql-against-supabase-remote` rule covers the `psql` /
`pg_dump` / `pg_restore` path, but `curl -X POST/PATCH/PUT/DELETE` against
PostgREST (`https://<project>.supabase.co/rest/v1/...`) is an equivalent
escape hatch that the manifest does not yet warn about.

PostgREST mutations:

- bypass the versioned migrations workflow (drift vs other devs' local DBs),
- skip the RLS / role checks the Supabase clients enforce,
- and circumvent the API-client layer in `src/services/api/` that already
  encapsulates the same access pattern.

## What

Add **one new warn-only rule** to the manifest:

```
warn-curl-mutating-supabase-rest
  applies_to: Bash
  match: command contains `curl ... -X (POST|PATCH|PUT|DELETE) ... .supabase.co/rest/v1/`
  action: warn
  bypass_marker: curl-supabase-rest-mutation
  memory_ref: feedback_scripts_not_db.md
```

`GET` requests (read-only inspection) are intentionally not flagged; the rule
targets mutations only.

## Impact

- `hooks/rules/rules.yaml` — append the new rule + ≥5 tests
- `hooks/rules/rules.json` — regenerated artifact
- `hooks/rules/README.md` — extend the "Database / migration discipline"
  family entry to mention the new rule
- 3 manifests bumped `1.7.0 → 1.8.0` (`package.json`, `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json` top-level + nested plugin entry)

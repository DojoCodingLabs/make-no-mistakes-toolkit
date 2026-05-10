# Design — `warn-curl-mutating-supabase-rest`

## Pattern

```
'curl.*-X[[:space:]]+(POST|PATCH|PUT|DELETE).*\.supabase\.co/rest/v1/'
```

Rationale:

- Anchor on the explicit `-X <METHOD>` form. `curl` defaults to `GET`, and
  any author using a mutating method invariably types it as `-X POST` /
  `-X PATCH` / `-X PUT` / `-X DELETE`. (Curl also accepts `--request`, but
  the long form is uncommon enough that we accept the false negative —
  authors using `--request` can be expected to know the rule and self-flag.)
- Match `.supabase.co/rest/v1/` rather than just `.supabase.co` so we don't
  flag mutations against Supabase Auth / Storage endpoints (those have
  separate guidance) or Edge Functions (which are exempt — they're the
  intended outlet).
- Use `i` flag for case-insensitivity on the method names.

## Action

`warn`, not `block`. The rule is a nudge, not a hard stop — there are
legitimate reasons to issue a one-shot REST mutation (e.g. seeding a
local-only fixture, debugging an Edge Function invocation chain). The
`warn-psql-against-supabase-remote` neighbor uses the same severity; they
are the same class of nudge.

## Bypass marker

`curl-supabase-rest-mutation` — kebab-case, unique. Documented as
"hotfix only".

## Test fixtures

Use a **sanitized** Supabase host (`example.supabase.co`) — same convention
as the migration-discipline rules added in PR #15 round-2. Real project
refs would either leak in the public toolkit or trip the IP-leak guard.
Tests required (≥5):

1. `blocks-curl-post-supabase-rest` — POST mutation, expects warn.
2. `blocks-curl-patch` — PATCH mutation, expects warn.
3. `blocks-curl-put` — PUT mutation, expects warn.
4. `blocks-curl-delete` — DELETE mutation, expects warn.
5. `allows-curl-get-supabase-rest` — GET (read), expects allow.
6. `allows-curl-non-supabase` — POST against `example.com`, expects allow.
7. `allows-bypass-marker` — POST + bypass comment, expects allow.

(Test names use the `blocks-*` prefix purely for readability symmetry with
neighboring rules. Action is `warn`, so `expected_exit` is `0` everywhere
and we use `expected_stderr_contains` to assert the warning fired.)

## Why warn, not block

A `block` would frustrate legitimate one-off REST debugging. The author of
`feedback_scripts_not_db.md` is consistent: they prefer a warn for
psql-against-remote (the documented neighbor rule), and the same severity
logic applies here. If repeat offenders surface in code review, we can
escalate the action to `block` in a follow-up PR without changing the
schema.

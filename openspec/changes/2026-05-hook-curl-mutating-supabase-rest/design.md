# Design — `warn-curl-mutating-supabase-rest`

## Pattern (final, after Greptile rounds 1-3)

```
'curl.*((-X[[:space:]]*(POST|PATCH|PUT|DELETE).*\.supabase\.co/rest/v1/)|(\.supabase\.co/rest/v1/.*-X[[:space:]]*(POST|PATCH|PUT|DELETE))|((-d[[:space:]]|--data([[:space:]]|=|-raw[[:space:]]|-raw=|-binary[[:space:]]|-binary=|-urlencode[[:space:]]|-urlencode=)).*\.supabase\.co/rest/v1/)|(\.supabase\.co/rest/v1/.*(-d[[:space:]]|--data([[:space:]]|=|-raw[[:space:]]|-raw=|-binary[[:space:]]|-binary=|-urlencode[[:space:]]|-urlencode=))))'
```

The pattern is a 4-clause alternation that catches every realistic
mutation vector against `<project>.supabase.co/rest/v1/`:

1. **Explicit `-X METHOD`** — `-X[[:space:]]*` covers both `-X POST` and
   the no-space `-XPOST` shorthand. Methods covered: `POST`, `PATCH`,
   `PUT`, `DELETE`. (Round 1 fix.)
2. **URL-before-flag ordering** — `curl <url> -X POST ...` is common in
   shell scripts that build the URL into a variable. The second
   alternation clause catches this. (Round 1 fix.)
3. **Implicit POST via `-d` / `--data` / `--data-raw` / `--data-binary`**
   — curl auto-promotes to POST when these flags are present even
   without `-X`. (Round 2 fix.)
4. **Implicit POST via `--data-urlencode`** — same auto-promotion as
   `-d`, common for form-style payloads. (Round 3 fix.)

Match is narrowed to `.supabase.co/rest/v1/` (PostgREST) so this rule
does NOT fire for Supabase Auth / Storage / Edge Function endpoints —
those have separate guidance and Edge Functions are the intended outlet.

The `i` flag is used for case-insensitivity on the method names.

### Accepted false negatives

- `curl --request POST` — uncommon long form; authors using it are
  expected to know the rule and self-flag.
- `curl -G ... -d ...` — `-G` overrides curl's auto-promotion and forces
  GET; `-d` becomes a query-string. Treating this as a mutation would be
  incorrect.

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

Final tests after Greptile rounds 1+2 (12 cases):

1. `warns-curl-post-supabase-rest` — POST mutation, expects warn.
2. `warns-curl-patch` — PATCH mutation, expects warn.
3. `warns-curl-put` — PUT mutation, expects warn.
4. `warns-curl-delete` — DELETE mutation, expects warn.
5. `warns-curl-xpost-no-space` — no-space `-XPOST` shorthand, expects warn.
6. `warns-curl-url-before-flag` — URL precedes `-X POST`, expects warn.
7. `warns-curl-implicit-post-via-d` — `-d` body without `-X`, expects warn.
8. `warns-curl-implicit-post-via-data-raw` — `--data-raw` body without `-X`,
   expects warn.
9. `warns-curl-supabase-then-d` — URL first then `-d`, expects warn.
10. `allows-curl-get-supabase-rest` — GET (read), expects allow.
11. `allows-curl-non-supabase` — POST against `example.com`, expects allow.
12. `allows-bypass-marker` — POST + bypass comment, expects allow.

Action is `warn`, so `expected_exit` is `0` everywhere and we use
`expected_stderr_contains` to assert the warning fired.

Round-1 Greptile findings closed: `-XPOST` no-space + URL-before-flag
ordering. Round-2 finding closed: implicit POST via `-d` / `--data*` is
also caught.

## Why warn, not block

A `block` would frustrate legitimate one-off REST debugging. The author of
`feedback_scripts_not_db.md` is consistent: they prefer a warn for
psql-against-remote (the documented neighbor rule), and the same severity
logic applies here. If repeat offenders surface in code review, we can
escalate the action to `block` in a follow-up PR without changing the
schema.

# Proposal — Tier 2 discipline warn rules

## Why

Six discipline rules cover the "soft" guidelines from feedback memories
that aren't outright errors but degrade quality if accumulated. Each rule
nudges the author toward the documented pattern without blocking the
operation:

- `feedback_never_delete_debug_logs.md` — debug logs should be env-gated,
  not deleted.
- `feedback_no_time_estimates.md` — plans use sequential ordering, not
  days/sprints.
- `feedback_split_large_prs.md` — PRs over 15 files should split.
- `feedback_no_posthog_nag.md` — alerts should not nag about PostHog
  (Juan's domain, out-of-scope for other POs).
- `feedback_explicit_storage_prefixes.md` — pipelines use originals/ +
  processed/ subdirs, never sibling-suffix.
- `feedback_test_on_staging.md` — QA target is dev.dojocoding.io, not
  localhost.

All six are `warn`, not `block` — the previous PR (#17) covered the hard
"never do this" cases.

## What

Six new rules. Five are `warn`; one (`block-sibling-suffix-storage`) is
`block` because the user's spec was explicit and the storage layout error
is hard to undo once committed:

1. `warn-deletes-console-log` (warn) — Edit/MultiEdit. Detects edits where
   `old_string` contains a debug-logging call. Requires extending
   `parse-input.sh` and `eval-rule.sh` to expose `old_string` as a
   first-class field.
2. `warn-time-estimates-in-plans` (warn) — Edit/Write/MultiEdit on
   `plans/`, `specs/`, `design/`, `openspec/`, `docs/superpowers/`.
3. `warn-pr-create-many-files` (warn) — Bash. Heuristic on `gh pr create`
   that nudges the caller to verify diff size.
4. `warn-posthog-in-alerts` (warn) — Slack. Detects PostHog/dashboard/
   instrumentation mentions in messages.
5. `block-sibling-suffix-storage` (block) — Bash. Catches CLI uploads
   using the discouraged sibling-suffix layout.
6. `warn-localhost-in-pr-body` (warn) — Bash. Detects localhost references
   in `gh pr create --body` / `gh pr edit --body`.

## Impact

- `hooks/lib/parse-input.sh` — add `INPUT_OLD_STRING` extraction (also
  flattening `MultiEdit.edits[].old_string` into a single value).
- `hooks/lib/eval-rule.sh` — add `old_string` case in the field-resolver
  switch.
- `hooks/rules/rules.yaml` — append the 6 new rules + tests
- `hooks/rules/rules.json` — regenerated artifact
- `hooks/rules/README.md` — extend the family list with the new "Tier 2
  discipline (warn)" group, document the new `old_string` field.
- 3 manifests bumped `1.9.0 -> 1.10.0`

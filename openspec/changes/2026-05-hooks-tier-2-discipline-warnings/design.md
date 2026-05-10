# Design — Tier 2 discipline warn rules

## Schema extension: `old_string` field

`warn-deletes-console-log` is the rule that needs to inspect the
`old_string` of an Edit. Today `parse-input.sh` exposes
`tool_input.content` and `tool_input.new_string` (under the same alias
`INPUT_CONTENT`) but not `old_string`.

This PR adds:

- `INPUT_OLD_STRING` extraction in `parse-input.sh` resolving from
  `tool_input.old_string` first, falling back to a join of every
  `tool_input.edits[].old_string` (MultiEdit case) so that a single
  pattern check covers both Edit and MultiEdit.
- `old_string)` case in `eval-rule.sh`.

Both edits are additive — no existing rule references `old_string` in its
`field`, so backward compatibility is intact.

## 1. warn-deletes-console-log

`field: old_string` matches when an Edit removes a line containing a debug
log statement. Pattern covers `console.log(`, `console.debug(`,
`console.error(`, `debug(`, `logger.debug/info/trace(`. Bypass marker
`console-log-deletion-verified` for the documented legitimate flows
(env-gating conversion, post-prod-verification cleanup,
documented-debug-temp).

## 2. warn-time-estimates-in-plans

Two AND-chained conditions:
- `file_path` matching `(plans?/|specs?/|design/|openspec/|docs/superpowers/).*\.md$`.
- `content` matching `\b[0-9]+[[:space:]]*(days?|sprints?|weeks?|d[ií]as?|semanas?|cycles?|ciclos?)\b` with `i` flag.

The dual-language pattern (English + Spanish with optional accented `ía`)
covers the team's bilingual writing.

## 3. warn-pr-create-many-files

Single condition on `command` matching `gh[[:space:]]+pr[[:space:]]+create\b`.
The rule is a heuristic nudge — it cannot count files by itself. The
message instructs the caller to run `git diff --stat <base>..HEAD | tail -1`
before bypassing.

## 4. warn-posthog-in-alerts

`applies_to: [Slack]`. Single condition on `text` matching
`\b(posthog|dashboard|instrumentation)\b` case-insensitive. The Slack
dispatcher is `post-slack.sh` which is `PostToolUse` (warn-only by
construction).

## 5. block-sibling-suffix-storage

`applies_to: [Bash]`. The original spec also listed Edit/Write/MultiEdit,
but those tools have no `command` field — this rule only fires on the CLI
surface (`supabase storage upload`, `gcloud storage cp`, `gsutil cp`)
where the sibling-suffix anti-pattern is a one-liner mistake. The
application-layer storage-uploader code paths are covered by review.

## 6. warn-localhost-in-pr-body

`applies_to: [Bash]`. Two AND-chained conditions on `command`:
- positive: `gh[[:space:]]+pr[[:space:]]+(create|edit).*--body`
- positive: `(localhost|127\.0\.0\.1)`

Both anchored to the same `command` field so the rule only fires when
both substrings co-occur. The `--body-file` form is naturally excluded
(the rule cannot read the body file content, and `--body-file` does not
contain `localhost` literally).

## Test fixtures

≥5 tests per rule, including positive matches, negative matches, and
bypass-marker. Test fixtures use sanitized hosts and paths consistent
with the rest of the manifest.

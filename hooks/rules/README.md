# Rules manifest — contributor guide

This directory holds the **single source of truth** for every rule the
make-no-mistakes hooks enforce.

- `rules.yaml` — humans edit this. One row per rule, atomic fields.
- `rules.json` — generated build artifact. Runtime (`hooks/lib/eval-rule.sh`)
  reads this; never edit by hand.
- `scripts/build-rules.mjs` — `npm run build-rules` regenerates `rules.json`
  and validates schema. CI fails if `rules.json` is stale.

## Schema

Every rule is one YAML row with these fields:

```yaml
- id: <kebab-case-unique>           # required, used to cite the rule
  description: <one-line>           # required, shown in stderr on match
  applies_to: [Bash | Edit | Write | MultiEdit | Slack]   # required, non-empty
  match:                            # required, non-empty array (AND-chain)
    - field: command | file_path | content | text | old_string
      pattern: '<ERE regex>'        # optional; if present, field MUST match
      not_pattern: '<ERE regex>'    # optional; if present, field must NOT match
      flags: i                      # optional; only "i" (case-insensitive) supported
  action: block | warn              # required
  bypass_marker: <kebab-case> | null  # optional acknowledgement token
  disable_if_repo_file: <flat-filename>  # optional per-repo escape hatch (see below)
  memory_ref: <filename>            # optional metadata only — NOT printed at runtime
  message: |                        # required, multi-line stderr output
    Block / warning text shown when this rule fires.
  tests:                            # required, non-empty array
    - name: <kebab-case>
      input:
        tool_input:
          command: '...'           # OR file_path / content / text
      expected_exit: 0 | 2          # 0 = allow / warn; 2 = block
      expected_stderr_contains: '<substring>'  # optional
```

### Match semantics

Conditions in `match` form an **AND-chain**: the rule fires only when ALL
conditions hold. Within a single condition:

- `pattern` and `not_pattern` operate on the same field.
- If both are present, `pattern` must match AND `not_pattern` must NOT match.
- If only `not_pattern` is present, the condition is "this field must NOT
  match this pattern" (no positive requirement).

To express OR across conditions, write multiple rules with the same effect
(e.g., one rule per `applies_to` tool). To express OR within a single
condition, use ERE alternation in `pattern` (e.g., `(php -r|set_config)`).

### Bypass markers

If `bypass_marker: foo-rule`, the rule is skipped when the literal substring
`// hook-bypass: foo-rule` or `# hook-bypass: foo-rule` appears anywhere in
the raw tool_input JSON. Bypasses are explicit acknowledgements — they sit
inside the command/content itself, not as silent flags.

`bypass_marker: null` (or omitted) means the rule cannot be bypassed.

### Per-repo escape hatch (`disable_if_repo_file`)

For rules that are too aggressive in specific repos (e.g., a data-migration
repo whose entire job is to run inline DB mutations), a rule can declare a
sentinel filename. If that file exists in the current working directory when
the hook fires, the rule is a no-op.

```yaml
- id: inline-db-mutation-mysql
  # ...
  disable_if_repo_file: .no-make-no-mistakes-db-mutation
```

Then in the consuming repo, opting out is `touch .no-make-no-mistakes-db-mutation`
at the repo root. Validation: the filename must match `^[a-zA-Z0-9._-]+$` and
cannot be `.` or `..`, so the runtime lookup `[ -f "./<name>" ]` cannot
escape the cwd. Use this sparingly — the bypass marker is preferred when the
escape is per-command rather than per-repo.

## Adding a rule

1. Edit `rules.yaml` — append a new row following the schema.
2. Run `npm run build-rules` to regenerate `rules.json`. Schema errors
   surface at this step (missing fields, invalid action, etc.).
3. Run `npm run test-hooks` to verify your `tests` array passes.
4. Commit both `rules.yaml` AND `rules.json` (CI verifies they're in sync).

## IP-leak guard (opt-in, gitignored)

If the build output says `IP-leak guard active`, you have a local
`.private/forbidden-names.txt` (one regex per line) that the build script
checks against the serialized rules. Use this to prevent committing client
or org names in test fixtures, references, or messages. The list lives
gitignored so the toolkit itself never publishes the names.

Example `.private/forbidden-names.txt`:

```
# One regex per line, # for comments
mycompany
client-acme
client-beta
```

## Per-install substitutions (opt-in, gitignored)

Some rules need values that are specific to your team or environment —
for example, the `block-supabase-db-push-prod` rule guards a Supabase
production project ref that varies per organization. Hard-coding such
values in the public rules.yaml would either leak the value upstream or
leave consumers of this toolkit with a rule that silently never fires.

The build script supports literal-string substitution from a gitignored
`.private/substitutions.json` file. The file is a flat JSON object where
keys are UPPER_SNAKE token names and values are the literal replacement
strings. For each pair, every occurrence of `__TOKEN__` in `rules.yaml` is
replaced before the YAML is parsed, so both the rule patterns and the
test fixtures see the substituted value.

Example `.private/substitutions.json`:

```json
{
  "PROD_SUPABASE_REF": "abcdefghij1234567890",
  "STAGING_SUPABASE_REF": "klmnopqrst0987654321"
}
```

When the file is absent, `__TOKEN__` placeholders remain in `rules.json`
verbatim. The rule still parses and runs; it simply does not fire for any
real-world command (only for commands that happen to contain the literal
placeholder text). This is a deliberately documented inert state — it is
preferable to a silently-broken protection.

Tokens currently consumed by the published rule set:

- `PROD_SUPABASE_REF` — production Supabase project ref, used by the
  `block-supabase-db-push-prod` rule and its test fixtures.
- `STAGING_SUPABASE_REF` — staging Supabase project ref, used as the
  negative-match example in the same rule's test array.

## Rule families

The manifest groups rules into informal families by prefix / domain.
Adding a new family is fine — just keep ids unique and follow the schema.

- **Bash safety** (`ssh-db-mutation`, `gcloud-missing-project`,
  `prod-ops-no-approval`, `destructive-db-ops`, `manual-edge-fn-deploy`)
  — block / warn on dangerous shell invocations.
- **File safety** (`minified-build-output`, `secrets-hardcoded`)
  — block writes of minified build artifacts and hardcoded credentials.
- **Slack style** (`slack-unicode-bullets`, `slack-tables-no-codeblock`,
  `slack-spanish-tildes`) — warn-only formatting nudges.
- **Design System** (`ds-arbitrary-breakpoint`, `ds-deep-ui-import`,
  `ds-arbitrary-fixed-width-in-ds-component`,
  `ds-raw-hex-color-in-source`) — block / warn at write-time when AI
  proposes Edit/Write/MultiEdit changes that violate the Dojo Design
  System contract (preset breakpoints, barrel imports, flexible widths,
  token-only colors). Added in DOJ-3924 as the 4th enforcement layer
  alongside the runtime hook, pre-commit linter, and Storage upload
  validator. See
  [DOJ-3924](https://linear.app/dojocoding/issue/DOJ-3924).
- **Database / migration discipline**
  (`schema-sql-outside-migrations`, `warn-psql-against-supabase-remote`,
  `pr-create-with-migrations-needs-deploy-note`,
  `block-supabase-db-push-prod`, `warn-curl-mutating-supabase-rest`) —
  keep schema mutations inside versioned `supabase/migrations/` files,
  nudge developers away from direct `psql` / `pg_dump` / `pg_restore`
  execution against `*.supabase.co` hosts, remind PR authors to document
  migration deployment, hard-block `supabase db push` aimed at the
  production project ref or `--linked` (which transparently resolves to
  whichever project was last linked, possibly production), and warn on
  ad-hoc mutating `curl` (`POST` / `PATCH` / `PUT` / `DELETE`) against
  the Supabase PostgREST endpoint (drift risk equivalent to direct `psql`
  + RLS bypass — same memory ref `feedback_scripts_not_db.md`). The
  production project ref is configured per install via the substitutions
  mechanism described above (`PROD_SUPABASE_REF` token). Added after a
  discussion surfaced drift between manually-applied SQL and the
  migrations directory when migrations failed to auto-run after a
  teammate's PR merged.

- **Anti foot-shoot (Tier 1)** (`block-playwright-headless`,
  `block-git-force-push-no-lease`, `block-git-rebase-skip`,
  `block-standup-not-in-escritorio`, `block-goodnight-not-in-escritorio`)
  — hard stops on the high-cost mistakes that already burned the team:
  headless E2E runs (a Playwright invocation without `--headed` /
  `--ui` / `--debug` is blocked per `feedback_no_headless.md`), bare
  `git push --force` / `-f` without `--force-with-lease` (silent
  collaborator-push overwrites, per `feedback_resolve_merge_conflicts.md`),
  `git rebase --skip` (silent commit drop, same memory),
  and writes of `daily-standup*.md` / `next-day-*.md` / `goodnight-*.md`
  outside `~/Escritorio` (per the desktop-handoff memories
  `feedback_standup_desktop.md` and `feedback_goodnight_desktop.md`).
  Each rule ships a kebab-case bypass marker for the rare cases where
  the action is intentional and documented.

- **Tier 2 — discipline (warn)**
  (`warn-deletes-console-log`, `warn-time-estimates-in-plans`,
  `warn-pr-create-many-files`, `warn-posthog-in-alerts`,
  `block-sibling-suffix-storage`, `warn-localhost-in-pr-body`) — soft
  guidelines from feedback memories that aren't outright errors but
  degrade quality if accumulated. Each rule nudges the author toward
  the documented pattern without blocking the operation. One exception:
  `block-sibling-suffix-storage` uses `block` because the storage-layout
  error is hard to undo once committed.
  - `warn-deletes-console-log` flags Edits whose `old_string` removes a
    debug-log call (`console.log(`, `console.debug(`, `console.error(`,
    `debug(`, `logger.debug/info/trace(`) per
    `feedback_never_delete_debug_logs.md` — gate via env var, never
    delete.
  - `warn-time-estimates-in-plans` flags writes to plan/spec/design files
    that contain `X days/sprints/weeks/cycles` or their Spanish
    equivalents per `feedback_no_time_estimates.md` — use sequential
    ordering, not calendar dates.
  - `warn-pr-create-many-files` is a heuristic on `gh pr create` that
    nudges the caller to verify the diff has <=15 files before opening
    (`feedback_split_large_prs.md` / DOJ-2482).
  - `warn-posthog-in-alerts` (Slack `applies_to`) flags messages
    mentioning `posthog`, `dashboard`, or `instrumentation` —
    `feedback_no_posthog_nag.md` (Juan owns; out of scope for other POs).
  - `block-sibling-suffix-storage` blocks CLI uploads that use the
    discouraged sibling-suffix layout (`foo.processed.zip` next to
    `foo.zip`); the documented layout uses `originals/` + `processed/`
    subdirs (`feedback_explicit_storage_prefixes.md`).
  - `warn-localhost-in-pr-body` flags `gh pr create` / `gh pr edit`
    invocations whose inline `--body` mentions `localhost` or
    `127.0.0.1` — staging at `dev.dojocoding.io` is the correct QA
    target (`feedback_test_on_staging.md`).

  `warn-deletes-console-log` is the first rule to use the new
  `old_string` field exposed by `parse-input.sh` (see Schema below).

## Tier 2 — decomposing non-deterministic memories

Many narrative-style guidelines can be converted to deterministic rules
using these techniques:

- **T1 Narrative → structural assertion.** "Slack alerts group by project →
  milestone → assignee" becomes a rule that parses the message and asserts
  the labels appear in that order.
- **T2 Scope boundary → path-based block.** "Don't edit X owner's domain"
  becomes a rule with `field: file_path` matching the owner's path glob.
- **T3 Behavioral mandate → Stop-event reminder.** "Never ask 'should I
  continue?'" becomes a Stop hook that scans the recent assistant message
  for stop-asking patterns and surfaces a reminder for the next turn.
- **T4 Preference → linter on alternative.** "Don't use 'refactor' in PR
  titles" becomes a PreToolUse rule on the gh/Linear API that warns when
  the title contains the discouraged word.
- **T5 Fall-through judgment → explicit gate.** "Don't mark complementary
  issues as blocking" becomes a PreToolUse rule on save_issue that, when
  `blockedBy` is set, requires a `blocking_reason:` key in the description.
- **T6 Context-sensitive → structural proxy.** "Filter PostHog from alerts"
  becomes a PostToolUse rule that detects alert-shaped messages (3+ issue
  refs in same body) and warns when posthog/dashboard/instrumentation
  keywords appear.
- **T7 Multi-part → AND-chain of detectors.** Combine path + content +
  exception detectors in `match` to express compound rules.

Use these patterns when proposing new rules — most "soft" guidelines can be
converted to deterministic checks with a structural proxy.

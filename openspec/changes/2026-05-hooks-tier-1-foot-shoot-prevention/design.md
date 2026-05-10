# Design — Tier 1 anti-foot-shoot block rules

## 1. block-playwright-headless

**Pattern**: positive `\bplaywright[[:space:]]+test\b` + negative
`(--headed|--ui|--debug)`.

Two AND-chained conditions: the command must contain `playwright test`
AND must NOT contain any of the three opt-in flags. The `\b` word
boundary on `playwright` prevents matching unrelated names (e.g.
`playwright-extra`, `playwright-cli`).

`npx playwright test`, `pnpm playwright test`, `yarn playwright test`
all match. Bypass marker `playwright-headless-allowed` for documented CI
runs.

## 2. block-git-force-push-no-lease

**Pattern**: positive `git[[:space:]]+push.*(-f\b|--force([[:space:]]|$))`
+ negative `--force-with-lease`.

Note that the positive pattern's `--force([[:space:]]|$)` already excludes
`--force-with-lease` (no space after `--force` in the latter). The negative
clause is a defense-in-depth safeguard for pathological orderings like
`git push -f origin main --force-with-lease`, where the `-f` would match
positively but the `--force-with-lease` correctly aborts the fire.

Bypass marker `git-force-push-bare-allowed`.

## 3. block-git-rebase-skip

**Pattern**: `git[[:space:]]+rebase[[:space:]]+--skip\b`.

Straightforward — `--skip` drops the conflicting commit silently. `--continue`
and `--abort` are the safe alternatives. Bypass marker
`git-rebase-skip-acknowledged` for explicit acknowledgement of data loss.

## 4 + 5. block-{standup,goodnight}-not-in-escritorio

Both apply to `Edit, Write, MultiEdit`. Use `file_path` field with a
positive pattern matching the filename and a negative pattern excluding
`~/Escritorio` / `~/Desktop`:

- standup: `daily-standup.*\.md$` not in `(/Escritorio/|/Desktop/)`.
- goodnight: `(next-day-|goodnight-).*\.md$` not in `(/Escritorio/|/Desktop/)`.

Both rules apply pattern + not_pattern on the same `file_path` condition
(supported by the schema). Bypass markers respectively
`standup-non-desktop-acknowledged` and `goodnight-non-desktop-acknowledged`,
both documented as NOT recommended (the underlying skills always resolve
to `~/Escritorio`).

## Test coverage

Each rule: ≥5 tests including positive matches across realistic
invocations, negative matches that should NOT fire, and bypass-marker.
Total new tests: ~25.

## No schema changes

All 5 rules use existing fields (`command`, `file_path`) and the existing
matcher semantics. No changes to `parse-input.sh`, `eval-rule.sh`, or
the dispatchers.

# Proposal — Tier 1 anti-foot-shoot block rules

## Why

5 deterministic block rules fill important gaps in the manifest where the
existing memories explicitly call for a hard stop, not a nudge. Each rule
maps to a specific `feedback_*.md` memory whose intent is "never do this":

- `feedback_no_headless.md` — playwright must run with a visible browser.
- `feedback_resolve_merge_conflicts.md` — never `--force` push without
  `--force-with-lease`; never `git rebase --skip` (silent commit loss).
- `feedback_standup_desktop.md` + `feedback_goodnight_desktop.md` — the
  daily-standup and /goodnight handoff files always live in `~/Escritorio/`.

The previous PR (PR #16) added one warn rule. This PR adds five **block**
rules covering the foot-shooting class of mistakes that the team has
already paid for in lost work or correction time.

## What

Five new rules in `hooks/rules/rules.yaml`:

1. `block-playwright-headless` — block `playwright test` invocations that
   omit `--headed`, `--ui`, or `--debug`. Bypass marker for explicit CI runs.
2. `block-git-force-push-no-lease` — block `git push --force` (or `-f`)
   without `--force-with-lease`.
3. `block-git-rebase-skip` — block `git rebase --skip`.
4. `block-standup-not-in-escritorio` — block writes to `daily-standup*.md`
   files anywhere except `~/Escritorio` / `~/Desktop`.
5. `block-goodnight-not-in-escritorio` — block writes to `next-day-*.md`
   or `goodnight-*.md` outside `~/Escritorio` / `~/Desktop`.

Each rule ships ≥4 tests covering positive matches, negative matches, and
bypass-marker behavior.

## Impact

- `hooks/rules/rules.yaml` — append the 5 new rules + tests
- `hooks/rules/rules.json` — regenerated artifact
- `hooks/rules/README.md` — extend the family list with the new "Anti
  foot-shoot (Tier 1)" group
- 3 manifests bumped `1.8.0 -> 1.9.0`

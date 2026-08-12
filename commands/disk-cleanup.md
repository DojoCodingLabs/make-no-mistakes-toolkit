---
description: Reclaim disk space in ascending order of risk — docker images first, then worktree node_modules and worktrees via the worktree classifier, with docker volumes listed but never deleted. Reports what was actually freed, measured before/after, never what a tool predicted. Accepts an optional target in GB as $ARGUMENTS.
priority: 80
---

# /disk-cleanup — reclaim space, cheapest and safest first

You are a **disk reclamation operator**. The volume is full, or heading there, and the
job is to free space **without destroying anything that cannot be regenerated**.

**Input**: optionally a target — `/disk-cleanup 50` means "stop once 50 GB are free".
**Output**: a per-stage report of what was **reclaimed**, measured, plus a list of the
docker volumes the human still has to decide about.

Everything below runs through one script. Do not reimplement any stage inline.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/disk-cleanup.sh" <subcommand> [--apply] [--repo-path PATH] [--target GB]
```

## The one rule that shapes this whole command

**Report what was RECLAIMED, never what was PREDICTED.**

`docker system df` under-reports. Measured 2026-08-11 on a 468 GB volume at 100%
full: it predicted **18 GB**, and **48.3 GB** came back — it does not count shared
layers. So every stage measures free space before it acts and after it acts, and
reports the difference. Never quote a prediction to the user as if it were a result,
and never quote `docker system df` at all.

## Stages, in ascending order of risk

Run them in this order and **stop as soon as the target is met**. The cheap stages
are also the safe ones, which is not a coincidence — the expensive-to-lose things are
expensive to lose precisely because nothing regenerates them.

| # | Stage | Reclaimed on 2026-08-11 | Risk | Guard |
|---|-------|------------------------|------|-------|
| 0 | `measure` | — | none, read-only | Changes nothing. Prints no prediction. |
| 1 | `docker-images` | **48.3 GB** | none — images re-pull | Idempotent: reports `already clean` when there is nothing to prune. |
| 2 | `node-modules` | 11 GB | none — regenerable from the lockfile | **Delegated** to the worktree classifier. Skips the main checkout, locked worktrees, and any `node_modules` that is a symlink. |
| 3 | `worktrees` | 8 of 69 removed, 61 kept | **real** | **Delegated.** Refuses anything with uncommitted or unpushed work, and treats `unverifiable` as a refusal. Branch refs are never deleted. |
| 4 | `docker-volumes` | ~1 GB | **holds data** | **Lists only. No `--apply` path exists.** A volume can hold the only copy of somebody's data. Show the names, ask, and let the human run `docker volume rm`. |

Stage 3 keeping 61 of 69 worktrees is the expected outcome, not a failure. A worktree
that holds work is supposed to survive this command.

## What this command owns, and what it delegates

It owns **the docker stages only**. Stages 2 and 3 are handed to
`scripts/worktree-cleanup.mjs`, which owns the worktree classifier — three independent
merge tests (ancestor, cherry, merged PR), `unverifiable` as a verdict distinct from
safe, and a refusal for every worktree holding uncommitted or unpushed work.

That split is deliberate. A shorter copy of a **destructive classifier** is the worst
kind of duplication: it looks equivalent, drifts silently, and the drift only shows up
as deleted work. When the classifier is not installed, stage 2 and 3 report
**`UNAVAILABLE`** — which is not the same as `already clean`, and the script will not
say the second when it means the first.

For worktrees alone, without the docker stages, invoke the classifier directly:
`node scripts/worktree-cleanup.mjs <repo>`. It has no slash command of its own, on
purpose — a second command onto a subset of this one's job means the reader has to
decide which to reach for, and the answer is always the one that also does docker.

> **The classifier ships in this same change.** `scripts/worktree-cleanup.mjs` and
> `skills/worktree-cleanup/SKILL.md` land alongside this command, so all four stages
> are live on merge. The `UNAVAILABLE` path above is not dead code kept for a pending
> dependency: a plugin install can be older than the command that calls it, and a
> stage that cannot run must say so rather than report the disk tidy.

## Protocol

1. **Measure first, always.**

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/disk-cleanup.sh" measure --repo-path <repo>
   ```

   Report free space, image count, volume count, and the worktree inventory. Do not
   propose an action before this has run.

2. **Dry run the stages you intend.** Every subcommand defaults to dry run. Show the
   user what each would touch.

3. **Get confirmation before the first `--apply`.** One confirmation covers stages 1-3
   for that run. Stage 4 is never covered by it, because stage 4 cannot delete anything.

4. **Apply, in order, stopping at the target.**

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/disk-cleanup.sh" all --apply --repo-path <repo> --target 50
   ```

   Or one stage at a time when you want to check between them.

5. **Report the measured deltas.** Per stage and in total, from the script's own
   before/after numbers. If a stage says `already clean`, say `already clean` — do not
   restate it as a success with a number attached. If a stage says `UNAVAILABLE`, say
   the stage did not run.

6. **Hand the volumes to the human.** List them with sizes and stop. Do not offer to
   delete them, do not suggest `docker volume prune`, and do not present a "remove them
   all" option — an option in a menu reads as a sanctioned choice.

## What this command does not do

- **It does not delete branches.** Removing a worktree is recoverable while its branch
  survives; deleting the branch is not. `disk-cleanup.sh` rejects `--branches` and
  `--force` with an error rather than passing either through.
- **It does not touch the main checkout's `node_modules`.** That one is in use.
- **It does not remove docker volumes**, with or without `--apply`.
- **It does not discard a stream.** No stage redirects output away, because a stage
  that failed and a stage that had nothing to do must never look alike.

## Requirements

- `docker` for stages 1 and 4. A missing docker is reported as a skip with a reason,
  not as a clean stage.
- `node` and `scripts/worktree-cleanup.mjs` for stages 2 and 3.
- `numfmt` (coreutils) makes sizes human-readable; without it, sizes print in bytes.

## Related

- [`worktree-cleanup`](../skills/worktree-cleanup/SKILL.md) — the classifier this command delegates stages 2 and 3 to; ships in the same change and has no slash command of its own
- [`/rebase`](rebase.md) — team release sync; brings worktrees up to date rather than removing them
- [`/parallelize`](parallelize.md) — creates the worktrees this command later reclaims

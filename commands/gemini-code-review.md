---
description: Cheap first-pass code review on Gemini 3.5 Flash (one-shot via liteLLM), curated by the orchestrator against the local repo's CLAUDE.md. Design B — no nested agent.
argument-hint: "[PR# | branch | --uncommitted]  (default: <base>...HEAD)"
---

# Gemini Code Review: $ARGUMENTS

A **cost-optimized first-pass** code review. The heavy diff-reading runs on
**Gemini 3.5 Flash** (cheap/fast) in a single one-shot request; you (the
orchestrator, on a Claude model) then **curate** the output against the local
repo's review rules. This is NOT a replacement for a full Claude-model review on
high-risk PRs — it's a fast triage pass.

## How it works (Design B)

`${CLAUDE_PLUGIN_ROOT}/scripts/gemini-code-review.sh` resolves the diff, starts a
transient liteLLM proxy, sends the diff + a condensed review rubric to
gemini-3.5-flash in ONE completion, and returns review markdown. No nested Claude
Code agent runs on Gemini, so there is no tool-call-translation fragility.

## Steps

1. **Run the worker** against the requested target (default `<base>...HEAD`, base
   auto-detected from `origin/HEAD` → `develop`/`main`/`master`). The worker needs
   `GEMINI_API_KEY` in the environment — provide it via this plugin's secret
   helpers so it never leaks into logs:

   ```bash
   # one-time, if not already staged:  /secret-input
   /secret-use GEMINI_API_KEY -- bash "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-code-review.sh" $ARGUMENTS
   ```

   - `$ARGUMENTS` may be a PR number, branch, `--uncommitted`, an `a..b` range, or
     empty. Pass it through verbatim.
   - If the script exits non-zero, surface the stderr reason (missing
     `GEMINI_API_KEY`, empty diff, proxy failed to start) and STOP — do not
     fabricate a review.

2. **Curate the Gemini output** — do NOT just relay it. For each finding:
   - **Validate** against the actual diff and **this repo's `CLAUDE.md`** (and any
     nearest-directory `CLAUDE.md` / `docs/agent-standards`). Confirm, correct, or
     **drop false positives** (Flash over-flags).
   - **Add** repo-rule-specific issues Flash missed that are visible in the diff
     (architecture-boundary violations, banned patterns, test conventions, RLS /
     security rules — whatever the repo's standards encode).
   - Keep `file:line` precision; discard vague advice.

3. **Present the curated review** in the worker's shape (Files table,
   Critical/Major/Minor findings, Missing Tests, Verdict + metrics) with a one-line
   header noting it is a **Gemini-3.5-Flash first pass curated by the orchestrator**.

## When to use

- **`/make-no-mistakes:gemini-code-review`**: cheap triage, WIP self-review,
  large/low-risk diffs, fast feedback.
- A full Claude-model review (e.g. a repo's own `/code-review`): authoritative
  review on high-risk PRs (auth, payments, migrations, RLS, infra).

---
description: Cheap first-pass code review (one-shot via liteLLM) on a parametrizable model — Gemini 3.5 Flash by default, or any provider via --model; supports --adversarial. Curated by the orchestrator against the local repo's CLAUDE.md. Design B — no nested agent.
argument-hint: "[PR# | branch | --uncommitted] [--model <id>] [--adversarial]  (default: <base>...HEAD, gemini-3.5-flash)"
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
   auto-detected from `origin/HEAD` → `develop`/`main`/`master`). The worker is
   **multi-model**: `--model <litellm-id>` picks the backend (default
   `gemini/gemini-3.5-flash`; also `openai/gpt-5.4-mini`, `anthropic/claude-...`).
   It needs the **matching provider key** in the environment — `gemini/*` →
   `GEMINI_API_KEY`, `openai|gpt*` → `OPENAI_API_KEY`, `anthropic|claude-*` →
   `ANTHROPIC_API_KEY`. Provide it via the secret helpers so it never leaks:

   ```bash
   # one-time, if not already staged:  /secret-input
   # default (Gemini):
   /secret-use GEMINI_API_KEY -- bash "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-code-review.sh" $ARGUMENTS
   # cross-provider second opinion (kills sycophancy — different model, different blind spots):
   /secret-use OPENAI_API_KEY -- bash "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-code-review.sh" --model openai/gpt-5.4-mini $ARGUMENTS
   # adversarial (devil's advocate — challenges design/assumptions/trade-offs):
   /secret-use GEMINI_API_KEY -- bash "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-code-review.sh" --adversarial $ARGUMENTS
   ```

   - `$ARGUMENTS` may be a PR number, branch, `--uncommitted`, an `a..b` range, or
     empty — optionally with `--model <id>` and/or `--adversarial`. Pass it through verbatim.
   - If the script exits non-zero, surface the stderr reason (missing provider key,
     empty diff, proxy failed to start) and STOP — do not fabricate a review.

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
- **`--model openai/gpt-5.4-mini` (or any other provider)**: a genuine
  cross-provider second opinion — a different model has different blind spots, so
  it catches what the default misses (same premise as OpenAI's `codex-plugin-cc`).
- **`--adversarial`**: when you want the design challenged, not approved — surfaces
  unstated assumptions, rejected trade-offs, and failure modes on load-bearing PRs.
- A full Claude-model review (e.g. a repo's own `/code-review`): authoritative
  review on high-risk PRs (auth, payments, migrations, RLS, infra).

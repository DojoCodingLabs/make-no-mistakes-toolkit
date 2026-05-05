---
description: >
  Run a premortem on the plan, launch, product, hire, strategy, or decision
  the user is about to commit to. Frames it as "already failed 6 months from
  now" and works backward to find every reason why, then produces a revised
  plan with blind spots exposed. Outputs an HTML report + Markdown transcript
  to ~/Escritorio (or the explicit location the user named). Accepts a target
  description as $ARGUMENTS, or asks conversationally if missing.
---

# /premortem

Trigger the **`premortem`** skill on the target the user provides (via $ARGUMENTS or via conversation).

The skill itself owns the full flow:

1. **Context gathering** — scan workspace + conversation for existing context, then ask focused questions if the minimum bar (what / who / success) isn't met
2. **Frame setting** — explicitly state *"it's 6 months from now and this has failed"*
3. **Raw failure generation** — produce every genuine reason the plan died, grounded in details
4. **Parallel deep-dives** — one `Agent` per failure reason, spawned in a single tool-call batch
5. **Synthesis** — Most Likely / Most Dangerous / Hidden Assumption / Revised Plan / Checklist
6. **Output** — HTML report + Markdown transcript to `~/Escritorio` (per `feedback_goodnight_desktop`)

## Usage

```
/premortem <one-line description of the plan>
```

Examples:

```
/premortem launching the Pathways v1.6.0 masterclass tab on May 15
/premortem hiring a second backend engineer on a 6-month contract
/premortem switching from Stripe direct charges to Stripe Connect for course revenue sharing
```

If $ARGUMENTS is empty, the skill will ask what to premortem before doing anything else.

## Differs from

- **LLM Council** — multiple perspectives on a decision *right now*. Use that when you want diverse opinions; use this when you want to stress-test a specific plan against failure modes.
- **Devil's advocate / red team** — a single contrarian voice. Use this skill when you want a structured, multi-agent analysis with deliverables (HTML + transcript), not a back-and-forth conversation.
- **`/code-review` or `/spike-recommend`** — those analyze code or Linear issues. The premortem analyzes *plans and decisions*, which can be far broader than a codebase or a ticket.

Read `skills/premortem/SKILL.md` for the full method.

# Anti-Examples Block — Documenting False-Positive Examples in Spec Bodies

This is a documentation discipline for implementation briefs and architectural specs produced by the make-no-mistakes toolkit. It is a **business rule** of the Dojo Coding methodology: when a spec lists categorical examples that were corrected during drafting, the rejected items must remain visible in the spec body as a durable artifact.

## What it is

An **anti-examples block** is a documented list of items that were initially included as examples for a categorical claim (e.g., "routes that stay auth-only", "files that belong to layer X", "patterns that match rule Y") but were verified WRONG against the actual codebase. Each entry records:

1. **WHAT** was claimed (the candidate example).
2. **WHY** it's wrong (the disqualifying reason).
3. **FILE:LINE** evidence that disproved it.

The corrected examples go in the main list. The rejected examples go in the anti-examples block — they do **not** disappear from the spec.

## Why it matters

Spec recommendations that list categorical examples ("routes that...", "components that...", "tables that...") are prone to a specific failure mode: the author lists plausible-sounding examples without grepping for counter-evidence, then ships the spec with false positives baked in.

When a reviewer catches the error during review, the natural impulse is to silently edit the wrong example out. That fix is incomplete: it deletes the lesson. Six months later, a different contributor — or the same LLM in a new context — will look at the corrected list, find it pattern-matches their mental model, and re-introduce the exact same mistake because the spec contains no signal that anyone ever doubted it.

The anti-examples block is the durable artifact of "we checked, this was wrong, here's why." It immunizes the spec against re-introduction of the same false positive.

## When to add one

Add an anti-examples block to any spec that:

- Lists **categorical examples** (pillars, routes, files, components, patterns, layers, tables — any "examples that belong here / fit this rule") AND
- Has gone through **at least one correction round** during drafting where one or more candidate examples were rejected after verification.

If the draft was correct first try and no examples were rejected, no anti-examples block is needed. The block exists specifically to preserve the rejection rationale.

If the spec lists examples but you have not verified them against the codebase yet, do not write the spec — verify first. The anti-examples block records corrections, it does not substitute for the verification step.

## How to add one

Place the block immediately after the main examples list, under a heading that names (a) the category being classified and (b) the misclassification that was rejected. Each entry uses the `❌` prefix and includes all three fields.

### Template

```markdown
### Anti-examples ([category]s I initially mis-categorized as [wrong classification], now verified [correct classification])

- ❌ `<example>` (<why it's wrong, with file:line evidence>)
- ❌ `<example>` (<why it's wrong, with file:line evidence>)
- ❌ `<example>` (<why it's wrong, with file:line evidence>)

Each of these is in [the relevant audit / decision-record / follow-up bucket] — the outcome is [a separate consolidation issue / re-classification / no action] if the underlying ambiguity is functionally equivalent.
```

### Three required fields per entry

Each bullet MUST contain:

1. **WHAT** — the example string in backticks (the same identifier you would have used in the main list).
2. **WHY** — the disqualifying property in plain language ("has a public equivalent", "is not actually auth-gated", "belongs to layer Y not X").
3. **FILE:LINE** — concrete evidence anchored to the repo. Path AND line number. Without the line number, the rejection is not reproducible and the block degrades into folklore.

Format the three fields inline within the parenthetical, separated by em dashes or commas — but never omit any of them. A bullet missing FILE:LINE evidence is not a valid anti-example entry; it is a hunch.

## Real-world motivating case

**DOJ-4064 routing audit, 2026-05-13.** A routing architectural decision listed routes that "stay at `/app/*` because they have no public equivalent". The initial draft included `workbook`, `course content`, `data-room`, and `checkout/success`. A grep-driven verification round caught four false positives: each of those four routes had a public equivalent registered in the project's `publicRoutes.tsx` file. The corrected spec moved them into an anti-examples block with file:line citations, ensuring a future contributor reading the spec sees both the verified examples AND the rejected candidates with the evidence that disqualified them.

The principle generalizes beyond routing: any categorical claim in a spec — "modules that depend on X", "tables that participate in tenant scoping", "features behind the Y flag", "files that escape the linter rule" — benefits from the same discipline when corrections happen.

## Principles

1. **Corrections persist, they don't disappear.** Silent edits delete the lesson. The block makes the rejection part of the spec's permanent record.
2. **Three fields per entry are non-negotiable.** WHAT + WHY + FILE:LINE. A bullet without file:line evidence is a claim, not documentation.
3. **The block is sized by the corrections, not by the main list.** If only one example was rejected, document one. If zero were rejected, skip the block entirely.
4. **The heading names the misclassification.** "Anti-examples (X I initially classified as Y, now verified Z)" — the heading itself teaches the reader what mistake was avoided.
5. **Anti-examples are not exhaustive coverage.** This is not a list of every possible non-example in the universe; it is a list of the specific candidates that were considered AND rejected. Aspirational completeness defeats the purpose.

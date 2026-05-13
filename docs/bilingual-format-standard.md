# Bilingual Issue Brief — Format Standard

Canonical reference for the **Bilingual Format** used by issue briefs across this toolkit.

This file is the single source of truth for:

1. The required structural markers a brief must contain.
2. What counts as a "substantive" brief vs. a stub.
3. Where the full template lives.

Other docs that reference Bilingual Format (currently `skills/spike-recommend/SKILL.md`, `skills/implement-advisor/SKILL.md`, and `commands/implement.md`) should point here for the definitions and avoid restating them.

---

## What is Bilingual Format?

A Bilingual Issue Brief is a Markdown issue body that is readable by **humans** AND executable by **AI agents** (Claude Code, Agent Teams). It separates narrative-style human context from precision-style agent instructions.

The format is called "Bilingual" because the same document carries two voices:

- The **Human Layer** speaks plain language — user stories, business motivation, analogies, known pitfalls.
- The **Agent Layer** speaks precision — objective, context files, acceptance criteria, technical constraints, verification commands, agent strategy.

---

## Required structural markers

A brief is in Bilingual Format **only** if its description contains all four of these headers, in this order:

```markdown
## 👤 HUMAN LAYER
## 🤖 AGENT LAYER
### Acceptance Criteria
### Context Files
```

The two top-level layer headers use emoji prefixes (`👤` and `🤖`) and `## ` depth. The two sub-headers (`Acceptance Criteria`, `Context Files`) are `### ` depth and live underneath `## 🤖 AGENT LAYER`.

### Quick check (low-fidelity)

For programmatic detection where emoji parsing is unreliable, a brief is **probably** Bilingual Format if both literal strings `HUMAN LAYER` and `AGENT LAYER` appear anywhere in the description. If either is missing, the brief is **not** in Bilingual Format.

### High-fidelity check

For a stricter gate, verify all four headers are present in the expected order and that each section has content beyond stub markers (see "Substantive vs stub" below).

---

## Substantive vs. stub

A brief that **has the headers but is filled with stubs** is treated as **not in Bilingual Format**. An implementation agent would still receive a useless brief.

Stub indicators:

- `TBD` / `TODO` / `?` / `…` as the only content of a section.
- Repeated `N/A` across every section (rather than thoughtful "N/A — this issue doesn't have a UX surface" with reasoning).
- A 1-line description with the headers but no narrative.
- Empty bullets in `Acceptance Criteria` or `Context Files`.
- Placeholder paths like `path/to/file` not replaced with real paths.

If any of these dominate the brief, treat the issue as **not redacted** and recommend running `/make-no-mistakes:spike-recommend {ID}` first.

---

## Where the full template lives

The complete output template — every section header, every field, the analysis frameworks (5 Whys / MECE / Minto Pyramid / Pareto / Second-Order Thinking), the label taxonomy, and the verification commands — lives in:

[`skills/spike-recommend/SKILL.md`](../skills/spike-recommend/SKILL.md) → **"Output Format"** section.

Do not duplicate the template into other skill files. Instead, point at `spike-recommend/SKILL.md` for the canonical version and use this file (`docs/bilingual-format-standard.md`) for the marker / stub definitions.

---

## Consumer behavior

Skills and commands that consume Bilingual Format briefs should:

1. **Check for the markers** (using the high- or low-fidelity method above) before treating the brief as machine-readable.
2. **Refuse to proceed** if the markers are absent — recommend `/make-no-mistakes:spike-recommend {ID}` instead.
3. **Refuse to proceed** if the markers are present but content is stub-only.
4. **Never regenerate the brief without user instruction.** The brief is canonical state in the tracker; downstream tools should read it, not rewrite it.

This file should evolve when the canonical template in `spike-recommend/SKILL.md` evolves. Update the marker list here, then verify all referencing files still resolve.

# Bilingual Format — Human + Agent Layer

This is the standard template for implementation briefs produced by the make-no-mistakes toolkit. It is a **business rule** of the Dojo Coding methodology and must not be altered or skipped.

## Structure

Every implementation brief has two layers:

### Human Layer
Readable by non-engineers, product managers, and stakeholders.

- **User Story** — As a {role}, I want {X} so that {Y}
- **Background / Why** — 2-3 paragraphs in plain language
- **Analogy** — Compare to something familiar
- **UX / Visual Reference** — Diagrams, screenshots, mockups
- **Known Pitfalls & Gotchas** — Edge cases, conflicts, version mismatches

### Agent Layer
Executable by AI agents (Claude Code, Agent Teams).

- **Objective** — 1-2 sentence technical outcome
- **Current State Audit** — Already Exists / Needs Creation / Needs Modification
- **Context Files** — Exact paths the agent MUST read before starting
- **Acceptance Criteria** — Checkboxes, independently testable
- **Technical Constraints** — Patterns, conventions, guardrails
- **Verification Commands** — Exact bash commands to confirm completion
- **Agent Strategy** — Solo / Explore / Team / Worktree / Review / Human

## Label Taxonomy

Each brief is classified using these labels:

### Type (exclusive, required)
- **Bug** — Something is broken
- **Chore** — Maintenance, no user-facing change
- **Feature** — New capability
- **Spike** — Time-boxed research, output = knowledge
- **Improvement** — Enhancement to existing functionality
- **Design** — UI/UX or creative work

### Size (exclusive, maps to AI token budgets)
- **XS** — <50K tokens, ~30 min
- **S** — 50-100K tokens, ~2-4 hrs
- **M** — 100-200K tokens, ~1-2 days
- **L** — 200-500K tokens, ~3-5 days
- **XL** — 500K+ tokens, needs decomposition

### Strategy (exclusive)
- **Solo** — Single agent, end-to-end
- **Explore** — Investigate before proposing
- **Team** — Multiple agents in parallel
- **Human** — Requires human decision
- **Worktree** — Git worktree isolation
- **Review** — Audit only, no code changes

## Principles

1. Never invent requirements — flag what's missing
2. Derive, don't assume — extract from source content
3. Size drives everything — XS/S = Solo, M = Solo or Team, L/XL = Team or decompose
4. Context files are critical — prevent hallucination and wasted tokens
5. XL = decompose — propose sub-steps, never a single brief
6. Always recommend parallelization — mandatory section

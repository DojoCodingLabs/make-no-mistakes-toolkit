---
name: spike-recommend
description: >
  Analyzes Linear issues and produces structured bilingual implementation briefs
  (Human Layer + Agent Layer). Use when the user asks to "analyze this issue",
  "create an issue brief", "what does this Linear issue need", pastes a Linear
  issue URL, or wants to understand and plan work for a Linear issue.
  Do NOT trigger for: general project management, issue creation, or status updates.
---

# Issue Recommendations Analyzer

You are a senior engineering lead.

Your job is to read a Linear issue and produce a structured Markdown document that is readable by humans AND executable by AI agents (Claude Code, Agent Teams).

This template is called "Bilingual Issue Brief".

## How to use

```bash
claude /make-no-mistakes:spike-recommend <LINEAR_ISSUE_URL>
```

The `$ARGUMENTS` variable will contain the Linear issue URL. Claude Code will fetch the issue, generate the brief, and save it to your repo.

## Linear Issue Input

Issue URL: `$ARGUMENTS`

Fetch this issue using the Linear MCP or API.

Extract: title, identifier, description, status, priority, assignee, labels, comments, linked issues, sub-issues, and any attached files or links.

## Analysis Strategy

Please note that each Linear issue might have **_one or more_** spikes as internal posts or comments.

Please use sub-agents for each spike detected, and then consolidate all recommendations into a single one with a separate synthesizer sub-agent. Make sure to add a final section that includes additional comments on why each response from with analysis sub-agent was picked.

## Label Taxonomy

The issue will have labels from this taxonomy:

### GROUP: Type (exclusive, required)

* **Bug** — Something is broken. Crashes, errors, spec violations.
* **Chore** — Maintenance. No user-facing change. Deps, CI/CD, docs, renewals, admin.
* **Feature** — New capability that doesn't exist yet. New page, endpoint, event, campaign.
* **Spike** — Time-boxed research. Output = knowledge. ADR, PoC, vendor eval, market research.
* **Improvement** — Enhancement to existing functionality. UX, perf, refactor, better process.
* **Design** — UI/UX or creative work. Mockups, design system, branding, decks.

### GROUP: Size (exclusive, maps to AI token budgets)

* **XS** — <50K tokens, ~30 min. _Single file, obvious change. Typo fix, config tweak._
* **S** — 50-100K tokens, ~2-4 hrs. _2-3 files, well-scoped. A component, hook, migration._
* **M** — 100-200K tokens, ~1-2 days. _Cross-module. Frontend + backend + migration + tests._
* **L** — 200-500K tokens, ~3-5 days. _Cross-layer, affects architecture. May need decomposition._
* **XL** — 500K+ tokens. _Epic scope. Needs decomposition into smaller issues._

### GROUP: Strategy (exclusive, optional for non-engineering)

* **Solo** — Single agent, end-to-end. Clear requirements, just go.
* **Explore** — Unknown scope — investigate codebase BEFORE proposing solution.
* **Team** — Multiple agents in parallel. Frontend + backend + tests concurrently.
* **Human** — Requires human decision. UX choices, biz logic, architecture. Default for Ops.
* **Worktree** — Git worktree isolation. Risky changes, experimental work.
* **Review** — Audit or review only — no code changes. Output is a report.

## Ungrouped Labels (combinable)

* **Component:**
  * Frontend
  * Backend
  * Database
  * Security
  * Performance
  * Infra
  * Testing
  * Web Quality
* **Impact:**
  * 🔥 Critical Path
  * 💰 Revenue
  * 🎁 Grant
* **Flags:**
  * 🚫 Blocked
  * ⚡ Quick Win
  * 📦 Epic


## Output Format

Provide an issue wording recommendation using EXACTLY this Markdown structure. Do NOT use HTML tables.

Do NOT skip sections — write "N/A" if a section doesn't apply. Write in English.

``````markdown

# [ISSUE-ID] Issue Title

> **Type:** `{type}`

> **Size:** `{size}`

> **Strategy:** `{strategy}`

> **Components:** `{component1}`, `{component2}`

> **Impact:** `{impact or "—"}`

> **Flags:** `{flags or "—"}`

> **Branch:** `{suggested branch name}`

---

## 👤 HUMAN LAYER

### User Story

As a **{role}**, I want **{X}** so that **{Y}**.

### Background / Why

{2-3 paragraphs in plain language. Extract from issue description + comments. Explain the problem, motivation, and business context. If the issue is sparse, say what you know and flag what's missing.}

### Analogy

{Compare to something familiar. Write "N/A" if not applicable.}

### UX / Visual Reference

{List any screenshots, Figma links, mockups mentioned in the issue. Write "None provided" if absent.}

### Known Pitfalls &amp; Gotchas

{Extract from comments, linked issues, or infer from codebase knowledge. List edge cases, legacy data quirks, dependencies.}

---

## 🤖 AGENT LAYER

### Objective

{1-2 sentence technical outcome. Be precise about the deliverable.}

### Context Files

{List exact file paths the agent should read before starting. Include a short description of why each file matters. Use your knowledge of the repo structure.}

- `path/to/file` — {why}
- `path/to/file` — {why}

### Acceptance Criteria

{Checkboxes. Each must be independently testable. Derive from the issue description, comments, and your understanding of the requirement.}

- [ ] {criterion}
- [ ] {criterion}
- [ ] {criterion}

### Technical Constraints

{Patterns, conventions, and guardrails the agent must follow. Include relevant linting rules, architectural patterns, naming conventions from the codebase.}

- {constraint}
- {constraint}

### Verification Commands

{Exact bash commands to confirm the work is done correctly.}

\```bash
# Tests
{command}

# Lint
{command}

# Build
{command}

# Type check (if applicable)
{command}
\```

### Agent Strategy

{This section adapts based on the Strategy label.}

**Mode:** `{strategy}`

### If Solo:
- **Approach:** {step-by-step plan}
- **Estimated tokens:** {based on Size label}

### If Explore:
- **Investigation questions:** {what needs to be understood first}
- **Read-only phase:** {files/areas to investigate}
- **Decision point:** {what triggers moving to implementation}

### If Team:
- **Lead role:** Coordinator — assigns tasks, reviews, synthesizes. No direct file edits.
- **Teammates:**
  - Teammate 1: {role} → owns `{paths}`
  - Teammate 2: {role} → owns `{paths}`
  - Teammate 3: {role} → owns `{paths}`
- **Display mode:** `tab` or `split`
- **Plan approval required:** yes/no
- **File ownership:** {explicit mapping to avoid write conflicts}

### If Worktree:
- **Worktree branch:** `{branch name}`
- **Isolation reason:** {why this needs worktree}
- **Merge strategy:** {how to integrate back}

### If Review:
- **Audit scope:** {what to review}
- **Output format:** {report structure}
- **No code changes** — output is a report only.

### If Human:
- **Decisions needed:** {list decisions the human must make}
- **Options to present:** {for each decision, outline the trade-offs}
- **Agent prep work:** {what the agent can do to support the decision}

### Slack Notification

When done, send a summary to {user} via Slack MCP with:
- What was completed
- Files changed
- Any issues or decisions needed

---

## 🔀 Parallelization Recommendation

{ALWAYS include this section. Based on the Size, Strategy, and Component labels, recommend which parallelization mechanism to use. Consider the codebase context window of 200K tokens.}

**Recommended mechanism:** `{Subagents | Git Worktrees | Agent Teams | None (Solo)}`

**Reasoning:**

{Explain your choice using this decision matrix:}

- **Subagents** — Best for: quick research, focused sub-tasks. Token cost: Low (1x). Use when a piece of the work is independent and the result can be summarized back. Like sending an intern to look something up.
- **Git Worktrees** — Best for: parallel sessions on different branches. Token cost: 1x per session. Use when changes are risky, experimental, or need branch isolation. Like separate desks in the same office.
- **Agent Teams** — Best for: complex multi-part work where teammates need to coordinate. Token cost: 3-4x. Use when multiple components change simultaneously and teammates benefit from messaging each other. Like a self-organizing consulting firm.
- **None (Solo)** — Best for: XS/S issues with clear scope. Single agent, single context window, minimal cost.

**Size → Mechanism mapping:**
- XS/S → Solo (no parallelization needed)
- M with single component → Solo or Subagents for research
- M with multiple components → Agent Teams (2 teammates)
- L → Agent Teams (2-3 teammates) or Worktree if risky
- XL → Decompose first, then Agent Teams per sub-issue

**Cost estimate:** ~{number}x base token cost

---

### Synthesis Additional Comments

{Add here any additional comments that you consider necessary based on the synthesis of all the spike analyzer sub-agents. Use 5 Why's methodology. Please also use the following consulting frameworks:}

#### MECE Logical Validation
Analyze the implementation using the **MECE** (Mutually Exclusive, Collectively Exhaustive) framework:

* **Mutually Exclusive:** Verify that this logic does not overlap or conflict with existing Handlers, Services, or Selectors within the spike. Ensure a single source of truth for this business logic.

* **Collectively Exhaustive:** Ensure the solution addresses 100% of the defined requirements, including null pointers, platform limits (Gov Limits), and all possible record states in the execution context.

#### Executive Synthesis (Minto Pyramid)
Structure the response using the **Pyramid Principle**:

1.  **Lead with the Answer:** Provide a one-sentence "Executive Summary" of the change and its primary impact on the system.

2.  **Supporting Arguments:** Group technical changes into logical buckets (e.g., Performance Optimization, Code Resilience, Scalability).

3.  **Data & Evidence:** Provide specific technical details (CPU time saved, heap size impact, or test coverage metrics) only as evidence to support the arguments above.

#### Pareto 80/20 Efficiency Review

Apply a **Pareto Filter** to the proposed solution:

* Identify if we are achieving 80% of the business value with 20% of the code complexity. 

* Flag any "over-engineered" components designed for extreme edge cases that may introduce unnecessary technical debt to the spike.

* Suggest if a simpler, standard Salesforce feature (e.g., a simple Flow or Formula) would be more efficient than the current Apex implementation.

#### Second-Order Thinking & Risk Assessment
Evaluate the **long-term implications** of this implementation:

* **Scalability:** What happens to this logic if the data volume in the Org grows by 10x or 100x? 

* **Downstream Effects:** How does this change impact other modules or future developers working within the spike?

* **Future Maintenance:** Identify potential "hidden" dependencies or architectural traps that might increase the cost of change six months from now.

``````

## Rules

1. Never invent requirements.

    * If the issue is vague, say so explicitly and flag what's missing.
    * Use phrases like "⚠️ Not specified in issue — assuming X" or "❓ Needs clarification: Y".

2. Derive, don't assume.

    * Extract the user story, pitfalls, and acceptance criteria from the issue content.
    * If comments contain useful context, incorporate them.

3. Be opinionated about strategy. 

    * If the issue has no Strategy label, recommend one based on Size + Type + Component. Explain why.

4. Size drives everything.

    * XS/S = Solo. M = Solo or Team depending on components. L/XL = Team or decompose. Map this explicitly.

5. Context files are critical.

    * Use your knowledge of the repo to list the exact files the agent needs. This prevents hallucination and wasted tokens.

6. XL = decompose.

    * If the issue is XL, don't generate a single brief.
    * Instead, propose a decomposition into smaller issues, each with its own Size and Strategy.

7. Blocked issues get a preamble.

    * If the 🚫 Blocked flag is present, start the brief with a blockers section listing what needs to be resolved first.

8. Always recommend parallelization.

    * The final section is mandatory. Be explicit about the mechanism, the cost trade-off, and why.

9. Output the file.

    * Save the brief as `./issue-briefs/{ISSUE-ID}.md` in the repo.

### Usage

```bash
claude /make-no-mistakes:spike-recommend https://linear.app/your-team/issue/PROJ-123
```

Claude Code will fetch the Linear issue and generate the bilingual brief.

### Requirements:

* Linear MCP server configured in Claude Code (for fetching issue data)
* Slack MCP server configured (for the notification step)


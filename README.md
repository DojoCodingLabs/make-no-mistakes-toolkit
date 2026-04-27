# make-no-mistakes

The disciplined dev lifecycle — implement issues, review PRs, sync releases, test E2E, and manage sessions. One plugin to make no mistakes.

A Claude Code plugin by [Luis Andres Pena Castillo](https://github.com/lapc506).

## Install

```bash
# Add the marketplace (one-time)
claude plugin marketplace add DojoCodingLabs/make-no-mistakes-toolkit

# Install the plugin
claude plugin install make-no-mistakes
```

Or clone and install locally:

```bash
git clone https://github.com/DojoCodingLabs/make-no-mistakes-toolkit.git
claude plugin marketplace add ./make-no-mistakes-toolkit
claude plugin install make-no-mistakes
```

## Install (OpenCode)

```bash
npx @lapc506/make-no-mistakes install
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `make-no-mistakes install` | Install to ~/.config/opencode/ |
| `make-no-mistakes update` | Refresh managed assets |
| `make-no-mistakes uninstall` | Remove managed files only |
| `make-no-mistakes doctor` | Health check |
| `make-no-mistakes install --dry-run` | Preview changes |
| `make-no-mistakes install --force` | Overwrite unmanaged conflicts |

## What's Inside

### Commands (18)

Deliberate actions you invoke explicitly.

| Command | Description |
|---------|-------------|
| `/make-no-mistakes:implement <ISSUE-ID>` | Disciplined execution of Linear issues — worktree isolation, all-reviewer loops, CI verification, clean merges |
| `/make-no-mistakes:prioritize <pillar-slug>` | MoSCoW + RICE-adapted applied to a pillar's Linear issues, traceable to its PIBER+IDCF sub-spike and the latest vision audit. Outputs priority report + description-footer per issue + snapshot comment on the sub-spike. Chain: `product-vision-audit → prioritize → spike-recommend → implement` |
| `/make-no-mistakes:rebase <repo>` | Team release sync — rebase all branches, auto-merge ready PRs, health report |
| `/make-no-mistakes:linear-projects-setup` | Bootstrap Linear workspace with full label taxonomy, projects, and integrations |
| `/make-no-mistakes:e2e-test-builder <source>` | Generate a TestSprite-compatible `test-suite.json` from docs or PRDs |
| `/make-no-mistakes:e2e-test-runner [filter]` | Execute E2E tests from `test-suite.json` with runner selection and reporting |
| `/make-no-mistakes:pentest-runner <phase>` | Automated pentesting following Cyber Kill Chain + OWASP methodology |
| `/make-no-mistakes:goodmorning` | Bootstrap your session from previous day's handoff files |
| `/make-no-mistakes:goodnight [label]` | Save full session context as a handoff file for tomorrow |
| `/make-no-mistakes:pending-left` | Track what's left unfinished across git, Linear, and session context |
| `/make-no-mistakes:summarize` | Structured recap of everything done in the current session |
| `/make-no-mistakes:daily-standup-add-completed [text]` | Append completed work items to today's standup file (auto-detects from PRs/issues) |
| `/make-no-mistakes:daily-standup-post-slack [draft]` | Compose and post today's standup to the configured Slack channel |
| `/make-no-mistakes:remind <topic>` | Recall past decisions, instructions, or feedback from memory and project context |
| `/make-no-mistakes:takeover-pr <repo> [pr#]` | Pick a random open PR from a teammate, check it out, review it, and take over the work |
| `/make-no-mistakes:secret-input` | Stage a secret/password via OS-native GUI dialog (Linux zenity/kdialog/pinentry, macOS osascript, Windows Get-Credential). The value never appears in the conversation log or terminal history. Cross-platform via `.sh` (Linux/macOS/WSL/Git Bash) + `.ps1` (native Windows) |
| `/make-no-mistakes:secret-use ENVVAR -- <cmd>` | Run one command with the staged secret loaded as an environment variable. Env var lives only inside the consuming process and is unset on completion |
| `/make-no-mistakes:secret-clear` | Wipe the staged secret (shred/rm-P/random-overwrite per OS). Idempotent — safe to call when no secret is staged. Always run when done with credentials |

### Skills (6)

Auto-activate by context — you don't need to remember the command name.

| Skill | Triggers when you... |
|-------|---------------------|
| `implement-advisor` | Want to work on a Linear issue, implement a feature, or fix a bug (suggests `/make-no-mistakes:implement`) |
| `spec-recommend` | Discuss specs, SRDs, implementation briefs, or say "what should I build" |
| `spike-recommend` | Paste a Linear issue URL or ask to analyze an issue |
| `review-open-prs` | Ask about open PRs, merge readiness, or Greptile scores |
| `review-active-issues` | Ask about your Linear issues, backlog, or issue status |
| `rebase-advisor` | Mention needing to sync branches after a release (suggests `/make-no-mistakes:rebase`) |

Skills can also be invoked explicitly: `/make-no-mistakes:spec-recommend T0-4`

### Agents (2)

Specialized subagents dispatched by commands/skills for heavy work.

| Agent | Model | Dispatched by |
|-------|-------|---------------|
| `execution-lead` | Opus | `/make-no-mistakes:implement` — runs the full protocol in its own context |
| `pr-reviewer` | Sonnet | `review-open-prs` skill — cross-references PRs with Linear and Greptile |

## Configuration

The plugin reads `linear-setup.json` at your repo root for project-specific settings:

```json
{
  "team": {
    "key": "ALT",
    "url": "https://linear.app/your-team"
  },
  "git": {
    "baseBranch": "main",
    "branchPattern": "{type}/{issueId}-{description}"
  },
  "github": {
    "org": "your-org"
  },
  "defaults": {
    "greptileReview": true,
    "squashMerge": true,
    "slackNotify": true
  },
  "slack": {
    "statusChannel": "C09BD6W95GC"
  }
}
```

If no `linear-setup.json` exists, the plugin auto-detects settings from your environment (GitHub org from current repo, Linear team from MCP, etc.).

## Verify Installation

**Claude Code:**

```bash
claude plugin list
# should show "make-no-mistakes"
```

Or run `/plugin` inside Claude Code to see it in the plugin manager. Then invoke any command to confirm: `/make-no-mistakes:summarize`

**OpenCode:**

```bash
make-no-mistakes doctor
```

## Requirements

- **Claude Code** — the CLI or IDE extension
- **GitHub CLI** (`gh`) — authenticated (`gh auth login`)
- **Linear MCP** — configured in Claude Code for issue tracking (add via Claude Code settings > MCP servers)
- **Slack MCP** — optional, for standup posting and Slack reporting. See `slack-config.example.json` at the repo root for channel configuration

## Product Owner Extension (SPOPC)

make-no-mistakes is expanding from a **developer lifecycle toolkit** into a **full product ownership layer**, grounded in the [Scrum Product Owner Professional Certificate (SPOPC)](https://certiprof.com/pages/scrum-product-owner-professional-certificate-spopc) methodology by CertiProf.

The author holds three CertiProf certifications that inform this extension:

- **Scrum Product Owner Professional (SPOPC)** — backlog management, stakeholder communication, value maximization
- **User Stories Foundation (USFC)** — story writing, acceptance criteria, splitting strategies
- **Scrum Foundation Professional (SFPC)** — Scrum framework, ceremonies, roles, artifacts

### Why not a separate plugin?

[gstack](https://github.com/garrytan/gstack) proved that a single toolkit can serve multiple roles — CEO, designer, engineer, QA — all through slash commands. Product ownership is part of the development lifecycle, not separate from it. make-no-mistakes already has the plumbing: Linear issue tracking, Slack messaging, daily standups, spike recommendations, and session management. The PO skills are natural extensions.

### Planned PO Skills and Commands

| Component | Type | Description |
|-----------|------|-------------|
| `backlog-groom` | Skill | Read SOPs + Linear project state, suggest prioritization, flag stale issues |
| `sprint-review` | Command | Generate sprint metrics report — velocity, completion %, carryover items |
| `vertical-health` | Command | Cross-reference product analytics + Linear velocity + GitHub activity for a product area |
| `po-standup` | Command | PO-perspective standup: blockers, decisions needed, stakeholder updates |
| `vertical-report` | Command | Weekly summary posted to the product area's Slack channel for stakeholders |
| `product-discovery` | Command | GTM Discovery Roadmapping — ingest Linear issues, cluster into opportunities, prioritize with GTM Score matrix, output a Now/Next/Later roadmap. Uses [Double Diamond](https://www.productboard.com/glossary/double-diamond/) framework (Discover, Define, Develop, Deliver) and a composite GTM Score (Market Fit 30% + Business Impact 25% + GTM Readiness 20% + Effort 15% + Risk 10%). Integrates with Linear MCP for issue ingestion and optionally with [Productboard MCP](https://github.com/Enreign/productboard-mcp) for opportunity/feature export |

### Two-Layer Architecture

SOPs (Standard Operating Procedures) define the **what** and **why** per product area — these live in your own documentation repo, not here. make-no-mistakes reads them at runtime to apply context-specific policies.

```
your-docs-repo/sops/{product-area}/
├── README.md              # Vision, KPIs, success metrics
├── backlog-policy.md      # Prioritization criteria, Definition of Done
├── release-checklist.md   # Pre-release gates specific to this area
└── escalation-flow.md     # When and how to escalate to stakeholders
```

The plugin consumes these SOPs to give context-aware recommendations. Each Product Owner creates SOPs for their area using a shared template.

### SPOPC-to-Tooling Mapping

| SPOPC Concept | make-no-mistakes Implementation |
|---------------|--------------------------------|
| Product Backlog management | `backlog-groom` — reads Linear + SOP prioritization rules |
| Sprint Review | `sprint-review` — auto-generated metrics from Linear + GitHub |
| Stakeholder communication | `vertical-report` — weekly Slack summary to stakeholders |
| Definition of Done | SOP at `sops/{product-area}/backlog-policy.md` |
| ROI / Value maximization | `vertical-health` — PostHog analytics + Linear velocity |
| User Stories | `spike-recommend` + `spec-recommend` (existing, USFC-informed) |
| Sprint Planning | `review-active-issues` (existing) + `backlog-groom` (planned) |
| Product Discovery | `product-discovery` — Double Diamond + GTM Score matrix via Linear + Productboard MCP |

> **Status:** The PO extension is in design phase. The existing developer lifecycle commands are stable and production-ready. PO skills will be added incrementally without breaking existing functionality.

## The Name

"Make no mistakes" started as an inside joke — a mantra for disciplined execution. Like the Ralph loop, it's a reminder that process isn't optional when shipping matters.

## Architecture

```
make-no-mistakes-toolkit/
├── .claude-plugin/     # Claude Code plugin metadata
│   ├── plugin.json
│   └── marketplace.json
├── src/                # OpenCode npm distribution (TypeScript CLI)
│   ├── cli.ts
│   ├── index.ts
│   └── lib/
├── commands/           # 14 explicit commands
├── agents/             # 2 specialized subagents
├── skills/             # 6 auto-activating skills
│   └── */SKILL.md
├── scripts/            # Shared bash utilities
├── package.json
└── README.md
```

**Design principle:** Commands for destructive/token-intensive actions (you decide when). Skills for read-only analysis (context-aware, auto-activate). Agents for heavy orchestration (own context window).

## Bilingual Format

Implementation briefs produced by `spec-recommend` and `spike-recommend` follow the **Bilingual Format** — a two-layer structure:

- **Human Layer** — User story, background, analogy, pitfalls (readable by non-engineers)
- **Agent Layer** — Objective, context files, acceptance criteria, verification commands (executable by AI)

See `skills/spec-recommend/references/bilingual-format.md` for the full template.

## License

[Business Source License 1.1](./LICENSE) — you may use, modify, and redistribute for non-competitive purposes. Converts to Non-Profit OSL 3.0 after 5 years.
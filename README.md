# make-no-mistakes

The disciplined dev lifecycle — implement issues, review PRs, sync releases, test E2E, and manage sessions. One plugin to make no mistakes.

A Claude Code plugin by [Luis Andres Pena Castillo](https://github.com/lapc506).

## Install

```bash
claude plugin add DojoCodingLabs/make-no-mistakes-toolkit
```

Or clone and install locally:

```bash
git clone https://github.com/DojoCodingLabs/make-no-mistakes-toolkit.git
claude plugin add ./make-no-mistakes-toolkit
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

### Commands (10)

Deliberate actions you invoke explicitly.

| Command | Description |
|---------|-------------|
| `/make-no-mistakes:implement <ISSUE-ID>` | Disciplined execution of Linear issues — worktree isolation, all-reviewer loops, CI verification, clean merges |
| `/make-no-mistakes:rebase <repo>` | Team release sync — rebase all branches, auto-merge ready PRs, health report |
| `/make-no-mistakes:linear-projects-setup` | Bootstrap Linear workspace with full label taxonomy, projects, and integrations |
| `/make-no-mistakes:e2e-test-builder <source>` | Generate a TestSprite-compatible `test-suite.json` from docs or PRDs |
| `/make-no-mistakes:e2e-test-runner [filter]` | Execute E2E tests from `test-suite.json` with runner selection and reporting |
| `/make-no-mistakes:pentest-runner <phase>` | Automated pentesting following Cyber Kill Chain + OWASP methodology |
| `/make-no-mistakes:goodmorning` | Bootstrap your session from previous day's handoff files |
| `/make-no-mistakes:goodnight [label]` | Save full session context as a handoff file for tomorrow |
| `/make-no-mistakes:pending-left` | Track what's left unfinished across git, Linear, and session context |
| `/make-no-mistakes:summarize` | Structured recap of everything done in the current session |

### Skills (5)

Auto-activate by context — you don't need to remember the command name.

| Skill | Triggers when you... |
|-------|---------------------|
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

## Requirements

- **Claude Code** — the CLI or IDE extension
- **GitHub CLI** (`gh`) — authenticated
- **Linear MCP** — configured in Claude Code (for issue tracking features)
- **Slack MCP** — optional, for Slack reporting

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
├── commands/           # 10 explicit commands
├── agents/             # 2 specialized subagents
├── skills/             # 5 auto-activating skills
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
# Linear Workspace Setup -- Projects, Labels & Taxonomy

You are a project management automation engineer.

Your job is to bootstrap a Linear workspace with the full label taxonomy, projects, milestones, and reviewer integrations needed for a monorepo engineering team.

## How to use this prompt

```bash
claude /linear-projects-setup                # Clean slate: delete ALL existing labels, recreate full taxonomy + projects
claude /linear-projects-setup labels         # Only create missing labels (additive, no deletions)
claude /linear-projects-setup projects       # Only create missing projects (additive, no deletions)
claude /linear-projects-setup audit          # Dry run -- report what exists vs what's missing, no changes
claude /linear-projects-setup sync           # Sync linear-setup.json with current Linear state
```

The `$ARGUMENTS` variable will contain the mode. Default (empty) is **clean** mode.

## Configuration

This command reads `linear-setup.json` at the repo root if it exists. The file provides:
- `team.key` -- Team prefix (e.g., `ALT`)
- `team.url` -- Board URL for reference
- `git.baseBranch` -- Base branch for PRs (e.g., `main`)
- `projects` -- Map of project slugs to `{name, id}` pairs
- `defaults` -- PR review settings (Greptile, squash merge, Slack notify)
- `srd` -- Paths to SRD gap audit, journeys, personas
- `openspec` -- Paths to spec library and changes directory

If the file does not exist, the command will create it during the `sync` or clean slate modes.

## Execution Strategy

### Mode: (empty) -- Clean Slate

This is a **destructive reset**. It wipes all existing issue labels and recreates the full taxonomy from scratch. Use when the workspace has stale, inconsistent, or manually-created labels that don't match the taxonomy.

1. **Audit phase** -- List all existing issue labels, projects, and teams via Linear MCP
2. **Confirmation phase** -- Show the user exactly what will be DELETED and what will be CREATED. Ask for explicit confirmation with a warning: `WARNING: This will delete {N} existing labels. Issues using those labels will lose them. Type "CLEAN" to confirm.`
3. **Manual deletion phase** -- The Linear MCP does not support label deletion. Ask the user to delete labels manually:
   - Detect the workspace slug from the team URL or `linear-setup.json`
   - Show the user this message:
     ```
     Please delete all existing labels manually:

     1. Open https://linear.app/{WORKSPACE_SLUG}/settings/issue-labels
     2. Delete all labels listed above
     3. Come back here and confirm when done
     ```
   - **Wait for user confirmation** before proceeding to creation
   - Do NOT proceed until the user explicitly confirms deletion is complete
4. **Creation phase** -- Create the full taxonomy from scratch:
   - Create label groups FIRST (parents with `isGroup: true`), then child labels
   - Create projects with descriptions (only missing ones -- projects are NOT deleted in clean mode)
   - Report each creation with its Linear URL
5. **Sync phase** -- Update `linear-setup.json` with created project IDs and team info
6. **Verification phase** -- List all labels and projects to confirm the final state

### Mode: `labels` -- Additive

Only creates labels that don't already exist. Never deletes or modifies existing ones.

1. **Audit phase** -- List existing labels, compare against taxonomy
2. **Report phase** -- Show: {N} exist, {M} missing, {K} have different colors (flagged but not modified)
3. **Creation phase** -- Create only missing labels (groups first, then children)
4. **Verification phase** -- Confirm final state

### Mode: `projects` -- Additive

Only creates projects that don't already exist. Never deletes or modifies existing ones.

1. **Audit phase** -- Scan repo for `apps/*/`, `packages/*/`, `infrastructure/`, `k8s/`
2. **Cross-reference** -- Read `linear-setup.json` for existing project mappings
3. **Report phase** -- Show: {N} exist, {M} missing
4. **Creation phase** -- Create only missing projects with descriptions
5. **Sync phase** -- Update `linear-setup.json` with new project IDs
6. **Verification phase** -- Confirm final state

### Mode: `audit` -- Read Only

Shows the full diff between current state and the taxonomy. Zero mutations.

1. **Audit phase** -- List everything via MCP
2. **OpenSpec check** -- Count changes with/without linked Linear issues
3. **Report phase** -- Show full diff table and exit

### Mode: `sync` -- Bidirectional Sync

Syncs `linear-setup.json` with current Linear workspace state.

1. **Read Linear state** -- List teams, projects, milestones via MCP
2. **Read local state** -- Parse `linear-setup.json`
3. **Reconcile** -- Update `linear-setup.json` with any new projects/milestones from Linear
4. **OpenSpec cross-reference** -- For each OpenSpec change, check if a Linear issue exists; report mismatches
5. **Write updated `linear-setup.json`**

## Label Taxonomy

### COLOR PALETTE

Use consistent colors per group for visual clarity in Linear UI:

| Category | Color | Hex | Grouped? |
|----------|-------|-----|----------|
| Type | Purple tones | See per-label | Yes (group) |
| Size | Green tones | See per-label | Yes (group) |
| Strategy | Blue tones | See per-label | Yes (group) |
| Component | Orange tones | See per-label | No (ungrouped) |
| Impact | Red tones | See per-label | No (ungrouped) |
| Flags | Yellow tones | See per-label | No (ungrouped) |

### GROUP: Type (exclusive, required)

Create a parent label group called **"Type"** with `isGroup: true`, then each child with `parent: "Type"`.

| Label | Color | Description |
|-------|-------|-------------|
| Bug | `#EB5757` | Something is broken. Crashes, errors, spec violations. |
| Chore | `#9B8AFB` | Maintenance. No user-facing change. Deps, CI/CD, docs, renewals, admin. |
| Feature | `#BB87FC` | New capability that doesn't exist yet. New page, endpoint, event, campaign. |
| Spike | `#C9A0FF` | Time-boxed research. Output = knowledge. ADR, PoC, vendor eval, market research. |
| Improvement | `#4EA7FC` | Enhancement to existing functionality. UX, perf, refactor, better process. |
| Design | `#D98AEB` | UI/UX or creative work. Mockups, design system, branding, decks. |

### GROUP: Size (exclusive, maps to AI token budgets)

Create a parent label group called **"Size"** with `isGroup: true`, then each child with `parent: "Size"`.

| Label | Color | Description |
|-------|-------|-------------|
| XS | `#26B5CE` | <50K tokens, ~30 min. Single file, obvious change. Typo fix, config tweak. |
| S | `#0B9D6F` | 50-100K tokens, ~2-4 hrs. 2-3 files, well-scoped. A component, hook, migration. |
| M | `#4CB782` | 100-200K tokens, ~1-2 days. Cross-module. Frontend + backend + migration + tests. |
| L | `#F2994A` | 200-500K tokens, ~3-5 days. Cross-layer, affects architecture. May need decomposition. |
| XL | `#EB5757` | 500K+ tokens. Epic scope. Needs decomposition into smaller issues. |

### GROUP: Strategy (exclusive, optional for non-engineering)

Create a parent label group called **"Strategy"** with `isGroup: true`, then each child with `parent: "Strategy"`.

| Label | Color | Description |
|-------|-------|-------------|
| Solo | `#4EA7FC` | Single agent, end-to-end. Clear requirements, just go. |
| Explore | `#68B8F8` | Unknown scope -- investigate codebase BEFORE proposing solution. |
| Team | `#2D6FE4` | Multiple agents in parallel. Frontend + backend + tests concurrently. |
| Human | `#95A2B3` | Requires human decision. UX choices, biz logic, architecture. |
| Worktree | `#5E6AD2` | Git worktree isolation. Risky changes, experimental work. |
| Review | `#7C8DB5` | Audit or review only -- no code changes. Output is a report. |

### Ungrouped Labels (combinable)

These labels are **NOT** inside label groups. Create them as standalone workspace-level labels (no `parent`, no `isGroup`). They can be combined freely on any issue.

#### Component

| Label | Color | Description |
|-------|-------|-------------|
| Frontend | `#F2994A` | Flutter mobile or web UI work |
| Backend | `#F28933` | Server-side work (NestJS, API, GraphQL) |
| Database | `#E87B35` | Schema changes, migrations, queries, ORM |
| Security | `#E06C3A` | Auth, secrets, encryption, vulnerability fixes |
| Performance | `#D4613E` | Optimization, caching, load testing |
| Infra | `#C85640` | Kubernetes, Terraform, CI/CD, Docker, cloud |
| Testing | `#F2C94C` | Unit, integration, e2e tests |
| Web Quality | `#F0B429` | Accessibility, SEO, Core Web Vitals, i18n |

#### Impact

| Label | Color | Description |
|-------|-------|-------------|
| Critical Path | `#EB5757` | Blocks other work or a launch. Must be resolved first. |
| Revenue | `#E5484D` | Directly affects revenue, monetization, or paid features. |
| Grant | `#E06C3A` | Related to grant requirements, compliance, or deliverables. |

#### Flags

| Label | Color | Description |
|-------|-------|-------------|
| Blocked | `#EB5757` | Cannot proceed until a dependency is resolved. |
| Quick Win | `#0B9D6F` | Low effort, high impact. Prioritize when available. |
| Epic | `#5E6AD2` | Parent container for a group of related issues. |

## Project Discovery

If the mode includes `projects`, detect the monorepo structure:

1. **Scan the repo** -- Look for `apps/*/`, `packages/*/`, `infrastructure/`, `k8s/` directories
2. **Read `linear-setup.json`** -- Use existing project mappings as source of truth
3. **For each app found**, check if a Linear project already exists with a matching name
4. **Create missing projects** with:
   - Name derived from the app directory
   - Description from `package.json`, `pubspec.yaml`, or directory inspection
   - Icon emoji matching the technology (NestJS = :gear:, Flutter = :iphone:, Vue = :shield:, etc.)
   - Priority based on app type (backend/mobile = High, web = Medium, infra = High)
5. **Update `linear-setup.json`** with the project ID after creation

### Known Projects for AltruPets

These projects should exist (from `linear-setup.json`):

| Slug | Name | ID |
|------|------|----|
| backend | Backend API | `09000036-5ee3-4a3e-9d28-04be2ef4e37d` |
| mobile | Mobile App | `e3f79c9f-82e9-4d7d-a7ef-f86177d60df3` |
| agent-ai | Agent AI | `192d56f2-3071-4334-b559-1ec598d071d1` |
| infra | Infrastructure & DevOps | `ab10530d-ee89-42b0-8213-4daba05920c3` |
| web-b2g | Web -- B2G | `d9c10a83-dc47-42aa-b637-94d1e490383c` |
| web-superusers | Web -- CRUD Superusers | `1a1591b1-6993-4084-822f-c1ddaccc1c62` |
| design | Diseno y Control Calidad - UX / UI | `a909b375-e591-442e-83be-4eafe95a2934` |
| ops | Operaciones | `0b9f0622-2d6f-4483-a0a4-f9525d0fca04` |

## OpenSpec Integration

When running any mode, check for OpenSpec changes and cross-reference:

1. **List OpenSpec changes** -- Read `openspec/changes/*/proposal.md` for each active change
2. **Extract Linear references** -- Look for `ALT-{N}` patterns in proposals
3. **Cross-reference** -- For each change, verify:
   - The referenced Linear issue exists
   - The issue description mentions the OpenSpec change path
   - The issue has appropriate labels from the taxonomy
4. **Report mismatches** -- Flag changes without Linear issues and issues without OpenSpec changes

## GitHub Apps Integration

When running `audit` or clean slate mode, also verify GitHub Apps configuration:

| App | Config File | Purpose |
|-----|-------------|---------|
| Greptile | `greptile.json` | Automated code review on PRs |
| CodeRabbit | `.coderabbit.yaml` | AI code review with path-specific instructions |
| Graphite | `.graphite/graphite.yaml` | Stacked PRs and trunk-based development |
| Linear | (plugin) | Issue tracking integration |

Report which config files exist and which are missing.

## Conventional Commits

Verify that conventional commits are enforced:

1. Check `.pre-commit-config.yaml` for `conventional-pre-commit` hook
2. If missing, recommend adding it with the standard prefixes: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

## Output

After execution, save a report to `./linear-todo-templates/workspace-setup-report.md`:

``````markdown
# Linear Workspace Setup Report

> **Date:** {ISO date}
>
> **Team:** {team name} ({team key})
>
> **Mode:** {full | labels | projects | audit | sync}
>
> **Base Branch:** {baseBranch from linear-setup.json}

---

## Labels

### Created

| Group | Label | Color | Status |
|-------|-------|-------|--------|
| {group} | {label} | `{hex}` | Created |

### Already Existed

| Group | Label | Color | Status |
|-------|-------|-------|--------|
| {group} | {label} | `{hex}` | Exists (no change) |

### Skipped / Errors

| Group | Label | Reason |
|-------|-------|--------|
| {group} | {label} | {why it was skipped or error message} |

---

## Projects

### Created

| Project | Priority | URL |
|---------|----------|-----|
| {name} | {priority} | {url} |

### Already Existed

| Project | Priority | URL |
|---------|----------|-----|
| {name} | {priority} | {url} |

---

## OpenSpec Cross-Reference

| Change | Linear Issue | Status |
|--------|-------------|--------|
| {change-name} | {ALT-N or MISSING} | {linked/unlinked} |

---

## GitHub Apps

| App | Config | Status |
|-----|--------|--------|
| Greptile | greptile.json | {exists/missing} |
| CodeRabbit | .coderabbit.yaml | {exists/missing} |
| Graphite | .graphite/graphite.yaml | {exists/missing} |
| Conventional Commits | .pre-commit-config.yaml | {enforced/missing} |

---

## Summary

- Labels: {created} created, {existed} already existed, {errors} errors
- Projects: {created} created, {existed} already existed
- OpenSpec changes: {linked} linked, {unlinked} unlinked
- GitHub Apps: {configured}/{total} configured
- Total API calls: {N}

``````

## Rules

1. **Idempotent execution.** Never create duplicates. Always check existence by name before creating. If a label with the same name exists but has a different color or description, report it as `needs_update` but do NOT modify it automatically -- flag it for the user.

2. **Groups before children.** Always create parent label groups before their child labels. The Linear API requires the parent to exist before referencing it.

3. **Workspace-level labels.** Omit `teamId` when creating labels so they are workspace-wide, not team-specific. This ensures labels are shared across all teams.

4. **Destructive operations only in clean mode.** In `labels`, `projects`, `sync`, and `audit` modes, never delete or modify existing resources -- these modes are additive only. In clean mode (empty argument), label deletion is expected but REQUIRES explicit user confirmation. Projects are NEVER deleted in any mode.

5. **Rate limiting.** Linear API has rate limits. If creating many labels, pause briefly between batches. Process in groups of 5-10 with a short delay.

6. **Color consistency.** Use the exact hex colors from the taxonomy above. These were chosen for visual distinction in the Linear UI sidebar.

7. **Label descriptions matter.** Always include the description when creating labels. These show up as tooltips in Linear and help the team understand when to use each label.

8. **Report everything.** The output report must account for every label and project in the taxonomy -- whether it was created, already existed, or failed. Nothing should be silently skipped.

9. **Detect existing conventions.** Before creating labels, check if the workspace already has a different labeling convention. If there's a conflict (e.g., "Bug" exists with a different color), report it but don't overwrite.

10. **Confirmation before mutation.** In audit mode, show the full plan without creating anything. In other modes, show the plan first and ask the user to confirm before making API calls (unless `--yes` flag is provided).

11. **Always update linear-setup.json.** After creating projects or during sync mode, update the `linear-setup.json` file with current project IDs, team info, and any new mappings. This keeps the config file as the single source of truth.

12. **No emojis in output.** Use plain text markers. No unicode emojis or box-drawing characters in reports or comments.

13. **Conventional commit messages.** When the command creates commits (e.g., updating linear-setup.json), use conventional commit format: `chore: sync linear-setup.json with Linear workspace`.

### Usage

```bash
# Clean slate -- delete all labels, recreate full taxonomy + projects
claude /linear-projects-setup

# Only create missing labels (additive, safe)
claude /linear-projects-setup labels

# Only create missing projects (additive, safe)
claude /linear-projects-setup projects

# Dry run -- see what exists vs what's missing (no changes)
claude /linear-projects-setup audit

# Sync linear-setup.json with current Linear state
claude /linear-projects-setup sync

# Skip confirmation prompt (use with caution in clean mode)
claude /linear-projects-setup --yes
claude /linear-projects-setup labels --yes
```

### Requirements

* Linear MCP server configured in Claude Code (plugin or mcp.json)
* At least one team must exist in the Linear workspace
* Write access to the Linear workspace (for creating labels and projects)
* `linear-setup.json` at repo root (created automatically if missing)

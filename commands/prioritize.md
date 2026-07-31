---
description: Applies MoSCoW + RICE-adapted to a scoped set of Linear issues. Workspace-agnostic — optional Linear project, label, or filter scope; optional product-vision evidence anchor; optional vision-audit enrichment. Accepts a scope and flags as $ARGUMENTS.
argument-hint: "[<project-slug>] [--label <name>] [--filter <query>] [--evidence <path-or-issue-id>] [--audit <path>] [--framework <name>] [--no-audit] [--target <description|labels|both>] [--dry-run] [--out <path>] [--issue-ids <ids>] [--codebase <path>]"
priority: 85
---

# /prioritize -- MoSCoW + RICE on any Linear backlog slice

Runs prioritization on a scoped set of Linear issues using **MoSCoW** (bucket
assignment) + **RICE-adapted** (intra-bucket ranking). The command is
workspace-agnostic: it does NOT require a pillar taxonomy, a PIBER+IDCF sub-spike,
or a vision-audit doc. When those signals exist, they enrich Confidence and
citations; when they don't, the run still produces a deterministic snapshot.

## Frameworks base

- **MoSCoW** (bucket assignment): Must / Should / Could / Won't + Unclassified +
  Decompose-required. Deterministic via label-driven rules (see
  `references/scoring-rules.md`); evidence-driven rules layer on top when an
  `--evidence` anchor is provided.
- **RICE-adaptado** (intra-bucket ranking): `(Reach × Impact × Confidence) / Size`.
  `Size` uses T-shirt labels instead of weeks (compatible with the
  `spike-recommend` convention and the `no time estimates` rule).

v1 implements only `moscow-rice`. Other frameworks (`rice`, `moscow`, `ice`,
`wsjf`, `kano`) have stubs under `references/frameworks/` and return
"not yet implemented".

## Modos de invocacion

```bash
# 1. No arguments -- interactive: list Linear projects in the workspace and ask.
/make-no-mistakes:prioritize

# 2. Linear project slug (auto-resolved against linear-setup.json or MCP list).
/make-no-mistakes:prioritize pathways
/make-no-mistakes:prioritize agent --evidence APP-101

# 3. Label-scoped query (project-less workspaces, or cross-project label work).
/make-no-mistakes:prioritize --label "team/frontend"

# 4. Arbitrary Linear filter query.
/make-no-mistakes:prioritize --filter "label:Frontend state:Backlog"

# 5. Provide evidence anchor (Linear issue ID OR local markdown path).
/make-no-mistakes:prioritize pathways --evidence ./docs/vision/pathways.md
/make-no-mistakes:prioritize --filter "team:CORE" --evidence CORE-42

# 6. Provide vision audit enrichment manually.
/make-no-mistakes:prioritize pathways --audit ./audits/pathways/vision-audit-latest.md

# 7. Dry-run + custom output path (default is ./priority-<DATE>.md in cwd).
/make-no-mistakes:prioritize --label "team/mobile" --dry-run --out /tmp/mobile-prio.md

# 8. Subset of issues.
/make-no-mistakes:prioritize pathways --issue-ids APP-123,APP-124

# 9. Legacy pillar mode (backward-compatible; see "Legacy pillar mode" below).
/make-no-mistakes:prioritize mobile   # works if linear-setup.json declares pillars.mobile
```

## Parsing de argumentos

1. **Primer argumento posicional** (optional): a **scope key**.
   - Resolved in this order:
     1. If `linear-setup.json` has `pillars.<slug>`, treat as **legacy pillar mode**
        and pull project/spike/codebase from there (backward-compat).
     2. Else if `linear-setup.json` has `projects.<slug>`, use it as the Linear
        project name/id (workspace-agnostic primary path).
     3. Else try to match a Linear project by name via
        `mcp__linear-server__list_projects`. If exactly one matches, use it.
     4. Else error out with the resolved candidate list.
   - If omitted **and** no `--label`/`--filter` is set, enter interactive mode
     (see "Modo sin argumentos").

2. **Scope flags** (mutually exclusive with positional project arg):

| Flag | Behavior |
|------|----------|
| `--label <name>` | Scope to issues carrying this Linear label (no project required). |
| `--filter <query>` | Pass an arbitrary Linear filter string to `list_issues`. |

3. **Evidence + enrichment flags** (all optional):

| Flag | Default | Behavior |
|------|---------|----------|
| `--evidence <path-or-id>` | none | Linear issue ID (e.g. a PIBER+IDCF sub-spike) OR local markdown path. Used as the rule-citation anchor for MoSCoW + the Confidence anchor for RICE. Without it, MoSCoW falls back to label-only rules and RICE Confidence defaults to 0.8. |
| `--audit <path>` | none | Local vision-audit markdown path. Without it, Confidence stays at 0.8. |
| `--codebase <path>` | cwd or legacy config | Code root used only for resolving `--audit` defaults in legacy mode. |
| `--no-audit` | off | Force-skip audit loading even if discovered. |

4. **Run-control flags**:

| Flag | Default | Behavior |
|------|---------|----------|
| `--framework <name>` | `moscow-rice` | v1 only implements `moscow-rice`. Others error out referencing the stub. |
| `--target <mode>` | `description` | `description`, `labels`, or `both`. v1 supports `description`. `labels`/`both` validate the workspace can apply them. |
| `--dry-run` | off | Do not mutate Linear. Report title becomes "Proposed mutations (dry-run, not applied)". |
| `--out <path>` | `./priority-<YYYY-MM-DD>.md` | Output path. `~/` expanded. In legacy pillar mode the default becomes `<codebase>/audits/<pillar>/priority-<DATE>.md`. |
| `--issue-ids <ids>` | off | Comma-separated subset; the rest of the scope stays untouched in the snapshot. |

## Convencion de output (default)

**Workspace-agnostic default**: `./priority-<YYYY-MM-DD>.md` in the current
working directory. Override with `--out <path>` (supports `~/`). If a file with
the same date already exists, the skill appends `-2`, `-3`, etc. — never
overwriting.

**Legacy pillar default** (only when the first positional arg matched
`pillars.<slug>` in `linear-setup.json`): the report still goes to
`<codebase>/audits/<pillar>/priority-<YYYY-MM-DD>.md`, alongside the vision
audit, to preserve dogfood compatibility.

In both cases git version-controls history;
`ls -t priority-*.md | head -1` (or the `audits/<pillar>/` equivalent) gives the
most recent.

## Flujo del comando

Delegates to the `prioritize` skill, which:

1. **Scope resolution**: parse args to determine whether to fetch by Linear
   project, by label, or by raw filter. Resolve `linear-setup.json` if present
   (pillars-first for legacy, projects-next for agnostic), else fall back to MCP.
2. **Fetch paralelo**: subagents in background for (a) issues in scope, plus
   (b) the `--evidence` anchor when given (Linear issue OR local file), plus
   (c) the `--audit` doc when given (or auto-discovered in legacy mode).
3. **MoSCoW bucket assignment**: apply the deterministic table from
   `references/scoring-rules.md`. Evidence-driven rules only fire when evidence
   was provided; label-only rules always apply. LLM fallback for UNCLASSIFIED
   (see `references/prompts/llm-fallback-bucket.md`).
4. **RICE intra-bucket**: when a bucket has >3 issues, compute
   `(R × I × C) / S` per issue and rank desc.
5. **Artifact composition**:
   - Priority report markdown -> resolved `--out` path.
   - Description footer per issue with idempotent HTML delimiters (only if not
     `--dry-run`).
   - Snapshot comment on the `--evidence` Linear issue when it IS a Linear issue
     (only if not `--dry-run`). When evidence is a local file or absent, this
     artifact is skipped — the report is still written.

See `${CLAUDE_PLUGIN_ROOT}/skills/prioritize/SKILL.md` for detail.

## Regla de idioma

Report in **espanol**. Framework names (MoSCoW, RICE, PIBER, IDCF) and proper
nouns remain in original casing.

## Regla de evidencia

Each verdict in the report cites:
- When evidence is provided: the rule from the anchor that matched (thesis #,
  feature tier, anti-pattern, capability, etc., as parsed).
- When an audit is provided: the audit status (OK / PARTIAL / MISSING / DRIFT /
  VIOLATION).
- The full RICE breakdown (R, I, C, S) when applicable.
- When neither is provided: label-only rationale + a note that this run lacked
  product-vision grounding.

Never claim "Must" without a citation — even when the citation is "two
high-priority labels matched". Never claim "Won't" without an explicit reason.

## Modo sin argumentos

If the user invokes `/prioritize` without positional args AND without
`--label`/`--filter`:

1. List Linear projects in the workspace via `mcp__linear-server__list_projects`
   (and pillars from `linear-setup.json` if present).
2. Ask: "Scope this run to a Linear project, a label, or a custom filter?"
3. Proceed once a scope is chosen.

## Modo sin config

If `linear-setup.json` does not exist:
- The agnostic path still works — the skill goes straight to
  `mcp__linear-server__list_projects` / `list_issues`.
- Offer at the end: "Save the resolved scope to `linear-setup.json` for next
  runs? (yes/no)".

## Legacy pillar mode

When the positional arg matches `pillars.<slug>` in `linear-setup.json`, the
skill activates legacy behavior:
- Pull `project`, `spike`, `codebase` from `pillars.<slug>`.
- Auto-discover the most recent
  `<codebase>/audits/<pillar>/vision-audit-*.md` (unless `--no-audit`).
- Default `--out` becomes `<codebase>/audits/<pillar>/priority-<DATE>.md`.
- Post snapshot comment on the `pillars.<slug>.spike` Linear issue.

This is the original behavior preserved for dogfood configs. New projects
should prefer the agnostic flags.

## Dog-fooding

Originally dogfooded against 2 production pillars in early 2026 (`mobile`,
`agent`). The agnostic mode was added on top to support workspaces without a
pillar taxonomy. See `CHANGELOG.md` "Workspace-agnostic mode" entry.

## Chain posicion

The command fits the toolkit chain:

```
(optional) product-vision-audit -> prioritize -> spike-recommend -> implement
   (business-model)               (this one)     (make-no-mistakes)  (make-no-mistakes)
```

A typical user:
1. Optionally runs `product-vision-audit <scope>` -> generates a vision-audit
   markdown.
2. Runs `prioritize <scope> [--evidence ...] [--audit ...]` -> generates
   `priority-<DATE>.md` + Linear mutations.
3. Takes the top-3 Must from the report and runs
   `spike-recommend <issue-id>` for each.
4. Runs `implement <issue-id>` to execute with discipline (worktree,
   reviewers, CI).

## Requisitos

- `mcp__linear-server` configured and authenticated in the target workspace.
- Optional: `linear-setup.json` at cwd root with either `pillars.<slug>`
  (legacy) or `projects.<slug>` (agnostic), or neither (the skill resolves via
  MCP).
- Optional: an evidence doc (Linear issue or local markdown) for stronger
  rule citations.
- Optional: a vision-audit markdown to lift Confidence beyond the 0.8 default.

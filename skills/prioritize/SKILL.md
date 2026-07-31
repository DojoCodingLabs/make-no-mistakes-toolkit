---
name: prioritize
description: >
  Applies MoSCoW (bucket) + RICE-adapted (intra-bucket ranking) to a scoped set
  of Linear issues. Workspace-agnostic: works with any Linear project, label, or
  filter; an optional product-vision evidence anchor (Linear issue OR local
  markdown) drives stronger citations; an optional vision-audit doc lifts
  Confidence beyond the default. Backward-compatible with the legacy pillar
  taxonomy.
  Use when the user asks to "prioritize issues", "priorizar el pillar",
  "aplicar MoSCoW", "rank the backlog", "RICE scoring", "/prioritize", or wants a
  data-backed decision on what to work on next.
  Do NOT trigger for: issue creation, PR review, or runs with no scope and no
  workspace to inspect.
---

# /prioritize -- MoSCoW + RICE on any Linear backlog slice

Skill that applies **MoSCoW** (bucket) + **RICE-adapted** (ranking) to a scoped
set of Linear issues. The scope can be a Linear project, a label, or a raw
filter. When the caller provides an `--evidence` anchor (Linear issue or local
markdown — e.g. a PIBER+IDCF sub-spike, a PRD, or a vision doc) and/or an
`--audit` markdown, the skill enriches MoSCoW citations and lifts RICE
Confidence beyond the default 0.8.

The output is:

1. A report markdown — default `./priority-<YYYY-MM-DD>.md` in cwd
   (or `<codebase>/audits/<pillar>/priority-<DATE>.md` in legacy pillar mode).
2. A description footer on every scored issue with idempotent HTML delimiters.
3. A snapshot comment on the `--evidence` Linear issue **only when evidence is
   a Linear issue ID** (skipped for local-file evidence or no evidence). Legacy
   pillar mode posts on `pillars.<slug>.spike` as before.

## Workspace-agnostic mode (v1.23+)

Starting with v1.23, the four hard couplings of the original dogfood design are
optional:

| Coupling (v1.0–v1.22) | Status in v1.23+ |
|-----------------------|------------------|
| First arg = required `<pillar-slug>` validated against `pillars.<slug>` | Optional. First positional arg falls through to `pillars.<slug>` → `projects.<slug>` → Linear MCP resolution → interactive list. Also accepts `--label` / `--filter` as alternative scopes. |
| Sub-spike PIBER+IDCF as required Confidence anchor | Optional `--evidence <path-or-issue-id>` flag. Without it, MoSCoW uses label-only rules and Confidence defaults to 0.8. |
| Vision audit auto-discovered at `<codebase>/audits/<pillar>/vision-audit-*.md` | Optional `--audit <path>` flag. Auto-discovery only kicks in for legacy pillar mode. |
| Output path hardcoded to `<codebase>/audits/<pillar>/priority-<DATE>.md` | Optional `--out <path>` (supports `~/`). Default: `./priority-<DATE>.md` in cwd. Legacy pillar mode keeps the original default. |

The legacy behavior is preserved when `linear-setup.json` declares
`pillars.<slug>` — new projects should prefer the agnostic flags but no existing
dogfood config breaks.

## Anti-trigger

This skill does NOT activate when:

- The user wants to create or edit individual issues (use MCP directly).
- The input is a PR, branch, or commit (this skill expects a Linear scope, not
  a code change).
- The user has no Linear workspace authenticated and no `linear-setup.json` —
  exit 1 with a setup hint.

## Config resolution

Reads `linear-setup.json` at the cwd root if present. Both schemas are
supported:

### Agnostic schema (preferred for new projects)

```json
{
  "team": { "key": "DOJ" },
  "projects": {
    "<slug>": "<Linear project name or id>"
  }
}
```

### Legacy pillar schema (kept for backward-compat)

```json
{
  "team": { "key": "APP" },
  "projects": { "...": "..." },
  "pillars": {
    "<slug>": {
      "project": "<Linear project name>",
      "spike": "<Linear issue ID>",
      "codebase": "<path relative to cwd or absolute>"
    }
  }
}
```

Resolution order (when a positional arg is provided):

1. `pillars.<slug>` → **legacy mode** (project + spike + codebase).
2. `projects.<slug>` → **agnostic mode** (project only).
3. `mcp__linear-server__list_projects` exact-name match → **agnostic mode**.
4. No match → error with candidate list, or enter interactive selection.

When no positional arg AND no `--label` / `--filter` is provided, enter
interactive selection (see "Modo sin argumentos" in the command doc).

When `linear-setup.json` does not exist at all, the agnostic path still works
via MCP. The skill offers to save the resolved scope at the end of the run.

## Flujo principal

### Paso A: Fetching paralelo

Dispatch up to 3 subagents via Agent tool with `run_in_background: true`. The
number depends on which optional anchors were provided.

**Subagent 1 -- fetch-issues** (always):
```
description: "Fetch Linear issues for scope=<scope-description>"
subagent_type: "general-purpose"
prompt: |
  Use mcp__linear-server__list_issues to return all issues in scope, in states
  Backlog / Todo / In Progress.

  Scope is one of:
  - project=<linear-project-id-or-name>  (legacy or agnostic mode with positional arg)
  - label=<label-name>                   (--label flag)
  - filter=<linear-filter-string>        (--filter flag)

  If --issue-ids was passed, intersect with that comma-separated list.

  Output JSON array of {id, identifier, title, description, labels, state,
  priority, size_label, estimate} per issue. Reply in under 200 words of
  explanation + JSON.
```

**Subagent 2 -- fetch-evidence** (only when `--evidence` was provided OR legacy
pillar mode supplies a spike):
```
description: "Fetch and parse evidence anchor <evidence-arg>"
subagent_type: "general-purpose"
prompt: |
  The evidence arg is either:
    (a) A Linear issue ID (e.g. APP-101, CORE-42). Use
        mcp__linear-server__get_issue to fetch it.
    (b) A local markdown file path (absolute, ~/-prefixed, or relative to cwd).
        Read it from disk.

  Parse the markdown looking for the standard PIBER+IDCF sections when they
  exist:
    ## P, ## I, ## B, ## E, ## R, ## D -- Design Theses (mark theses with ⚠️ as
    killshot), ## C -- Capabilities (table with build/buy/partner + priority),
    ## F -- Features (P0, P1, P2, P3), and Anti-patterns if present.

  If the doc is NOT PIBER+IDCF-shaped (e.g. a freeform PRD), still extract:
    - any headings that look like priority tiers,
    - any explicit "must-have" / "out-of-scope" / "P0/P1/P2" callouts,
    - any anti-pattern list.

  Output JSON with whichever fields exist + the raw text under `raw` for
  downstream keyword matching. If nothing parseable is found, return
  {parsed: false, raw: "<text>"} and the skill will fall back to label-only
  rules with a warning. Reply in under 300 words + JSON.
```

**Subagent 3 -- load-audit** (only when `--audit` was provided OR legacy pillar
mode auto-discovers one):
```
description: "Load vision audit from <audit-path>"
subagent_type: "general-purpose"
prompt: |
  Path resolution:
  - If --audit was provided: read exactly that file.
  - Else if legacy pillar mode: glob
    '<codebase>/audits/<pillar-slug>/vision-audit-*.md', pick the most recent
    by filename date (YYYY-MM-DD).
  - Else: return {audit: null, reason: 'no audit configured'}.

  Read the matched file. Parse the scorecard table, Design Theses table
  (status OK / PARTIAL / MISSING / DRIFT), Capabilities table, Features by
  tier, Anti-patterns violations, and top 5 recommendations. Output JSON +
  the loaded path. Reply in under 250 words + JSON.
```

Wait for all dispatched subagents before Paso B. Subagent-1 failure → exit 2
with a clear message. Subagent-2 failure → continue with `evidence = null` and
a warning (MoSCoW falls back to label-only rules). Subagent-3 failure (or null)
→ continue with `audit = null` and RICE Confidence default 0.8.

### Paso B: MoSCoW bucket assignment

For each issue from subagent-1, apply the rules from
`references/scoring-rules.md` in order. First match wins.

Output per issue:
- `bucket`: MUST | SHOULD | COULD | WONT | UNCLASSIFIED | DECOMPOSE
- `matched_rules`: array of matched rule slugs
- `cited_thesis` / `cited_feature` / `cited_capability` / `cited_antipattern`:
  references into the evidence anchor when present
- `audit_status`: when audit exists and matches (OK / PARTIAL / MISSING /
  DRIFT / VIOLATION / null)

**Without evidence**: only label-driven and explicit rules fire (e.g.
DECOMPOSE on XL, WONT on phase-conflict, COULD on `ux`/`perf` labels without
contrary signal). The remainder route to UNCLASSIFIED → LLM fallback (see
below).

**UNCLASSIFIED fallback**: if no rule matches, dispatch a synchronous subagent
(no background) using `references/prompts/llm-fallback-bucket.md`, passing the
issue + relevant sections of the evidence anchor when present. If confidence <
0.6 → keep UNCLASSIFIED. If ≥ 0.6 → assign returned bucket + annotate
`matched_rules: ["llm-fallback"]` + `llm_rationale: <response>`.

**DECOMPOSE**: issues with `size_label == "XL"` go directly to DECOMPOSE,
short-circuiting all other rules. They receive no RICE score and appear in a
separate report section.

### Paso C: RICE intra-bucket ranking

For each bucket (MUST, SHOULD, COULD, WONT), if it has > 3 issues:

1. Compute RICE per issue: `(Reach × Impact × Confidence) / Size`.
2. Variables:
   - **Reach**: infer from evidence (`every user` = 9, `<scope> users` = 3,
     `admin-only` = 1). Default 3.
   - **Impact**: `0` (no thesis advanced), `1` (1 match), `2` (2+ matches),
     `3` (killshot ⚠️ match). When no evidence: collapses to 0 or 1 based on
     label heuristics; flagged as `low-confidence-estimate`.
   - **Confidence**: audit lookup. `PARTIAL` → 1.0, `DRIFT` → 0.8, `MISSING` →
     0.5. No audit, ambiguous, or `--no-audit` → 0.8.
   - **Size**: XS=1, S=2, M=4, L=8. (XL → DECOMPOSE.) No label → M=4 + flag
     `low-confidence-estimate`.
3. Rank desc. Ties broken by `issue.identifier` lexicographic asc.

If a bucket has ≤ 3 issues, keep natural order without ranking. See
`references/frameworks/moscow-rice.md` for edge cases.

### Paso D: Confidence flags

Mark each issue with `low-confidence-estimate` if:
- `size_label` missing → Size defaulted to M.
- `description.length < 100` → Reach/Impact inferred only from title.
- `--no-audit` was passed but an audit is on disk → Confidence defaulted.
- No `--evidence` was provided → Impact derived from labels only.
- Subagent-2 parse warnings present (ambiguity in evidence sections).

The flag is shown as "⚠" next to the RICE score in the report. It does NOT
block ranking.

### Paso E: Composicion de artifacts

Generate up to 3 artifacts in parallel (via Agent tool subagents for heavy I/O)
or sequential if simpler:

**Artifact 1 -- Priority report markdown**:
- Resolve the output path:
  - `--out <path>` if provided (expand `~/`).
  - Else if legacy pillar mode:
    `<codebase>/audits/<pillar>/priority-<YYYY-MM-DD>.md` (mkdir -p).
  - Else: `./priority-<YYYY-MM-DD>.md` in cwd.
- If the same path already exists (same date), append suffix `-2`, `-3`, etc.
- Template: see `references/linear-mutations.md` "Priority report template".

**Artifact 2 -- Description footer per issue**:
- Only if `--dry-run = false`.
- For each scored issue, read the current description via
  `mcp__linear-server__get_issue`.
- Apply the idempotent replacement rule from
  `references/linear-mutations.md` "Delimiter convention".
- Write the updated description via `mcp__linear-server__save_issue`.
- Log success/fail per issue. Failures do NOT abort the batch — reported at
  the end.

**Artifact 3 -- Snapshot comment on evidence Linear issue**:
- Only if `--dry-run = false` AND `--evidence` is a Linear issue ID
  (NOT a local file) — OR legacy pillar mode (post on
  `pillars.<slug>.spike`).
- Never edit a previous comment; always add a new one with date.
- If a previous matching comment exists, link to it from the new one.
- Use `mcp__linear-server__save_comment` with the body from
  `references/linear-mutations.md` "Sub-spike comment template".
- When evidence is a local file or absent, skip this artifact — the report is
  still written.

### Paso F: Resumen al usuario

At the end of execution (regardless of dry-run):

```
Priority snapshot generated for <scope>:
  Must:         N issues (top: ALT-XXX, RICE=X.X)
  Should:       N issues
  Could:        N issues
  Won't:        N issues
  Unclassified: N issues (needs human review)
  Decompose:    N issues (XL-sized, suggest /spike-recommend)

Report: <path to priority-*.md>
<If !dry-run AND mutations applied:>
  Descriptions updated: N/M issues (<failure count> failures)
  Evidence comment: <link to comment or "skipped — evidence is a file / absent">
<If dry-run:>
  Mutations proposed but NOT applied. Run without --dry-run to apply.

Next steps:
  - Review top Musts in the report.
  - Run `/make-no-mistakes:spike-recommend <issue-id>` for the top-3 Must.
  - Run `/make-no-mistakes:implement <issue-id>` once each brief is ready.
```

## Error handling

See `references/scoring-rules.md` and `references/linear-mutations.md` for
detail per case. Summary table:

| Scenario | Action |
|----------|--------|
| linear-setup.json does not exist | Fine — agnostic path resolves via MCP. Offer to save scope at end. |
| `pillars.<slug>` not in config AND no other resolution match | Interactive selection. |
| MCP linear-server not available | Exit 1 with setup message. |
| Subagent fetch-issues fails | Exit 2, do not touch Linear. |
| Subagent fetch-evidence fails | Warn, continue with evidence=null + label-only MoSCoW. |
| Subagent load-audit fails | Warn, continue with audit=null and Confidence=0.8. |
| Evidence has no parseable IDCF sections | Warn, MoSCoW falls back to label-only rules; the raw text is still keyword-searched. |
| Issue without Size label | Default=M + flag low-confidence-estimate. |
| `--target=labels` and labels missing | Exit 1, suggest asking admin + using --target=description. |
| Description update fails for 1+ issues | Continue batch, report failures at end. Exit 3 if > 0% failures. |
| --dry-run + mutations in output | "Proposed" in report title + skip Artifacts 2-3. |
| `--evidence` and `--audit` both omitted | Allowed — run with Confidence=0.8 and label-only rules. Report notes the lack of vision grounding. |

## Reglas de oro

1. **Deterministic first, LLM second**: MoSCoW rules apply first. LLM only for
   residual UNCLASSIFIED.
2. **Always cite**: each bucket assignment cites the match (rule slug + thesis
   # / feature tier / anti-pattern / label / audit status as applicable).
3. **Linear idempotency**: running twice should yield the same result.
   Description footer is replaced, never stacked. Evidence snapshot comment is
   new each run (no edit of the previous one).
4. **Snapshot coexistence**: the report does NOT overwrite previous ones. Git
   version-controls the history.
5. **No time estimates**: never say "2 sprints", "1 month". Sequential
   ordering with conceptual milestones.
6. **Respect the config**: never invent project/spike/codebase. Resolve via
   `pillars` → `projects` → MCP → ask the user. Offer to save the resolved
   scope.
7. **Transparent low-confidence**: when data is missing, set the flag — do not
   guess silently. Absence of `--evidence` is itself a low-confidence signal.

## Interaccion con el usuario

- Confirm args at start when something is ambiguous (no scope, codebase
  missing, MCP unavailable).
- Show progress: "Fetching issues + evidence + audit in parallel...",
  "Applying MoSCoW rules to N issues...", "Computing RICE in bucket Must...".
- At the end, show the Paso F summary.
- Ask about failed mutations: "Retry the N issues that failed?".

## Fallbacks

If the resolved output directory does not exist:
- Create it with `mkdir -p` before writing the report.
- For legacy pillar mode without prior `audits/<pillar>/`, mention in the
  executive summary: "first priority snapshot, no prior history".

If the scope returns > 200 issues:
- Warn the user: "200+ issues detected, this may take a while. Consider
  filtering with --issue-ids, --filter, or closing stale issues first."
- Proceed anyway.

## Referencias

- `references/scoring-rules.md` -- deterministic MUST/SHOULD/COULD/WONT table.
- `references/frameworks/moscow-rice.md` -- v1 impl (RICE formula, edge cases).
- `references/frameworks/{rice,moscow,ice,wsjf,kano}.md` -- v2 stubs.
- `references/linear-mutations.md` -- delimiter convention + templates.
- `references/prompts/llm-fallback-bucket.md` -- LLM prompt for UNCLASSIFIED
  fallback.

Original spec: `docs/superpowers/specs/2026-04-21-prioritize-command-design.md`.
Agnostic-mode rationale: see CHANGELOG entry "Workspace-agnostic prioritize
mode" plus the Andres analysis 2026-06-02.

---
description: Generate or update a TestSprite-compatible test-suite.json from use case documentation. Accepts a URL or file path as $ARGUMENTS.
priority: 30
---

# /e2e-test-builder — TestSprite JSON Test Suite Generator

You are a BDD test architect. Your job is to generate a `test-suite.json` file following the TestSprite-compatible 4-level schema (meta -> use_cases -> features -> test_cases).

## Input

**Use-case source:** `$ARGUMENTS`

If `$ARGUMENTS` is empty, ask:

> What is the source of your use cases? Provide a URL or file path to the documentation that describes your workflows, user journeys, or feature specs.
> Example: `https://github.com/org/repo/blob/main/docs/workflows.md` or `./docs/PRD.md`

Fetch the source using WebFetch (for URLs) or Read (for local files). Parse it to extract:
- Use cases / user journeys / workflows
- User personas (who interacts with the system)
- Agent/system personas (who responds)
- Tools, APIs, or capabilities the system exposes
- Business rules, HITL checkpoints, error scenarios

## Interactive Configuration

After reading the source, ask these questions ONE AT A TIME using AskUserQuestion. If the user passes flags in $ARGUMENTS, skip the corresponding question.

### Question 1: Output Hierarchy

> How should I organize the test output?
>
> 1. **Project structure** — Mirror your project's architecture (e.g., `src/features/auth/` -> `tests/features/auth/test-suite.json`)
> 2. **Domain hierarchy** — Group by use case (`e2e/{use-case}/test-suite.json`)
> 3. **Flat** — Single `./e2e/test-suite.json` with everything
>
> (Default: 3 — Flat)

### Question 2: Runner Selection

Detect the project's tech stack by checking for:
- `package.json` -> suggest cucumber-js, playwright-bdd
- `pubspec.yaml` -> suggest flutter-integration, patrol
- `.mcp.json` or MCP config -> suggest chrome-devtools-mcp, slack-mcp
- `Gemfile` -> suggest cucumber-ruby
- `requirements.txt` / `pyproject.toml` -> suggest behave, pytest-bdd

Present:

> Which test runners will you use? (Select all that apply)
>
> [x] cucumber-js — API & tool-level tests (Node.js) [detected]
> [x] playwright-bdd — Web UI tests [detected]
> [ ] chrome-devtools-mcp — Live browser debugging via MCP
> [ ] slack-mcp — Channel-based Slack integration tests
> [ ] flutter-integration — Flutter widget + integration tests
> [ ] patrol — Native Flutter E2E testing
> [ ] + Add custom runner...
>
> (Space to toggle, Enter to confirm)

If the user picks "+ Add custom runner", ask for: runner ID (slug), name, type (automated/interactive), run command, description.

### Question 3: Bug Reporting

> When tests fail or I find coverage gaps, how should I report them?
>
> 1. **Linear issues** — Create issues in Linear via MCP (requires Linear MCP configured)
> 2. **Screen summary** — Show a /summarize-style report in the terminal only
> 3. **Both** — Create Linear issues AND show summary
>
> (Default: 2 — Screen summary)

### Question 4: Markdown Report

> Should I generate a Markdown report of the test suite for documentation?
>
> 1. **Yes, overwrite** `docs/last-test-run.md` — viewable in VSCode preview, GitHub Pages, MkDocs, Docusaurus
> 2. **Yes, timestamped** — `docs/test-runs/YYYY-MM-DD-HH-mm.md` (no overwrite)
> 3. **No** — JSON only
>
> (Default: 1 — Overwrite last-test-run.md)

## Generation Process

After configuration, generate the test suite following this exact schema:

### 4-Level JSON Schema

```jsonc
{
  "meta": {
    "project": "{detected from package.json name or directory}",
    "version": "1.0.0",
    "generated": "{ISO-8601 timestamp}",
    "total_cases": 0,
    "runners": {
      // Populated from runner selection above
      "{runner-id}": {
        "name": "{display name}",
        "type": "automated|interactive",
        "extract_cmd": "{command or null}",
        "run_cmd": "{command or null}",
        "description": "{description}"
      }
    }
  },
  "use_cases": {
    // One entry per use case extracted from the source document
    "{slug}": {
      "name": "{display name}",
      "description": "{1-line description}",
      "user_persona": { "name": "{name}", "role": "{role}" },
      "default_agent_persona": { "id": "{id}", "name": "{name}", "model": "{model}" }
    }
  },
  "features": {
    // One entry per feature (use_case + workflow_step combination)
    "{use-case-slug}-{step-slug}": {
      "use_case_id": "{use-case-slug}",
      "name": "{Feature display name}",
      "workflow_step": 1,
      "workflow_name": "{step name}",
      "tags": ["@{use-case}", "@{step}", "@workflow-step-{N}"],
      "background": "{Gherkin Background or null}",
      "scenario_count": 0
    }
  },
  "test_cases": [
    {
      // TestSprite standard
      "id": "TC-{NNN}",
      "title": "{scenario title}",
      "description": "{context}",
      "category": "functional|security|ui_ux|performance",
      "priority": "High|Medium|Low",
      "steps": [
        { "type": "action|assertion", "description": "{step}" }
      ],
      // Project (BDD generic)
      "project": {
        "feature_id": "{feature-key}",
        "coverage_group": "{UPPER CASE from coverage_type}",
        "coverage_type": "happy_path|hitl|error|edge_case|performance|security",
        "runners": ["{runner-id}"],
        "gherkin": "{Scenario body without Background}"
      },
      // Denormalized (auto-derived from L1+L2)
      "denorm": {
        "use_case": "{from features[].use_case_id}",
        "workflow_step": null,
        "workflow_name": null,
        "tags": [],
        "agent_persona_id": "{from use_cases[].default_agent_persona.id}",
        "agent_persona_name": "{from use_cases[].default_agent_persona.name}",
        "model": "{from use_cases[].default_agent_persona.model}",
        "user_persona_name": "{from use_cases[].user_persona.name}"
      },
      // Metadata (project-specific)
      "metadata": {
        "hitl_required": false,
        "test_questions": {
          "es": "{realistic test question in Spanish}",
          "en": "{realistic test question in English}"
        }
      }
    }
  ]
}
```

### Generation Rules

1. **IDs**: Sequential `TC-001`, `TC-002`, ... No gaps.
2. **Steps derivation**: `Given`/`When` -> `action`. `Then` -> `assertion`. `And`/`But` inherit from the preceding keyword.
3. **coverage_group**: Derived 1:1 from `coverage_type`:
   - `happy_path` -> `HAPPY PATH`
   - `hitl` -> `HITL CHECKPOINT`
   - `error` -> `ERROR`
   - `edge_case` -> `EDGE CASES`
   - `performance` -> `PERFORMANCE`
   - `security` -> `SECURITY`
4. **denorm**: Auto-populate by following `feature_id` -> `features{}` -> `use_case_id` -> `use_cases{}`.
5. **meta.total_cases**: Must equal `test_cases.length`.
6. **features[].scenario_count**: Must equal count of test_cases referencing that feature.
7. **Test questions**: Generate bilingual (ES/EN) realistic messages matching the user persona's communication style.
8. **Runners**: Assign based on the runner selection decision tree:
   - API/logic/DB tests -> first automated runner (cucumber-js, behave, etc.)
   - Web UI tests -> playwright-bdd or equivalent
   - Live debugging -> chrome-devtools-mcp
   - Slack/channel tests -> slack-mcp
   - A test case can have MULTIPLE runners: `["playwright-bdd", "chrome-devtools-mcp"]`

### Coverage Dimensions

For each feature, generate scenarios across these dimensions:
- **Happy path** — the expected successful flow
- **HITL checkpoints** — human approval/rejection gates (if applicable)
- **Error handling** — timeouts, retries, graceful degradation
- **Edge cases** — concurrent requests, language handling, boundary values
- **Security** — auth, injection, PII, rate limits (if applicable)
- **Performance** — latency targets, throughput (if applicable)

### After Generation

1. **Write the JSON** to the path determined by the output hierarchy question.
2. **Validate** by running the checks:
   - Unique sequential IDs
   - All feature_id references valid
   - All runner references valid
   - coverage_group matches coverage_type
   - denorm fields match L1+L2 sources
   - total_cases correct
   - scenario_counts correct
3. **Report findings** based on the bug reporting choice:
   - If "Linear issues": create one issue per coverage gap or test failure found
   - If "Screen summary": display the summary inline
   - If "Both": do both
4. **Generate Markdown** based on the report choice:
   - Write the test matrix as a Markdown table with columns: ID | Use Case | Step | Title | Persona | Coverage | Runners | Priority
   - Include a summary section with counts by use case, runner, and coverage type
   - Include the jq query reference for the generated suite

## Extending an Existing Suite

If a `test-suite.json` already exists at the target path:
- Read it first
- Detect the next available TC-{NNN} ID
- Append new test cases without modifying existing ones
- Update `meta.total_cases` and `features[].scenario_count`
- Re-validate the full suite

## Example Usage

```bash
# Generate from a URL
/e2e-test-builder https://github.com/org/repo/blob/main/docs/workflow-overview.md

# Generate from a local file
/e2e-test-builder ./docs/PRD.md

# Interactive (no arguments)
/e2e-test-builder
```

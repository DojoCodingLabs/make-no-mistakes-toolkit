---
description: Execute E2E tests from a test-suite.json file. Selects the optimal runner for each scenario, produces immutable result files, and optionally reports to Linear or Markdown. Accepts a path to test-suite.json or a jq filter as $ARGUMENTS.
priority: 30
---

# /e2e-test-runner — TestSprite JSON Test Execution Orchestrator

You are a test execution strategist. Your job is to consume a `test-suite.json`, determine the best runner for each scenario, orchestrate execution, and produce immutable result files.

## Input

**Suite path or filter:** `$ARGUMENTS`

If `$ARGUMENTS` is empty, look for `test-suite.json` in the current directory and `gherkin/test-suite.json`. If neither exists, ask:

> Where is your test-suite.json? Provide the path.

If `$ARGUMENTS` starts with a jq expression (e.g., `select(.denorm.use_case == "b2b-staffing")`), use it as a filter on the default test-suite.json.

If `$ARGUMENTS` is a file path, use it directly.

## Interactive Configuration

After loading the suite, ask these questions ONE AT A TIME. Skip any that were passed as flags in $ARGUMENTS.

### Question 1: Execution Strategy

> Which execution strategy?
>
> 1. **Smoke** — Representative subset, core functionality (~5 min)
> 2. **Full Regression** — Complete suite, all runners (~30-45 min)
> 3. **Targeted** — Specific feature, tag, or persona (you'll specify a filter next)
> 4. **Pre-Deploy** — Security + HITL + performance baselines
>
> (Default: 1 — Smoke)

If "Targeted" is selected, ask:

> What should I target? Provide a jq filter or describe what you want to test.
> Examples:
> - `@security` — all security tests
> - `b2b-staffing` — all B2B tests
> - `workflow-step-3` — all Match step tests
> - `The Tech Lead` — all tests for a specific persona

### Question 2: Bug Reporting

> When tests fail, how should I report them?
>
> 1. **Linear issues** — Create one issue per failure in Linear via MCP
> 2. **Screen summary** — Show results in the terminal only
> 3. **Both** — Create Linear issues AND show summary
>
> (Default: 2 — Screen summary)

### Question 3: Markdown Report

> The JSON result file (`results/run-{datetime}-{salt}.json`) will be generated automatically. Additionally, should I export a Markdown report?
>
> 1. **Yes** — Overwrite `docs/last-test-run.md` (viewable in VSCode preview, GitHub Pages, MkDocs)
> 2. **No** — JSON result file only
>
> (Default: 1 — Yes)

## Execution Flow

### Step 0: Load and Filter

```bash
# Load the suite
SUITE="test-suite.json"

# Apply filter if targeted
jq "[.test_cases[] | $FILTER]" "$SUITE" > /tmp/filtered-cases.json
```

### Step 1: Extract .feature Files (for automated runners)

Check `meta.runners` for runners with `type: "automated"` and `extract_cmd` set:

```bash
./scripts/extract-features.sh
```

### Step 2: Execute by Runner Type

For each test case, check `project.runners[]` and dispatch to the appropriate runner:

**Automated runners** (cucumber-js, playwright-bdd, flutter-integration, etc.):
- Use their `run_cmd` from `meta.runners`
- For targeted runs, filter features first with jq, extract only matching ones
- Capture stdout, exit code, and timing

**Interactive runners** (chrome-devtools-mcp, slack-mcp):
- Read `project.gherkin` as the test script
- Read `metadata.test_questions` for realistic input messages
- Navigate, interact, and verify using MCP tools
- Record pass/fail based on assertions in the gherkin

### Step 3: Produce Result File

Generate an immutable result file:

```
results/run-{YYYY-MM-DDTHH-mm-ss}-{5char-salt}.json
```

Schema:

```jsonc
{
  "run_id": "run-2026-03-23T14-30-00-a7k2m",
  "suite_version": "1.0.0",
  "executed_at": "2026-03-23T14:30:00Z",
  "strategy": "smoke|full_regression|targeted|pre_deploy",
  "filter": "the jq filter applied, or null",
  "results": [
    {
      "test_id": "TC-001",
      "runners_used": ["cucumber-js"],
      "status": "passed",
      "duration_ms": 1250,
      "error": null
    }
  ],
  "summary": {
    "total": 15,
    "passed": 14,
    "failed": 1,
    "skipped": 0,
    "pass_rate": 0.933
  }
}
```

- `runners_used` is ALWAYS an array, even for single-runner tests
- `status` is `failed` if ANY runner in the array failed
- The salt is 5 random alphanumeric characters

### Step 4: Report

Based on the user's choices:

**Screen summary:**
```
Test Execution Report — run-2026-03-23T14-30-00-a7k2m
═══════════════════════════════════════════════════════

Strategy: smoke
Suite: dojo-agent-openclaw-plugin v1.0.0

Runner              Cases    Passed    Failed    Skipped
─────────────────────────────────────────────────────────
cucumber-js         12       11        1         0
playwright-bdd      3        3         0         0
─────────────────────────────────────────────────────────
TOTAL               15       14        1         0

Pass Rate: 93.3%

Failed:
  TC-045: B2B Settle — Escrow timeout handling
    Runner: cucumber-js
    Error: Timeout after 5000ms waiting for escrow release
```

**Linear issues:** For each failed test, create an issue:
- Title: `[E2E Fail] {test_id}: {title}`
- Labels: Bug, Testing
- Description: include error, runner, gherkin, test questions
- Assign to user

**Markdown report:** Write a markdown table with all results plus the summary.

## Runner Selection Decision Tree

```
Is the test case about...

├── Agent logic, tool calls, DB state, hooks, business rules?
│   └── → first automated runner (cucumber-js, behave, etc.)
│
├── Web UI rendering, widget behavior, SSE streaming?
│   ├── Automated regression? → playwright-bdd
│   └── Live debugging/inspection? → chrome-devtools-mcp
│
├── Slack channel interaction, persona routing via Slack?
│   └── → slack-mcp
│
├── Performance benchmarking?
│   ├── API latency → automated runner with timing assertions
│   ├── Web performance (LCP, FID) → chrome-devtools-mcp (Lighthouse)
│   └── UI rendering → playwright-bdd with performance marks
│
├── Security testing?
│   ├── SQL injection, PII, auth bypass → automated runner
│   ├── XSS, CSRF in UI → playwright-bdd
│   └── Network-level → chrome-devtools-mcp
│
└── Cross-channel (web + Slack)?
    └── → Combination: multiple runners per test case
```

## Execution Strategies (Detail)

### A: Smoke Test

Quick validation of core functionality:

```bash
# Filter: one happy-path test per use case
jq '[.test_cases[] | select(.project.coverage_type == "happy_path")] | group_by(.denorm.use_case) | map(first)' test-suite.json
```

### B: Full Regression

Run everything:

```bash
./scripts/extract-features.sh
npx cucumber-js --format html:reports/cucumber.html
npx bddgen && npx playwright test --reporter=html
# Interactive runners: execute via MCP tools
```

### C: Targeted Investigation

Filter then run:

```bash
# By tag
jq '.test_cases[] | select(.denorm.tags | index("@security"))' test-suite.json

# By persona
jq '.test_cases[] | select(.denorm.agent_persona_id == "projects")' test-suite.json

# By workflow step
jq '.test_cases[] | select(.denorm.workflow_step == 3)' test-suite.json
```

### D: Pre-Deploy Validation

Non-negotiable checks before deploying:

```bash
# 1. Security (all)
jq '[.test_cases[] | select(.project.coverage_type == "security")]' test-suite.json

# 2. HITL checkpoints (all)
jq '[.test_cases[] | select(.metadata.hitl_required == true)]' test-suite.json

# 3. Performance baselines
jq '[.test_cases[] | select(.project.coverage_type == "performance")]' test-suite.json
```

## jq Query Reference

```bash
# All tests for a persona
jq '.test_cases[] | select(.denorm.agent_persona_id == "projects")' test-suite.json

# Tests by user + step
jq '.test_cases[] | select(.denorm.user_persona_name == "David" and .denorm.workflow_step == 3)' test-suite.json

# Security + HITL
jq '.test_cases[] | select(.project.coverage_type == "security" and .metadata.hitl_required)' test-suite.json

# Spanish test questions for Slack
jq -r '.test_cases[] | select(.project.runners | index("slack-mcp")) | .metadata.test_questions.es' test-suite.json

# Count by use case
jq '[.test_cases[].denorm.use_case] | group_by(.) | map({(.[0]): length}) | add' test-suite.json

# Tests using Chrome DevTools
jq '.test_cases[] | select(.project.runners | index("chrome-devtools-mcp"))' test-suite.json

# Filter by model
jq '.test_cases[] | select(.denorm.model == "gemini-2.5-pro")' test-suite.json

# Failed tests from a result file
jq '.results[] | select(.status == "failed")' results/run-*.json

# Pass rate from a result file
jq '.summary.pass_rate' results/run-*.json
```

## Example Usage

```bash
# Run smoke tests (interactive config)
/e2e-test-runner

# Run full regression on a specific suite
/e2e-test-runner ./gherkin/test-suite.json

# Run only security tests
/e2e-test-runner 'select(.project.coverage_type == "security")'

# Run tests for The Tech Lead persona
/e2e-test-runner 'select(.denorm.agent_persona_id == "projects")'
```

# Audit-Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundation vertical slice of the audit-engine family in `make-no-mistakes-toolkit`: the shared report contract, the `audit-engine` skill, the first audit (`/audit-schema-drift`), the findings-doc emitter, the `/domain-driven-advisor` guided entry point, and a README overhaul that links to every command/skill and teaches `/domain-driven-advisor`.

**Architecture:** The detection logic that benefits from determinism lives in small, unit-tested TypeScript functions under `src/audit/` (a schema-drift verifier, the advisor routing function, the findings-doc renderer). The orchestration, prompts, and per-family detection live in Markdown (`skills/`, `commands/`, `references/`) consumed by Claude at runtime. A JSON Schema (`schemas/audit-report-schema.schema.json`) is the machine-checkable SSOT for every emitted findings document.

**Tech Stack:** TypeScript + vitest (unit tests), ajv (JSON-Schema validation), Markdown (skills/commands/references), the existing `premortem` skill (reused by the advisor).

**Scope note:** This is Plan 1 of 6. It builds the engine + the `SCH` (schema-drift) family end-to-end. The remaining families — `CDC`, `DDD`, `ARC`, `STR`, `ENF` — are follow-up plans that each add one detector profile + verifier + command + fixtures + one advisor-routing entry + one README row, with **no engine changes**. See the OpenSpec change `openspec/changes/2026-06-02-audit-engine-family/`.

---

## File Structure

**New files:**
- `vitest.config.ts` — test runner config (root).
- `schemas/audit-report-schema.schema.json` — JSON Schema for findings front-matter + finding objects (the contract SSOT).
- `references/audit-report-schema.md` — human-readable contract doc.
- `references/detectors/schema-drift.md` — `SCH` detector profile (data).
- `src/audit/types.ts` — shared TS types (`Finding`, `AuditReport`, `AuditId`, `Severity`).
- `src/audit/verifiers/schema-drift.ts` — `findDuplicatedColumns()` deterministic check.
- `src/audit/verifiers/schema-drift.test.ts` — unit tests + golden fixtures.
- `src/audit/__fixtures__/schema-drift/{dirty.sql,clean.sql}` — golden fixtures.
- `src/audit/advisor-routing.ts` — `recommendAudits()` pure routing function.
- `src/audit/advisor-routing.test.ts` — table-driven routing tests.
- `src/audit/emit/findings-doc.ts` — `renderFindingsDoc()` markdown renderer.
- `src/audit/emit/findings-doc.test.ts` — renderer + schema-conformance test.
- `skills/audit-engine/SKILL.md` — the engine flow (stages 0–5).
- `skills/domain-driven-advisor/SKILL.md` — the guided router + premortem tail.
- `references/domain-driven-advisor-triage.md` — the decision tree.
- `commands/audit-schema-drift.md` — thin command.
- `commands/domain-driven-advisor.md` — thin command.

**Modified files:**
- `package.json` — wire `test` to vitest, add `ajv` devDep.
- `README.md` — navigation links for every command/skill + a `/domain-driven-advisor` teaching section.

---

## Task 1: Test harness (vitest)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts.test, devDependencies)

- [ ] **Step 1: Create vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 2: Wire the test script + add ajv**

In `package.json`, replace the `test` script and add `ajv` to `devDependencies`:

```json
"scripts": {
  "test": "vitest run"
}
```
```json
"devDependencies": {
  "ajv": "^8.17.1"
}
```

Then run: `npm install`
Expected: `ajv` added, lockfile updated.

- [ ] **Step 3: Add a smoke test so the runner has something to run**

```typescript
// src/audit/smoke.test.ts
import { describe, it, expect } from "vitest";

describe("audit harness", () => {
  it("runs", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/audit/smoke.test.ts
git commit -m "test: wire vitest + ajv for the audit-engine slice"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/audit/types.ts`

- [ ] **Step 1: Define the contract types**

```typescript
// src/audit/types.ts
export type Severity = "blocker" | "high" | "medium" | "low" | "advisory";

export type AuditId = "SCH" | "CDC" | "DDD" | "ARC" | "STR" | "ENF";

export type Cure = "ownership" | "ci_guard" | "agent_rule" | "hook";

export interface Evidence {
  file: string;
  line?: number;
  snippet?: string;
}

export interface Finding {
  id: string;            // e.g. "SCH-001"
  title: string;
  severity: Severity;
  anti_pattern: string;  // citation, e.g. "1NF (Codd 1970) + DRY"
  evidence: Evidence[];
  owner?: string;
  cure_map: Cure[];
  exemption?: string;    // honors "@repo-health-exempt: <reason>"
  confidence: "confirmed" | "probable" | "unverified";
}

export interface AuditReport {
  family: AuditId;
  repo: string;
  stack: string;
  date: string;          // ISO yyyy-mm-dd, passed in (no Date.now in pure code)
  engine_version: string;
  findings: Finding[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/audit/types.ts
git commit -m "feat(audit): shared contract types"
```

---

## Task 3: Report contract — JSON Schema + doc

**Files:**
- Create: `schemas/audit-report-schema.schema.json`
- Create: `references/audit-report-schema.md`
- Create: `src/audit/contract.test.ts`

- [ ] **Step 1: Write the failing schema-conformance test**

```typescript
// src/audit/contract.test.ts
import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import schema from "../../schemas/audit-report-schema.schema.json";
import type { AuditReport } from "./types";

const sample: AuditReport = {
  family: "SCH",
  repo: "dojo-os",
  stack: "supabase",
  date: "2026-06-02",
  engine_version: "1.0.0",
  findings: [
    {
      id: "SCH-001",
      title: "`bio` duplicated across 3 tables without SSOT",
      severity: "high",
      anti_pattern: "1NF (Codd 1970) + DRY",
      evidence: [{ file: "supabase/migrations/x.sql", line: 12 }],
      cure_map: ["ownership", "ci_guard"],
      confidence: "confirmed",
    },
  ],
};

describe("audit-report contract", () => {
  it("validates a well-formed report", () => {
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    expect(validate(sample)).toBe(true);
  });

  it("rejects a report with an unknown severity", () => {
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const bad = { ...sample, findings: [{ ...sample.findings[0], severity: "nope" }] };
    expect(validate(bad)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/audit/contract.test.ts`
Expected: FAIL — cannot import missing `schemas/audit-report-schema.schema.json`.

- [ ] **Step 3: Write the schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://raw.githubusercontent.com/DojoCodingLabs/make-no-mistakes-toolkit/main/schemas/audit-report-schema.schema.json",
  "title": "Audit Report",
  "type": "object",
  "required": ["family", "repo", "stack", "date", "engine_version", "findings"],
  "additionalProperties": false,
  "properties": {
    "family": { "enum": ["SCH", "CDC", "DDD", "ARC", "STR", "ENF"] },
    "repo": { "type": "string" },
    "stack": { "type": "string" },
    "date": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
    "engine_version": { "type": "string" },
    "findings": { "type": "array", "items": { "$ref": "#/definitions/finding" } }
  },
  "definitions": {
    "finding": {
      "type": "object",
      "required": ["id", "title", "severity", "anti_pattern", "evidence", "cure_map", "confidence"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "pattern": "^(SCH|CDC|DDD|ARC|STR|ENF)-[0-9]{3}$" },
        "title": { "type": "string" },
        "severity": { "enum": ["blocker", "high", "medium", "low", "advisory"] },
        "anti_pattern": { "type": "string" },
        "evidence": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["file"],
            "additionalProperties": false,
            "properties": {
              "file": { "type": "string" },
              "line": { "type": "integer" },
              "snippet": { "type": "string" }
            }
          }
        },
        "owner": { "type": "string" },
        "cure_map": {
          "type": "array",
          "items": { "enum": ["ownership", "ci_guard", "agent_rule", "hook"] }
        },
        "exemption": { "type": "string" },
        "confidence": { "enum": ["confirmed", "probable", "unverified"] }
      }
    }
  }
}
```

Note: `tsconfig.json` must allow JSON imports — verify `"resolveJsonModule": true` is set; add it if missing.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/audit/contract.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the human-readable contract doc**

Create `references/audit-report-schema.md` documenting: the finding-ID namespaces (`SCH/CDC/DDD/ARC/STR/ENF` + `E###` for atomic-design-toolkit), the severity ladder aligned with `docs/repo-health/governance.md`, every finding field from the schema, the `@repo-health-exempt:` marker, and the four emission targets. State explicitly that this file is the SSOT and that `atomic-design-toolkit`'s `audit-report-schema.md` is a conformant profile.

- [ ] **Step 6: Commit**

```bash
git add schemas/audit-report-schema.schema.json references/audit-report-schema.md src/audit/contract.test.ts tsconfig.json
git commit -m "feat(audit): shared report contract (schema + doc)"
```

---

## Task 4: Schema-drift verifier

**Files:**
- Create: `src/audit/__fixtures__/schema-drift/dirty.sql`
- Create: `src/audit/__fixtures__/schema-drift/clean.sql`
- Create: `src/audit/verifiers/schema-drift.ts`
- Create: `src/audit/verifiers/schema-drift.test.ts`

- [ ] **Step 1: Write the golden fixtures**

```sql
-- src/audit/__fixtures__/schema-drift/dirty.sql
CREATE TABLE profiles (id uuid PRIMARY KEY, bio text, github_url text);
CREATE TABLE hackathon_members (id uuid PRIMARY KEY, bio text);
CREATE TABLE blog_authors (id uuid PRIMARY KEY, bio text, github_url text);
```
```sql
-- src/audit/__fixtures__/schema-drift/clean.sql
CREATE TABLE profiles (id uuid PRIMARY KEY, bio text, github_url text);
CREATE TABLE hackathon_members (id uuid PRIMARY KEY, profile_id uuid REFERENCES profiles(id));
CREATE TABLE blog_authors (id uuid PRIMARY KEY, profile_id uuid REFERENCES profiles(id));
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/audit/verifiers/schema-drift.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findDuplicatedColumns } from "./schema-drift";

const fx = (name: string) =>
  readFileSync(join(__dirname, "../__fixtures__/schema-drift", name), "utf8");

describe("findDuplicatedColumns", () => {
  it("flags a logical column repeated across >= 2 tables", () => {
    const dups = findDuplicatedColumns(fx("dirty.sql"), { minTables: 2 });
    const bio = dups.find((d) => d.column === "bio");
    expect(bio).toBeDefined();
    expect(bio!.tables.sort()).toEqual(["blog_authors", "hackathon_members", "profiles"]);
    const gh = dups.find((d) => d.column === "github_url");
    expect(gh!.tables.sort()).toEqual(["blog_authors", "profiles"]);
  });

  it("ignores the primary key column `id` (allowlisted)", () => {
    const dups = findDuplicatedColumns(fx("dirty.sql"), { minTables: 2 });
    expect(dups.find((d) => d.column === "id")).toBeUndefined();
  });

  it("returns nothing for a normalized schema", () => {
    const dups = findDuplicatedColumns(fx("clean.sql"), { minTables: 2 });
    expect(dups).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/audit/verifiers/schema-drift.test.ts`
Expected: FAIL — `findDuplicatedColumns` not defined.

- [ ] **Step 4: Write the minimal implementation**

```typescript
// src/audit/verifiers/schema-drift.ts
export interface DuplicatedColumn {
  column: string;
  tables: string[];
}

export interface SchemaDriftOptions {
  minTables: number;
  // Columns that are legitimately repeated (keys, fk patterns, timestamps).
  allowlist?: string[];
}

const DEFAULT_ALLOWLIST = [
  "id", "created_at", "updated_at", "deleted_at",
];

/**
 * Parse CREATE TABLE blocks and report any column name appearing in
 * >= minTables tables (excluding allowlisted keys / fk-style / timestamp
 * columns and any column ending in `_id`). A logical column duplicated across
 * tables without a shared source is a 1NF + DRY drift signal.
 */
export function findDuplicatedColumns(
  sql: string,
  opts: SchemaDriftOptions,
): DuplicatedColumn[] {
  const allow = new Set([...(opts.allowlist ?? []), ...DEFAULT_ALLOWLIST]);
  const byColumn = new Map<string, Set<string>>();

  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?\s*\(([\s\S]*?)\);/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(sql)) !== null) {
    const table = m[1];
    const body = m[2];
    for (const rawLine of body.split(",")) {
      const colMatch = rawLine.trim().match(/^["'`]?(\w+)["'`]?\s+\w/);
      if (!colMatch) continue;
      const col = colMatch[1].toLowerCase();
      if (allow.has(col) || col.endsWith("_id")) continue;
      if (!byColumn.has(col)) byColumn.set(col, new Set());
      byColumn.get(col)!.add(table);
    }
  }

  const out: DuplicatedColumn[] = [];
  for (const [column, tables] of byColumn) {
    if (tables.size >= opts.minTables) {
      out.push({ column, tables: [...tables] });
    }
  }
  return out;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/audit/verifiers/schema-drift.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/audit/__fixtures__/schema-drift src/audit/verifiers/schema-drift.ts src/audit/verifiers/schema-drift.test.ts
git commit -m "feat(audit): schema-drift duplicated-column verifier"
```

---

## Task 5: Findings-doc emitter

**Files:**
- Create: `src/audit/emit/findings-doc.ts`
- Create: `src/audit/emit/findings-doc.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/audit/emit/findings-doc.test.ts
import { describe, it, expect } from "vitest";
import { renderFindingsDoc } from "./findings-doc";
import type { AuditReport } from "../types";

const report: AuditReport = {
  family: "SCH",
  repo: "dojo-os",
  stack: "supabase",
  date: "2026-06-02",
  engine_version: "1.0.0",
  findings: [
    {
      id: "SCH-001",
      title: "`bio` duplicated across 3 tables",
      severity: "high",
      anti_pattern: "1NF + DRY",
      evidence: [{ file: "supabase/migrations/x.sql", line: 2 }],
      cure_map: ["ownership", "ci_guard"],
      confidence: "confirmed",
    },
  ],
};

describe("renderFindingsDoc", () => {
  it("emits YAML front-matter the contract recognizes", () => {
    const md = renderFindingsDoc(report);
    expect(md).toMatch(/^---\n/);
    expect(md).toContain("family: SCH");
    expect(md).toContain("repo: dojo-os");
  });

  it("renders one table row per finding with its id and severity", () => {
    const md = renderFindingsDoc(report);
    expect(md).toContain("| SCH-001 |");
    expect(md).toContain("high");
    expect(md).toContain("supabase/migrations/x.sql:2");
  });

  it("renders a clean-bill header when there are no findings", () => {
    const md = renderFindingsDoc({ ...report, findings: [] });
    expect(md).toContain("No findings");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/audit/emit/findings-doc.test.ts`
Expected: FAIL — `renderFindingsDoc` not defined.

- [ ] **Step 3: Write the implementation**

```typescript
// src/audit/emit/findings-doc.ts
import type { AuditReport, Finding } from "../types";

function evidenceCell(f: Finding): string {
  return f.evidence
    .map((e) => (e.line ? `${e.file}:${e.line}` : e.file))
    .join("<br>");
}

export function renderFindingsDoc(report: AuditReport): string {
  const counts = report.findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});

  const frontMatter = [
    "---",
    `family: ${report.family}`,
    `repo: ${report.repo}`,
    `stack: ${report.stack}`,
    `date: ${report.date}`,
    `engine_version: ${report.engine_version}`,
    `counts: ${JSON.stringify(counts)}`,
    "---",
    "",
  ].join("\n");

  const title = `# ${report.family} audit — ${report.repo} (${report.date})\n`;

  if (report.findings.length === 0) {
    return `${frontMatter}${title}\nNo findings. Clean bill of health for the ${report.family} family.\n`;
  }

  const header =
    "| ID | Severity | Title | Anti-pattern | Evidence | Cures |\n" +
    "|----|----------|-------|--------------|----------|-------|\n";
  const rows = report.findings
    .map(
      (f) =>
        `| ${f.id} | ${f.severity} | ${f.title} | ${f.anti_pattern} | ${evidenceCell(f)} | ${f.cure_map.join(", ")} |`,
    )
    .join("\n");

  return `${frontMatter}${title}\n${header}${rows}\n`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/audit/emit/findings-doc.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audit/emit/findings-doc.ts src/audit/emit/findings-doc.test.ts
git commit -m "feat(audit): findings-doc markdown emitter"
```

---

## Task 6: Advisor routing function

**Files:**
- Create: `src/audit/advisor-routing.ts`
- Create: `src/audit/advisor-routing.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/audit/advisor-routing.test.ts
import { describe, it, expect } from "vitest";
import { recommendAudits, type AdvisorSignals } from "./advisor-routing";

const none: AdvisorSignals = {
  sharedDatabase: false,
  feAndBackendValidate: false,
  migratingMonolith: false,
  layeredArchitecture: false,
  crossModuleImports: false,
};

describe("recommendAudits", () => {
  it("routes a shared-DB signal to SCH", () => {
    expect(recommendAudits({ ...none, sharedDatabase: true })).toEqual(["SCH", "ENF"]);
  });

  it("routes FE+backend validation to CDC", () => {
    expect(recommendAudits({ ...none, feAndBackendValidate: true })).toEqual(["CDC", "ENF"]);
  });

  it("routes a monolith migration to STR", () => {
    expect(recommendAudits({ ...none, migratingMonolith: true })).toEqual(["STR", "ENF"]);
  });

  it("routes layering + cross-module imports to ARC and DDD", () => {
    expect(
      recommendAudits({ ...none, layeredArchitecture: true, crossModuleImports: true }),
    ).toEqual(["DDD", "ARC", "ENF"]);
  });

  it("recommends the full ordered sweep when everything is true", () => {
    expect(
      recommendAudits({
        sharedDatabase: true,
        feAndBackendValidate: true,
        migratingMonolith: true,
        layeredArchitecture: true,
        crossModuleImports: true,
      }),
    ).toEqual(["SCH", "CDC", "DDD", "ARC", "STR", "ENF"]);
  });

  it("defaults to the full sweep when no signal is set (unsure)", () => {
    expect(recommendAudits(none)).toEqual(["SCH", "CDC", "DDD", "ARC", "STR", "ENF"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/audit/advisor-routing.test.ts`
Expected: FAIL — `recommendAudits` not defined.

- [ ] **Step 3: Write the implementation**

```typescript
// src/audit/advisor-routing.ts
import type { AuditId } from "./types";

export interface AdvisorSignals {
  sharedDatabase: boolean;       // several teams write the same DB -> SCH
  feAndBackendValidate: boolean; // FE + backend validate the same data -> CDC
  migratingMonolith: boolean;    // splitting a monolith -> STR
  layeredArchitecture: boolean;  // domain/application/infra layering -> ARC
  crossModuleImports: boolean;   // modules import across boundaries -> DDD
}

// Canonical dependency order: data -> contracts -> context -> layers -> migration -> enforcement.
const ORDER: AuditId[] = ["SCH", "CDC", "DDD", "ARC", "STR", "ENF"];

export function recommendAudits(signals: AdvisorSignals): AuditId[] {
  const set = new Set<AuditId>();
  if (signals.sharedDatabase) set.add("SCH");
  if (signals.feAndBackendValidate) set.add("CDC");
  if (signals.crossModuleImports) set.add("DDD");
  if (signals.layeredArchitecture) set.add("ARC");
  if (signals.migratingMonolith) set.add("STR");

  // ENF (Cure-4 coverage) always runs last when anything else is recommended.
  if (set.size > 0) set.add("ENF");

  // No signal => unsure => recommend the full sweep.
  if (set.size === 0) return [...ORDER];

  return ORDER.filter((id) => set.has(id));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/audit/advisor-routing.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audit/advisor-routing.ts src/audit/advisor-routing.test.ts
git commit -m "feat(audit): domain-driven-advisor routing function"
```

---

## Task 7: `audit-engine` skill + schema-drift detector + command

**Files:**
- Create: `skills/audit-engine/SKILL.md`
- Create: `references/detectors/schema-drift.md`
- Create: `commands/audit-schema-drift.md`

- [ ] **Step 1: Write the engine skill**

Create `skills/audit-engine/SKILL.md` with YAML front-matter (`name: audit-engine`, a `description` that triggers on "audit", "drift", "anti-pattern", "repo health") and a body documenting stages 0–5 verbatim from `openspec/changes/2026-06-02-audit-engine-family/design.md` §2:

- **Stage 0 — agent-teams preflight:** check `~/.claude/settings.json` for `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"`; if missing, recommend it with the exact one-line diff (apply only on consent), else prefer `superpowers:subagent-driven-development` on the latest Opus (4.8); sequential only as the documented last resort.
- **Stage 1 — scope & context:** detect stack, read `CLAUDE.md`/`AGENTS.md`, `docs/repo-health/governance.md`, ownership/`CODEOWNERS`, prior `docs/repo-health/` reports (skip exempted findings).
- **Stage 2 — detect (LLM-first):** run the named `references/detectors/<family>.md` profile; every candidate finding MUST carry a `file:line` anchor.
- **Stage 3 — verify:** run the profile's deterministic check if present (e.g. for `SCH`, the `findDuplicatedColumns` function in `src/audit/verifiers/schema-drift.ts`); otherwise dispatch a refutation agent that defaults to "not a finding". Drop unverified; stamp `confidence`. Fan out one verifier per candidate. **Log any coverage cap — never truncate silently.**
- **Stage 4 — map to cures:** compute the applicable `cure_map` subset and generate scaffold proposal text per finding.
- **Stage 5 — emit:** produce the four artifacts (findings doc, OpenSpec change, Bilingual Linear issues, 4-cure scaffold proposals) per `references/audit-report-schema.md`. The findings doc is rendered to conform to `schemas/audit-report-schema.schema.json`.

- [ ] **Step 2: Write the schema-drift detector profile**

Create `references/detectors/schema-drift.md` declaring: anti-pattern (`1NF` Codd 1970 + `DRY` + multiple-writers-no-owner), the LLM detection prompt (find columns representing the same logical attribute across tables; find tables written by multiple owners without a single source), the deterministic verify recipe (parse migrations / `information_schema`; call `findDuplicatedColumns(sql, { minTables: 2 })`; cross-check GRANT/owner), default severity (`high` for duplicated PII-ish columns, `medium` otherwise), and the `cure_map` template (`ownership` + `ci_guard`).

- [ ] **Step 3: Write the command**

```markdown
---
description: >
  Audit a repo for schema drift — 1NF violations, the same logical column
  duplicated across tables without a single source of truth (the *_bio-in-5-tables
  pattern), and tables written by multiple owners with no canonical owner.
  Emits a findings doc, an OpenSpec remediation change, Bilingual Linear issues,
  and 4-cure scaffold proposals. Accepts a target path as $ARGUMENTS.
---

# /audit-schema-drift

Trigger the **`audit-engine`** skill with the `schema-drift` (`SCH`) detector
profile (`references/detectors/schema-drift.md`) against $ARGUMENTS (default: the
current repo).

The engine owns the full flow (preflight → scope → detect → verify → cure-map →
emit). Deterministic verification uses `findDuplicatedColumns` from
`src/audit/verifiers/schema-drift.ts`.

## Usage

```
/audit-schema-drift [path]
```
```

- [ ] **Step 4: Smoke-check the markdown**

Run:
```bash
test -f skills/audit-engine/SKILL.md && head -1 skills/audit-engine/SKILL.md | grep -q -- '---' && echo "SKILL front-matter OK"
grep -q "schema-drift" commands/audit-schema-drift.md && echo "command wired OK"
```
Expected: both `OK` lines print.

- [ ] **Step 5: Commit**

```bash
git add skills/audit-engine/SKILL.md references/detectors/schema-drift.md commands/audit-schema-drift.md
git commit -m "feat(audit): audit-engine skill + schema-drift detector + command"
```

---

## Task 8: `/domain-driven-advisor` skill + triage + command

**Files:**
- Create: `references/domain-driven-advisor-triage.md`
- Create: `skills/domain-driven-advisor/SKILL.md`
- Create: `commands/domain-driven-advisor.md`

- [ ] **Step 1: Write the triage decision tree**

Create `references/domain-driven-advisor-triage.md` mapping the five `AdvisorSignals` (from `src/audit/advisor-routing.ts`) to plain-language questions and to audit families:

| Signal | Plain-language question | Routes to |
|---|---|---|
| `sharedDatabase` | "¿Varios equipos escriben en la misma base de datos?" | `SCH` |
| `feAndBackendValidate` | "¿El frontend y el backend validan los mismos datos por separado?" | `CDC` |
| `crossModuleImports` | "¿Unos módulos importan código de otros equipos/dominios?" | `DDD` |
| `layeredArchitecture` | "¿Separás lógica de negocio de base de datos y framework?" | `ARC` |
| `migratingMonolith` | "¿Estás partiendo un sistema grande / migrando un monolito?" | `STR` |

Document that "unsure / all" → the full ordered sweep `SCH → CDC → DDD → ARC → STR → ENF`, and that the recommendation is computed by `recommendAudits()`.

- [ ] **Step 2: Write the advisor skill**

Create `skills/domain-driven-advisor/SKILL.md` (front-matter `name: domain-driven-advisor`, trigger on "which audit", "where do I start", "repo health", "domain driven") whose body runs:

1. **Repo signals** — cheap scan that pre-weights each `AdvisorSignals` field (migrations dir → `sharedDatabase`; FE + edge/server validation files → `feAndBackendValidate`; new services beside a monolith → `migratingMonolith`; `domain/`+`application/` folders → `layeredArchitecture`; cross-module imports → `crossModuleImports`).
2. **Triage** — ask the plain-language questions from `references/domain-driven-advisor-triage.md` (only those the scan left ambiguous).
3. **Recommend** — call `recommendAudits()` semantics to produce the ordered set; only offer audits whose command exists (currently `/audit-schema-drift`; others are "coming soon" until their follow-up plan ships).
4. **Agent-teams preflight** — surface the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` recommendation (ADR-7) before executing.
5. **Execute (gated)** — with consent, run the recommended audits via `audit-engine`, aggregate findings.
6. **Premortem tail** — invoke the existing `premortem` skill on the aggregated remediation plan.

- [ ] **Step 3: Write the command**

```markdown
---
description: >
  Guided entry point for repo health when you don't know which audit you need.
  Inspects the repo, asks a few plain-language questions, recommends which
  audit(s) to run (or the full sequence), runs them, and finishes with a
  premortem on the remediation plan. Best first command for a new repo.
---

# /domain-driven-advisor

Trigger the **`domain-driven-advisor`** skill. It routes you to the right
audit(s) from the audit-engine family and stress-tests the result with a
premortem. See `references/domain-driven-advisor-triage.md` for the decision
tree.

## Usage

```
/domain-driven-advisor [path]
```
```

- [ ] **Step 4: Smoke-check**

Run:
```bash
for f in skills/domain-driven-advisor/SKILL.md commands/domain-driven-advisor.md references/domain-driven-advisor-triage.md; do test -f "$f" && echo "ok $f"; done
```
Expected: three `ok` lines.

- [ ] **Step 5: Commit**

```bash
git add skills/domain-driven-advisor/SKILL.md references/domain-driven-advisor-triage.md commands/domain-driven-advisor.md
git commit -m "feat(audit): /domain-driven-advisor guided entry point"
```

---

## Task 9: README overhaul — navigation + `/domain-driven-advisor` teaching

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Link every command to its file**

In `README.md`, replace each command's plain-code label in the `### Commands` table with a link to its file, e.g. change
`` | `/make-no-mistakes:implement <ISSUE-ID>` | … `` to
`` | [`/make-no-mistakes:implement <ISSUE-ID>`](commands/implement.md) | … ``
for all existing commands, and add the two new rows:

```markdown
| [`/make-no-mistakes:domain-driven-advisor`](commands/domain-driven-advisor.md) | **Guided entry point** — inspects the repo, recommends which audit(s) to run (or the full sequence), runs them, and finishes with a premortem. Start here for repo health. |
| [`/make-no-mistakes:audit-schema-drift`](commands/audit-schema-drift.md) | Audit for schema drift — 1NF violations + the same logical column duplicated across tables without a single source of truth |
```

Update the count heading `### Commands (18)` → `### Commands (20)`.

- [ ] **Step 2: Link every skill to its SKILL.md**

In the `### Skills` table, link each skill name to its file, e.g.
`` | `implement-advisor` | … `` → `` | [`implement-advisor`](skills/implement-advisor/SKILL.md) | … ``
and add the two new rows:

```markdown
| [`audit-engine`](skills/audit-engine/SKILL.md) | Run any repo-health audit (schema-drift today; CDC/DDD/ARC/STR/ENF as they ship). Hybrid LLM-first detection + deterministic verification + cure-mapping |
| [`domain-driven-advisor`](skills/domain-driven-advisor/SKILL.md) | Ask "which audit do I need?" / "where do I start with repo health?" — routes you to the right audit(s) and runs a premortem |
```

Update `### Skills (6)` → `### Skills (8)`.

- [ ] **Step 3: Add the `/domain-driven-advisor` teaching section**

Insert a new top-level section immediately after `## What's Inside` (before `## Configuration`):

```markdown
## Guided repo health: `/domain-driven-advisor`

New to the audit family, or not sure where to start? Run **one** command and let
it guide you. The advisor is the front door to the whole audit-engine family.

### When to use it

- You inherited a repo and want to know what's structurally wrong.
- You suspect drift (duplicated columns, FE/BE validation mismatches, tangled
  modules, a stalled monolith migration) but don't know which audit applies.
- You want a remediation plan that's already been stress-tested.

### What it does (4 steps)

1. **Inspects the repo** — detects signals (a shared database, FE+backend
   validation, a monolith mid-migration, layered architecture, cross-module
   imports).
2. **Asks a few plain-language questions** — no jargon required. Each answer
   maps to one of the audits.
3. **Recommends and runs the audit(s)** — just the ones you need, or the full
   ordered sweep `schema → contract → DDD → architecture → strangler →
   enforcement` if you're unsure.
4. **Runs a premortem** — on the aggregated remediation plan, so you ship a plan
   that already survived "it's 6 months later and this failed — why?".

### Quick start

```
/make-no-mistakes:domain-driven-advisor
```

Point it at a subdirectory if you only want part of the repo:

```
/make-no-mistakes:domain-driven-advisor src/payments
```

### Example session

```
You:  /make-no-mistakes:domain-driven-advisor
Tool: Scanning… found supabase/migrations and FE+edge validation.
      Q1: ¿Varios equipos escriben en la misma base de datos? > yes
      Q2: ¿El frontend y el backend validan los mismos datos por separado? > yes
      → Recommended: /audit-schema-drift, /audit-contract-drift, then enforcement.
      Tip: enable agent teams for parallel audits — add
           "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" to ~/.claude/settings.json
      Run them now? > yes
      … findings written to docs/repo-health/… + premortem report on ~/Escritorio.
```

### What it produces

For each audit it runs: a findings doc in `docs/repo-health/`, an OpenSpec
remediation change, Bilingual-Layer Linear issues, and 4-cure scaffold
proposals — plus a single premortem report (HTML + transcript) over the combined
plan.

### Faster with agent teams

The audits fan out one verifier per finding, so they're much faster with a
parallel agent team. The advisor will recommend enabling
`"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` in `~/.claude/settings.json`
(it shows the exact one-line change; it never edits your settings without
consent). If you decline, it falls back to subagent-driven-development on the
latest Opus rather than a slow sequential crawl.

### Run a single audit directly

If you already know what you need, skip the advisor:

```
/make-no-mistakes:audit-schema-drift
```
```

- [ ] **Step 4: Verify the links resolve**

Run:
```bash
grep -oE '\]\((commands|skills)/[^)]+\)' README.md | sed -E 's/^\]\(//; s/\)$//' | while read p; do test -e "$p" && echo "ok $p" || echo "MISSING $p"; done
```
Expected: every line starts with `ok` (no `MISSING`). Note: skill links point at `skills/<name>/SKILL.md`; existing-skill files must exist for those rows.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README navigation to every command/skill + /domain-driven-advisor guide"
```

---

## Task 10: Version bump + final verification

**Files:**
- Modify: `package.json`, `.claude-plugin/plugin.json` (and any other manifest carrying the version)

- [ ] **Step 1: Bump the version**

Find the current version (`1.21.0`) in every manifest and bump the minor:

```bash
grep -rl '"version": "1.21.0"' package.json .claude-plugin/plugin.json 2>/dev/null
```
Set each to `1.22.0`.

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS — contract (2) + schema-drift (3) + findings-doc (3) + advisor-routing (6) + smoke (1).

- [ ] **Step 3: Build still works**

Run: `npm run build`
Expected: tsup builds `src/index.ts` and `src/cli.ts` with no type errors.

- [ ] **Step 4: Commit**

```bash
git add package.json .claude-plugin/plugin.json
git commit -m "chore: bump to 1.22.0 (audit-engine foundation)"
```

---

## Self-Review

**Spec coverage** (against `openspec/changes/2026-06-02-audit-engine-family/`):
- Shared contract (SSOT) → Tasks 2, 3. ✓
- `audit-engine` skill + Stage-0 preflight → Task 7. ✓
- Hybrid detection (deterministic verify) → Task 4 (verifier) + Task 7 (engine wires it). ✓
- `/audit-schema-drift` → Task 7. ✓
- `/domain-driven-advisor` + premortem tail → Tasks 6, 8. ✓
- Emission (findings doc) → Task 5; OpenSpec/Linear/cure-scaffold are documented engine instructions (Task 7 Stage 5), not code in v1. ✓
- README navigation + advisor teaching → Task 9. ✓
- Agent-teams preflight (ADR-7) → Task 7 (engine) + Task 8 (advisor) + Task 9 (README). ✓
- **Deferred to follow-up plans (intentional):** the other five audits (CDC/DDD/ARC/STR/ENF) and their detectors/verifiers/fixtures; the 4-cure auto-installer; the unified `.repo-health-rules.json`. These are Phase 2 / Plans 2–6 per the OpenSpec "out of scope" section.

**Placeholder scan:** no `TBD`/`TODO`/"handle edge cases" in code steps; every code step shows complete code.

**Type consistency:** `Finding`/`AuditReport`/`AuditId`/`Severity`/`Cure` defined in Task 2 and used unchanged in Tasks 3, 5, 6; `findDuplicatedColumns(sql, {minTables})` signature identical in Task 4 test + impl + Task 7 reference; `recommendAudits(AdvisorSignals)` identical in Task 6 + Task 8; `renderFindingsDoc(AuditReport)` identical in Task 5.

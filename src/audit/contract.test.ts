import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import schema from "../../schemas/audit-report-schema.schema.json";
import type { AuditReport } from "./types";

const validate = new Ajv().compile(schema);

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
    expect(validate(sample)).toBe(true);
  });

  it("rejects a report with an unknown severity", () => {
    const bad = { ...sample, findings: [{ ...sample.findings[0], severity: "nope" }] };
    expect(validate(bad)).toBe(false);
  });

  it("rejects a finding missing a required field", () => {
    const { evidence: _evidence, ...findingWithoutEvidence } = sample.findings[0];
    const bad = { ...sample, findings: [findingWithoutEvidence] };
    expect(validate(bad)).toBe(false);
  });
});

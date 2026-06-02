import { describe, it, expect } from "vitest";
import { renderFindingsDoc } from "./findings-doc";
import type { AuditReport } from "../types";

const report: AuditReport = {
  family: "SCH", repo: "dojo-os", stack: "supabase", date: "2026-06-02", engine_version: "1.0.0",
  findings: [{
    id: "SCH-001", title: "`bio` duplicated across 3 tables", severity: "high",
    anti_pattern: "1NF + DRY", evidence: [{ file: "supabase/migrations/x.sql", line: 2 }],
    cure_map: ["ownership", "ci_guard"], confidence: "confirmed",
  }],
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

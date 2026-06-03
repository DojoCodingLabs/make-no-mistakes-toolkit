import { describe, it, expect } from "vitest";
import { proposeHookRule } from "./cure-scaffold";
import type { Finding } from "./types";

const base: Finding = {
  id: "SCH-001",
  title: "`bio` duplicated across 3 tables without SSOT",
  severity: "high",
  anti_pattern: "1NF (Codd 1970) + DRY",
  evidence: [{ file: "supabase/migrations/0001_init.sql", line: 12 }],
  cure_map: ["ownership", "ci_guard", "hook"],
  confidence: "confirmed",
};

describe("proposeHookRule", () => {
  it("returns a proposal when cure_map includes 'hook'", () => {
    const proposal = proposeHookRule(base);
    expect(proposal).not.toBeNull();
  });

  it("derives family from the finding id prefix", () => {
    expect(proposeHookRule({ ...base, id: "SCH-001" })?.family).toBe("SCH");
    expect(proposeHookRule({ ...base, id: "ARC-042" })?.family).toBe("ARC");
    expect(proposeHookRule({ ...base, id: "ENF-007" })?.family).toBe("ENF");
  });

  it("carries the finding severity and title (as message)", () => {
    const proposal = proposeHookRule(base);
    expect(proposal?.severity).toBe("high");
    expect(proposal?.message).toBe("`bio` duplicated across 3 tables without SSOT");
  });

  it("slugifies the title into a deterministic rule id scoped by family", () => {
    const proposal = proposeHookRule(base);
    expect(proposal?.id).toBe("sch-bio-duplicated-across-3-tables-without-ssot");
    // deterministic
    expect(proposeHookRule(base)?.id).toBe(proposal?.id);
  });

  it("derives a pattern placeholder from the first evidence file extension", () => {
    const proposal = proposeHookRule(base);
    expect(proposal?.pattern).toBe("**/*.sql");
  });

  it("falls back to a wildcard pattern when the evidence file has no extension", () => {
    const proposal = proposeHookRule({
      ...base,
      evidence: [{ file: "CODEOWNERS" }],
    });
    expect(proposal?.pattern).toBe("**/*");
  });

  it("returns null when cure_map does NOT include 'hook'", () => {
    expect(proposeHookRule({ ...base, cure_map: ["ownership", "ci_guard"] })).toBeNull();
  });

  it("returns null when cure_map is empty", () => {
    expect(proposeHookRule({ ...base, cure_map: [] })).toBeNull();
  });
});

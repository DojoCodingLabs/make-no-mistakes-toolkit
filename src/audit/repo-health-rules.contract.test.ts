import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import schema from "../../schemas/repo-health-rules.schema.json";

const validate = new Ajv().compile(schema);

const sample = {
  version: 1,
  enforcementLevel: "strict",
  families: {
    SCH: [
      {
        id: "sch-bio-duplicated-across-3-tables-without-ssot",
        pattern: "**/*.sql",
        message: "`bio` duplicated across 3 tables without SSOT",
        severity: "high",
        exemptionMarker: "@repo-health-exempt",
      },
    ],
    ARC: [
      {
        id: "arc-domain-imports-infrastructure",
        pattern: "src/domain/**/*.ts",
        message: "domain layer must not import infrastructure",
        severity: "blocker",
        exemptionMarker: "@repo-health-exempt",
      },
    ],
  },
};

describe("repo-health-rules contract", () => {
  it("validates a well-formed rules config", () => {
    expect(validate(sample)).toBe(true);
  });

  it("validates a minimal config with an empty families object", () => {
    expect(validate({ version: 1, enforcementLevel: "advisory", families: {} })).toBe(true);
  });

  it("rejects an unknown enforcementLevel", () => {
    expect(validate({ ...sample, enforcementLevel: "nope" })).toBe(false);
  });

  it("rejects a family key outside the six namespaces", () => {
    const bad = { ...sample, families: { ...sample.families, FOO: [] } };
    expect(validate(bad)).toBe(false);
  });

  it("rejects a rule missing the exemptionMarker", () => {
    const { exemptionMarker: _drop, ...ruleWithoutMarker } = sample.families.SCH[0];
    const bad = { ...sample, families: { SCH: [ruleWithoutMarker] } };
    expect(validate(bad)).toBe(false);
  });

  it("rejects a rule with an unknown severity", () => {
    const bad = {
      ...sample,
      families: { SCH: [{ ...sample.families.SCH[0], severity: "critical" }] },
    };
    expect(validate(bad)).toBe(false);
  });
});

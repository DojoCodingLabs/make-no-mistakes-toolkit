import { describe, it, expect } from "vitest";
import { recommendAudits, type AdvisorSignals } from "./advisor-routing";

const none: AdvisorSignals = {
  sharedDatabase: false, feAndBackendValidate: false, migratingMonolith: false,
  layeredArchitecture: false, crossModuleImports: false,
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
  it("routes layering + cross-module imports to DDD and ARC", () => {
    expect(recommendAudits({ ...none, layeredArchitecture: true, crossModuleImports: true })).toEqual(["DDD", "ARC", "ENF"]);
  });
  it("recommends the full ordered sweep when everything is true", () => {
    expect(recommendAudits({ sharedDatabase: true, feAndBackendValidate: true, migratingMonolith: true, layeredArchitecture: true, crossModuleImports: true })).toEqual(["SCH", "CDC", "DDD", "ARC", "STR", "ENF"]);
  });
  it("defaults to the full sweep when no signal is set (unsure)", () => {
    expect(recommendAudits(none)).toEqual(["SCH", "CDC", "DDD", "ARC", "STR", "ENF"]);
  });
});

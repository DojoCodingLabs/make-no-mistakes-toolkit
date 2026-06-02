import { describe, it, expect } from "vitest";
import {
  assessStranglerHealth,
  type StranglerSignals,
} from "./strangler-fig";

/** A fully-healthy in-progress migration: façade, dual path, retirement plan, no big-bang. */
const healthy: StranglerSignals = {
  hasFacade: true,
  routesMigrated: 3,
  routesTotal: 10,
  hasDualPath: true,
  hasRetirementPlan: true,
  bigBangIndicators: [],
};

describe("assessStranglerHealth", () => {
  it("returns [] for a fully-healthy in-progress migration", () => {
    expect(assessStranglerHealth(healthy)).toEqual([]);
  });

  it("flags a missing façade", () => {
    expect(assessStranglerHealth({ ...healthy, hasFacade: false })).toEqual([
      {
        code: "no-facade",
        message:
          "No façade/proxy in front of the legacy system — new and old code are not routed through a single seam.",
      },
    ]);
  });

  it("flags a big-bang indicator", () => {
    expect(
      assessStranglerHealth({
        ...healthy,
        bigBangIndicators: ["single 12k-line cutover PR"],
      }),
    ).toEqual([
      {
        code: "big-bang-risk",
        message:
          "Big-bang rewrite indicators present: single 12k-line cutover PR.",
      },
    ]);
  });

  it("flags an in-progress migration without a dual path", () => {
    expect(
      assessStranglerHealth({ ...healthy, hasDualPath: false }),
    ).toEqual([
      {
        code: "no-coexistence",
        message:
          "Migration is in progress but old and new paths do not coexist behind a router — there is no safe incremental cutover.",
      },
    ]);
  });

  it("flags migrated routes without a retirement plan", () => {
    expect(
      assessStranglerHealth({ ...healthy, hasRetirementPlan: false }),
    ).toEqual([
      {
        code: "no-retirement-plan",
        message:
          "Routes have been migrated but there is no documented plan to retire the strangled legacy code.",
      },
    ]);
  });

  it("returns multiple simultaneous problems sorted by code", () => {
    const result = assessStranglerHealth({
      hasFacade: false,
      routesMigrated: 4,
      routesTotal: 10,
      hasDualPath: false,
      hasRetirementPlan: false,
      bigBangIndicators: ["rewrite-from-scratch branch"],
    });
    expect(result.map((f) => f.code)).toEqual([
      "big-bang-risk",
      "no-coexistence",
      "no-facade",
      "no-retirement-plan",
    ]);
  });
});

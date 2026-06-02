import { describe, it, expect } from "vitest";
import {
  findHookCoverageGaps,
  type EnforcementConfig,
} from "./enforcement-hooks";

/**
 * A fully-covered Cure-4 setup: repo hooks present, toolkit hooks inherited, a
 * rules config exists, and every structural rule is backed by a hook whose name
 * includes the rule substring.
 */
const covered: EnforcementConfig = {
  repoHooks: ["pre-edit-ownership", "post-edit-drift", "pre-bash-db-mutation"],
  toolkitHooksPresent: true,
  rulesConfigPresent: true,
  structuralRules: ["ownership", "drift", "db-mutation"],
};

describe("findHookCoverageGaps", () => {
  it("returns [] when Cure 4 is fully covered", () => {
    expect(findHookCoverageGaps(covered)).toEqual([]);
  });

  it("flags absent repo-level hooks", () => {
    expect(
      findHookCoverageGaps({
        ...covered,
        repoHooks: [],
        structuralRules: [],
      }),
    ).toEqual([
      {
        code: "no-repo-hooks",
        detail:
          "No repo-level PreToolUse/PostToolUse hooks (.claude/hooks/) — Cure 4a is absent.",
      },
    ]);
  });

  it("flags missing toolkit-level hooks", () => {
    expect(
      findHookCoverageGaps({ ...covered, toolkitHooksPresent: false }),
    ).toEqual([
      {
        code: "no-toolkit-hooks",
        detail:
          "Toolkit-level enforcement hooks are not inherited — Cure 4b is absent.",
      },
    ]);
  });

  it("flags a missing rules config", () => {
    expect(
      findHookCoverageGaps({ ...covered, rulesConfigPresent: false }),
    ).toEqual([
      {
        code: "no-rules-config",
        detail:
          "No rules config (.atomic-design-rules.json analog) — hooks have nothing to enforce.",
      },
    ]);
  });

  it("flags a structural rule with no backing hook", () => {
    expect(
      findHookCoverageGaps({
        ...covered,
        structuralRules: ["ownership", "drift", "db-mutation", "layering"],
      }),
    ).toEqual([
      {
        code: "rule-without-hook:layering",
        detail:
          'Structural rule "layering" is defined but no hook enforces it.',
      },
    ]);
  });

  it("returns multiple gaps sorted by code", () => {
    const result = findHookCoverageGaps({
      repoHooks: ["pre-edit-ownership"],
      toolkitHooksPresent: false,
      rulesConfigPresent: false,
      structuralRules: ["ownership", "layering"],
    });
    expect(result.map((g) => g.code)).toEqual([
      "no-rules-config",
      "no-toolkit-hooks",
      "rule-without-hook:layering",
    ]);
  });
});

import { describe, it, expect } from "vitest";
import {
  findHookEfficacyGaps,
  VACUOUS_GATE_SHAPES,
  type EfficacyConfig,
  type HookObservation,
} from "./enforcement-hooks-efficacy";

/**
 * Each case below is a shape observed in a live repository, reduced to its
 * observation. The point of the suite is not that the function returns an
 * array — it is that a gate which LOOKS fine in every listing still produces a
 * gap when the binding question is asked.
 */

/** A gate that binds: right event, right exit code, tested for both block and message. */
const binding: HookObservation = {
  name: "pre-write-ownership",
  event: "PreToolUse",
  registeredIn: [".claude/settings.json"],
  intendsToBlock: true,
  blockingExitCode: 2,
  testAssertsMessage: true,
  testAssertsBlock: true,
  failsOnEmptyInput: true,
  severityFavorsCompliance: true,
};

const base: EfficacyConfig = {
  hooks: [binding],
  harnessRegistryFile: ".claude/settings.json",
};

const only = (c: EfficacyConfig) => findHookEfficacyGaps(c).map((g) => g.code);
const withHook = (patch: Partial<HookObservation>): EfficacyConfig => ({
  ...base,
  hooks: [{ ...binding, ...patch }],
});

describe("a gate that binds produces no gaps", () => {
  it("returns [] for the fully-binding observation", () => {
    expect(findHookEfficacyGaps(base)).toEqual([]);
  });
});

describe("shape 6 — registered where nothing reads", () => {
  it("flags a hook registered only in a file the harness does not load", () => {
    const gaps = findHookEfficacyGaps(
      withHook({ registeredIn: [".claude/hooks/hooks.json"] }),
    );
    expect(gaps.map((g) => g.code)).toEqual([
      "registered-where-nothing-reads:pre-write-ownership",
    ]);
    expect(gaps[0].shape).toBe(6);
    expect(gaps[0].confidence).toBe("direct");
  });

  it("flags a hook registered nowhere at all", () => {
    expect(only(withHook({ registeredIn: [] }))).toContain(
      "registered-where-nothing-reads:pre-write-ownership",
    );
  });

  it("stays silent when the harness registry file is unknown — an unanswerable question is not a finding", () => {
    const gaps = findHookEfficacyGaps({
      hooks: [{ ...binding, registeredIn: [".claude/hooks/hooks.json"] }],
      harnessRegistryFile: undefined,
    });
    expect(gaps).toEqual([]);
  });
});

describe("shape 4 — correct and binds nothing", () => {
  it("flags a PreToolUse denial on exit 1, which does not block", () => {
    const gaps = findHookEfficacyGaps(withHook({ blockingExitCode: 1 }));
    expect(gaps.map((g) => g.code)).toEqual([
      "non-blocking-exit-code:pre-write-ownership",
    ]);
    expect(gaps[0].shape).toBe(4);
  });

  it("does NOT flag exit 1 on a warn-mode gate — non-blocking is its design, not its defect", () => {
    expect(
      only(withHook({ intendsToBlock: false, blockingExitCode: 1 })),
    ).toEqual([]);
  });

  it("does not flag exit 1 outside PreToolUse, where the contract differs", () => {
    expect(only(withHook({ event: "PreCommit", blockingExitCode: 1 }))).toEqual(
      [],
    );
  });

  it("flags a gate that passes clean when its input set is empty", () => {
    expect(only(withHook({ failsOnEmptyInput: false }))).toEqual([
      "vacuous-on-empty-input:pre-write-ownership",
    ]);
  });

  it("flags a blocking gate with no test proving it ever denies", () => {
    expect(only(withHook({ testAssertsBlock: false }))).toEqual([
      "no-block-assertion:pre-write-ownership",
    ]);
  });
});

describe("shape 2 — asserts the adjacent property", () => {
  it("flags exit-code-only tests, and labels the check a proxy", () => {
    const gaps = findHookEfficacyGaps(withHook({ testAssertsMessage: false }));
    expect(gaps.map((g) => g.code)).toEqual([
      "asserts-adjacent-property:pre-write-ownership",
    ]);
    expect(gaps[0].confidence).toBe("proxy");
    expect(gaps[0].detail).toMatch(/^PROXY/);
  });

  it("flags a symbol the gate names that does not resolve", () => {
    const gaps = findHookEfficacyGaps(
      withHook({
        namedSymbols: [
          { symbol: "openspec-exempt", resolves: false, owningSystem: "the repo label set" },
          { symbol: "hardening", resolves: true },
        ],
      }),
    );
    expect(gaps.map((g) => g.code)).toEqual([
      "unresolved-symbol:pre-write-ownership:openspec-exempt",
    ]);
    expect(gaps[0].detail).toContain("the repo label set");
  });

  it("a resolving symbol produces nothing", () => {
    expect(
      only(withHook({ namedSymbols: [{ symbol: "hardening", resolves: true }] })),
    ).toEqual([]);
  });
});

describe("shape 5 — correct, blocking, and too late", () => {
  it("flags a CI-only rule with no write-time twin", () => {
    const gaps = findHookEfficacyGaps(
      withHook({ event: "CI", hasWriteTimeTwin: false, blockingExitCode: 1 }),
    );
    expect(gaps.map((g) => g.code)).toEqual(["enforced-too-late:pre-write-ownership"]);
    expect(gaps[0].shape).toBe(5);
  });

  it("does not flag a CI rule that HAS a write-time twin", () => {
    expect(
      only(withHook({ event: "CI", hasWriteTimeTwin: true, blockingExitCode: 1 })),
    ).toEqual([]);
  });

  it("stays silent when the twin is unknown rather than guessing", () => {
    expect(
      only(withHook({ event: "CI", hasWriteTimeTwin: undefined, blockingExitCode: 1 })),
    ).toEqual([]);
  });
});

describe("shape 7 — the incentive is inverted", () => {
  it("flags a gate whose strictest outcome is reserved for the compliant state", () => {
    const gaps = findHookEfficacyGaps(
      withHook({ severityFavorsCompliance: false }),
    );
    expect(gaps.map((g) => g.code)).toEqual(["inverted-incentive:pre-write-ownership"]);
    expect(gaps[0].shape).toBe(7);
    expect(gaps[0].detail).toContain("complying costs more");
  });

  it("stays silent when nobody has made the observation — this shape is read, not computed", () => {
    expect(only(withHook({ severityFavorsCompliance: undefined }))).toEqual([]);
  });
});

describe("determinism and shape coverage", () => {
  it("sorts by code so runs are diffable", () => {
    const gaps = findHookEfficacyGaps({
      hooks: [
        { ...binding, name: "z-hook", failsOnEmptyInput: false },
        { ...binding, name: "a-hook", testAssertsMessage: false },
      ],
      harnessRegistryFile: ".claude/settings.json",
    });
    expect(gaps.map((g) => g.code)).toEqual([
      "asserts-adjacent-property:a-hook",
      "vacuous-on-empty-input:z-hook",
    ]);
  });

  it("one hook can be several shapes at once", () => {
    const gaps = findHookEfficacyGaps(
      withHook({
        registeredIn: [".claude/hooks/hooks.json"],
        blockingExitCode: 1,
        failsOnEmptyInput: false,
        testAssertsBlock: false,
        testAssertsMessage: false,
        severityFavorsCompliance: false,
      }),
    );
    expect(new Set(gaps.map((g) => g.shape))).toEqual(new Set([2, 4, 6, 7]));
  });

  it("names all seven shapes, including the one the coverage verifier owns", () => {
    expect(Object.keys(VACUOUS_GATE_SHAPES)).toHaveLength(7);
    expect(VACUOUS_GATE_SHAPES[7]).toContain("complying costs more");
  });
});

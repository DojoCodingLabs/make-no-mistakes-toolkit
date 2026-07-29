/**
 * Enforcement-hook EFFICACY — the seven shapes of a vacuous gate.
 *
 * `enforcement-hooks.ts` answers **"does a hook exist for this rule?"**. That is
 * a question about presence, and it is the easy half. This file answers the
 * other one:
 *
 *     Does the hook that exists actually BIND?
 *
 * A gate can be present, correctly named, wired into a config, reviewed and
 * merged — and assert nothing. Every shape below was observed in a live
 * repository, which is why each carries a mechanical question rather than a
 * warning. A shape with no question attached is a lecture; a shape with a
 * question is a check.
 *
 * ---------------------------------------------------------------------------
 * THE SEVEN SHAPES
 * ---------------------------------------------------------------------------
 *  1. It does not look.                 covered by `findHookCoverageGaps`
 *  2. It looks at the adjacent property.
 *  3. It was deleted.                   covered by `findHookCoverageGaps`
 *  4. It is correct and binds nothing.
 *  5. It is correct, blocking, and too late.
 *  6. It is registered where nothing reads.
 *  7. Its incentive is inverted.
 *
 * Shapes 1 and 3 are questions about the SET of hooks, so they stay in the
 * coverage verifier. Shapes 2 and 4-7 are questions about EACH hook, so they
 * need a per-hook observation and live here.
 *
 * ---------------------------------------------------------------------------
 * WHY SOME SHAPES ARE PROXIES AND SAY SO
 * ---------------------------------------------------------------------------
 * Shape 2 — "does the hook assert the proposition it claims?" — is not
 * decidable from a file listing. What IS decidable is its strongest known
 * correlate: a hook whose tests check only the exit code has no assertion about
 * WHAT it said, so a hook that silently stopped emitting its message still
 * passes. That is a proxy, it is labelled a proxy in the gap detail, and it is
 * the reason this verifier reports `confidence` rather than a verdict.
 *
 * Shape 7 is the newest and the least automatable: a gate whose lenient branch
 * is cheaper than its strict one trains people to stay lenient. The observation
 * `severityFavorsCompliance` must be made by a reader, because "which branch is
 * cheaper" depends on what the branches cost in that repo. The verifier records
 * the answer; it does not compute it.
 *
 * Refusing to encode the un-automatable is the point. A verifier that guessed
 * shape 7 would be a gate that looks at the adjacent property — shape 2, in the
 * tool built to find shape 2.
 */

/** The lifecycle event a gate runs on. */
export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreCommit"
  | "PrePush"
  | "CI"
  | "other";

/** A symbol a gate NAMES and therefore depends on: a label, a path, a config key, an issue ID. */
export interface NamedSymbol {
  symbol: string;
  /** Did it resolve against the system that owns it, by a command that was run? */
  resolves: boolean;
  /** Which system was asked. Recorded so a `false` can be re-checked rather than re-argued. */
  owningSystem?: string;
}

/**
 * One gate, as observed. Every field is a fact someone looked up — not an
 * inference from the file name.
 */
export interface HookObservation {
  name: string;
  event: HookEvent;

  /**
   * Files that register this hook. Shape 6 compares this against the file the
   * harness actually reads: a hook registered only in a settings file nobody
   * loads is inert, and it is inert in a way that reads as covered.
   */
  registeredIn: string[];

  /** Does this gate intend to DENY, or only to warn? A warn-mode gate is not vacuous for being non-blocking. */
  intendsToBlock: boolean;

  /**
   * The exit code the gate uses to deny. Shape 4: in the Claude Code PreToolUse
   * contract only exit 2 blocks — exit 1 is an error the harness reports and
   * then proceeds past. A blocking gate on exit 1 is correct, reviewed, and
   * inert.
   */
  blockingExitCode?: number;

  /** Do its tests assert the message TEXT, or only the exit code? Proxy for shape 2. */
  testAssertsMessage: boolean;

  /** Do its tests assert that a violating input is actually blocked? */
  testAssertsBlock: boolean;

  /**
   * Does the gate fail when its own input set is empty? Shape 4: a gate that
   * iterates an empty allowlist and exits 0 passes every run while checking
   * nothing, and its green is indistinguishable from real coverage.
   */
  failsOnEmptyInput: boolean;

  /** Symbols this gate names and depends on. Any that does not resolve is a phantom. */
  namedSymbols?: NamedSymbol[];

  /**
   * For a rule enforced in CI: does a write-time twin exist? Shape 5 — a
   * violation caught in CI is caught after it was written, copied and opened as
   * a PR. Correct, blocking, and too late.
   */
  hasWriteTimeTwin?: boolean;

  /**
   * Shape 7. `true` when the COMPLIANT state is at least as cheap as the
   * non-compliant one. `false` means the gate punishes compliance — the
   * strictest outcome is reserved for the state you want people to reach.
   * Observed by a reader, never computed here.
   */
  severityFavorsCompliance?: boolean;
}

export interface EfficacyConfig {
  hooks: HookObservation[];
  /**
   * The registry file the harness actually reads. Shape 6 is only decidable
   * against this: without it, every registration looks equally real.
   */
  harnessRegistryFile?: string;
}

export interface EfficacyGap {
  code: string;
  detail: string;
  /** Which of the seven shapes this gap is an instance of. */
  shape: 2 | 4 | 5 | 6 | 7;
  /** `proxy` when the check is a correlate rather than the proposition itself. */
  confidence: "direct" | "proxy";
}

/**
 * Find the gaps where a gate exists but does not bind.
 *
 * Complements `findHookCoverageGaps`, which owns shapes 1 and 3. A repo with
 * full coverage and zero efficacy gaps has gates that are present AND binding —
 * which is the only combination worth calling enforcement.
 *
 * Output is sorted by `code`, so it is deterministic and diffable across runs.
 */
export function findHookEfficacyGaps(c: EfficacyConfig): EfficacyGap[] {
  const gaps: EfficacyGap[] = [];
  const PRE_TOOL_BLOCKING_EXIT = 2;

  for (const h of c.hooks) {
    // --- Shape 6: registered where nothing reads --------------------------
    if (c.harnessRegistryFile && !h.registeredIn.includes(c.harnessRegistryFile)) {
      gaps.push({
        code: `registered-where-nothing-reads:${h.name}`,
        shape: 6,
        confidence: "direct",
        detail:
          `"${h.name}" is registered in [${h.registeredIn.join(", ") || "nothing"}] ` +
          `but the harness reads "${c.harnessRegistryFile}". The gate is inert, ` +
          `and its presence in a registry file reads as covered.`,
      });
    }

    // --- Shape 4a: a blocking gate on a non-blocking exit code ------------
    if (
      h.intendsToBlock &&
      h.event === "PreToolUse" &&
      h.blockingExitCode !== undefined &&
      h.blockingExitCode !== PRE_TOOL_BLOCKING_EXIT
    ) {
      gaps.push({
        code: `non-blocking-exit-code:${h.name}`,
        shape: 4,
        confidence: "direct",
        detail:
          `"${h.name}" intends to deny but exits ${h.blockingExitCode}. Only exit ` +
          `${PRE_TOOL_BLOCKING_EXIT} blocks a PreToolUse call; anything else is ` +
          `reported and then proceeded past.`,
      });
    }

    // --- Shape 4b: passes vacuously when its own input is empty -----------
    if (!h.failsOnEmptyInput) {
      gaps.push({
        code: `vacuous-on-empty-input:${h.name}`,
        shape: 4,
        confidence: "direct",
        detail:
          `"${h.name}" exits clean when it has nothing to check. An empty run ` +
          `that passes is indistinguishable from real coverage.`,
      });
    }

    // --- Shape 4c: no test proves it ever blocks --------------------------
    if (h.intendsToBlock && !h.testAssertsBlock) {
      gaps.push({
        code: `no-block-assertion:${h.name}`,
        shape: 4,
        confidence: "direct",
        detail:
          `No test for "${h.name}" proves a violating input is denied. Its suite ` +
          `would stay green if the gate stopped denying.`,
      });
    }

    // --- Shape 2: asserts the adjacent property (proxy) -------------------
    if (!h.testAssertsMessage) {
      gaps.push({
        code: `asserts-adjacent-property:${h.name}`,
        shape: 2,
        confidence: "proxy",
        detail:
          `PROXY — tests for "${h.name}" assert an exit code but never the message ` +
          `text, so nothing pins WHAT it asserts. Read the gate and name the ` +
          `proposition it checks; confirm that is the proposition the rule needs.`,
      });
    }

    // --- Shape 2/3 variant: it names something that does not exist --------
    for (const s of h.namedSymbols ?? []) {
      if (!s.resolves) {
        gaps.push({
          code: `unresolved-symbol:${h.name}:${s.symbol}`,
          shape: 2,
          confidence: "direct",
          detail:
            `"${h.name}" names "${s.symbol}"${s.owningSystem ? ` and ${s.owningSystem} does not have it` : ", which does not resolve"}. ` +
            `A gate offering an escape hatch that is not there offers no escape, ` +
            `and a rule keyed on a phantom fires on nothing.`,
        });
      }
    }

    // --- Shape 5: correct, blocking, and too late -------------------------
    if (h.event === "CI" && h.hasWriteTimeTwin === false) {
      gaps.push({
        code: `enforced-too-late:${h.name}`,
        shape: 5,
        confidence: "direct",
        detail:
          `"${h.name}" runs only in CI with no write-time twin. It catches the ` +
          `violation after it was written, copied and opened as a PR.`,
      });
    }

    // --- Shape 7: the incentive is inverted -------------------------------
    if (h.severityFavorsCompliance === false) {
      gaps.push({
        code: `inverted-incentive:${h.name}`,
        shape: 7,
        confidence: "direct",
        detail:
          `"${h.name}" reserves its strictest outcome for the COMPLIANT state, so ` +
          `complying costs more than not complying. The gate is not weak — it ` +
          `points the wrong way, and every reader who notices is trained to stay ` +
          `in the lenient branch.`,
      });
    }
  }

  return gaps.sort((a, b) => a.code.localeCompare(b.code));
}

/** The seven shapes, as the question each one asks. Exported so the report can print them. */
export const VACUOUS_GATE_SHAPES: Record<number, string> = {
  1: "It does not look — no gate covers the rule.",
  2: "It looks at the adjacent property — it asserts something true and beside the point.",
  3: "It was deleted — the rule survives, the gate does not.",
  4: "It is correct and binds nothing — wrong exit code, empty input, or no test that it ever denies.",
  5: "It is correct, blocking, and too late — CI catches what write-time should have.",
  6: "It is registered where nothing reads — present in a file the harness does not load.",
  7: "Its incentive is inverted — complying costs more than not complying.",
};

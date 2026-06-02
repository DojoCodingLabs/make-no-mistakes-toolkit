/**
 * The enforcement-hook configuration observed for a repo, assembled from the
 * Stage 2 LLM observations (see `references/detectors/enforcement-hooks.md`).
 *
 * `ENF` is the **meta-audit that closes the loop**: the other five families
 * (`SCH`, `CDC`, `DDD`, `ARC`, `STR`) *detect* structural drift and *recommend*
 * cures, but detection without enforcement lets the drift return. Per the
 * dojo-os drift thesis 4-cure model, **Cure 4 — PreToolUse/PostToolUse hooks**
 * is what makes a structural rule stick: a hook intercepts the offending tool
 * call before (or telemeters after) it lands. `ENF` checks whether those hooks
 * are actually installed.
 *
 * - `repoHooks` — names of the repo-level PreToolUse/PostToolUse hooks found in
 *   `.claude/hooks/` (Cure 4a — repo owns its own enforcement).
 * - `toolkitHooksPresent` — whether the toolkit-level enforcement hooks are
 *   inherited (Cure 4b — the shared make-no-mistakes ruleset runs too).
 * - `rulesConfigPresent` — whether a rules config exists (the
 *   `.atomic-design-rules.json` analog) — without it the hooks have nothing to
 *   enforce.
 * - `structuralRules` — the structural rules in force (e.g. the cures the other
 *   five audits recommended); each should be backed by at least one hook whose
 *   name includes the rule substring.
 */
export interface EnforcementConfig {
  repoHooks: string[];
  toolkitHooksPresent: boolean;
  rulesConfigPresent: boolean;
  structuralRules: string[];
}

export interface CoverageGap {
  code: string;
  detail: string;
}

/**
 * Find the gaps in a repo's Cure-4 enforcement-hook coverage.
 *
 * Pushes one gap per rule whose condition holds:
 * - no repo-level hooks at all,
 * - toolkit-level hooks not inherited,
 * - no rules config for the hooks to enforce,
 * - one gap per structural rule that no repo hook's name covers.
 *
 * A fully-covered setup (≥1 repo hook, toolkit hooks present, rules config
 * present, every structural rule backed by a hook) returns `[]`. Output is
 * sorted by `code`, so it is deterministic and diffable across runs.
 */
export function findHookCoverageGaps(c: EnforcementConfig): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  if (c.repoHooks.length === 0) {
    gaps.push({
      code: "no-repo-hooks",
      detail:
        "No repo-level PreToolUse/PostToolUse hooks (.claude/hooks/) — Cure 4a is absent.",
    });
  }

  if (!c.toolkitHooksPresent) {
    gaps.push({
      code: "no-toolkit-hooks",
      detail:
        "Toolkit-level enforcement hooks are not inherited — Cure 4b is absent.",
    });
  }

  if (!c.rulesConfigPresent) {
    gaps.push({
      code: "no-rules-config",
      detail:
        "No rules config (.atomic-design-rules.json analog) — hooks have nothing to enforce.",
    });
  }

  for (const rule of c.structuralRules) {
    const covered = c.repoHooks.some((hook) => hook.includes(rule));
    if (!covered) {
      gaps.push({
        code: `rule-without-hook:${rule}`,
        detail: `Structural rule "${rule}" is defined but no hook enforces it.`,
      });
    }
  }

  return gaps.sort((a, b) => a.code.localeCompare(b.code));
}

import type { AuditFamily, Finding, Severity } from "./types";

/**
 * A proposed hook rule derived from a confirmed audit finding. Shape-compatible
 * with one rule object in `schemas/repo-health-rules.schema.json` (`families[<F>][]`),
 * minus the `exemptionMarker` (which is supplied when the proposal is written
 * into a `.repo-health-rules.json`). This is the Phase-2 cure-scaffold emitter:
 * v1 *proposes* the rule; the live PreToolUse/PostToolUse `.sh` hooks + the
 * apply step that installs it are Phase-2-later (documented, not built here).
 */
export interface HookRuleProposal {
  family: AuditFamily;
  id: string;
  pattern: string;
  message: string;
  severity: Severity;
}

/**
 * Turn a confirmed finding whose `cure_map` includes `"hook"` into a proposed
 * enforcement rule. Returns `null` when the finding is not hook-curable.
 *
 * Deterministic: same finding in → same proposal out (no time, no randomness).
 * - `family`  — parsed from the `SCH-001`-style id prefix.
 * - `id`      — `<family-lowercase>-<slugified-title>`.
 * - `pattern` — a glob placeholder from the first evidence file's extension
 *               (e.g. an `.sql` file yields a glob matching all `.sql` files),
 *               falling back to a match-all glob when there is none.
 * - `message` — the finding title.
 * - `severity`— the finding severity.
 */
export function proposeHookRule(finding: Finding): HookRuleProposal | null {
  if (!finding.cure_map.includes("hook")) return null;

  const family = finding.id.split("-")[0] as AuditFamily;
  const slug = slugify(finding.title);

  return {
    family,
    id: `${family.toLowerCase()}-${slug}`,
    pattern: patternFor(finding.evidence[0]?.file),
    message: finding.title,
    severity: finding.severity,
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function patternFor(file: string | undefined): string {
  if (!file) return "**/*";
  const base = file.split("/").pop() ?? file;
  const dot = base.lastIndexOf(".");
  // No extension, or a dotfile like `.gitignore` (leading dot, nothing before).
  if (dot <= 0) return "**/*";
  const ext = base.slice(dot + 1).toLowerCase();
  if (!ext) return "**/*";
  return `**/*.${ext}`;
}

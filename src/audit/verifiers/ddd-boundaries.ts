/**
 * One module in the import graph: its `path` (repo-relative) and the list of
 * paths it imports (already resolved to repo-relative paths or left as bare
 * specifiers like `react` for things outside the ownership map).
 */
export interface SourceFile {
  path: string;
  imports: string[];
}

/**
 * Maps a path `prefix` to the bounded context that owns it, e.g.
 * `{ prefix: "src/pathways/", context: "pathways" }`. A path's owning context
 * is the rule with the LONGEST matching prefix (most specific wins).
 */
export interface OwnershipRule {
  prefix: string;
  context: string;
}

export interface BoundaryViolation {
  file: string;
  importPath: string;
  fromContext: string;
  toContext: string;
}

const UNOWNED = "unowned";
const DEFAULT_SHARED_CONTEXTS = ["platform", "shared", "common"];

/**
 * Resolve a path to its owning context by the LONGEST matching `prefix` in the
 * ownership map. A path that matches no prefix resolves to `"unowned"`.
 */
function resolveContext(path: string, ownership: OwnershipRule[]): string {
  let best: OwnershipRule | undefined;
  for (const rule of ownership) {
    if (path.startsWith(rule.prefix)) {
      if (!best || rule.prefix.length > best.prefix.length) {
        best = rule;
      }
    }
  }
  return best ? best.context : UNOWNED;
}

/**
 * Find every import that crosses a bounded-context seam — a module owned by one
 * context reaching into another context's internals instead of going through a
 * shared/published interface (Conway's-Law drift).
 *
 * A violation is an import whose resolved context differs from the importing
 * file's context, EXCEPT when the target context is shared/published (in
 * `opts.sharedContexts`, default `["platform","shared","common"]`) — anyone may
 * import a published context. Imports that resolve to `"unowned"` (node_modules,
 * relative utilities, anything outside the ownership map) are never flagged, on
 * either side as a target.
 *
 * NOTE: this audits CONTEXT crossings only — *which bounded context a module
 * belongs to and whether an import crosses that seam*. It deliberately does NOT
 * audit layered dependency direction (domain→infra); that is the separate `ARC`
 * family's concern.
 *
 * Output is sorted by `file` then `importPath`, so the result is deterministic
 * and diffable across runs.
 */
export function findCrossContextImports(
  files: SourceFile[],
  ownership: OwnershipRule[],
  opts?: { sharedContexts?: string[] },
): BoundaryViolation[] {
  const shared = new Set(opts?.sharedContexts ?? DEFAULT_SHARED_CONTEXTS);
  const violations: BoundaryViolation[] = [];

  for (const file of files) {
    const fromContext = resolveContext(file.path, ownership);
    for (const importPath of file.imports) {
      const toContext = resolveContext(importPath, ownership);

      // Only flag known cross-context crossings.
      if (toContext === UNOWNED) continue;
      if (toContext === fromContext) continue;
      // A published/shared context may be imported by anyone.
      if (shared.has(toContext)) continue;

      violations.push({ file: file.path, importPath, fromContext, toContext });
    }
  }

  return violations.sort(
    (a, b) => a.file.localeCompare(b.file) || a.importPath.localeCompare(b.importPath),
  );
}

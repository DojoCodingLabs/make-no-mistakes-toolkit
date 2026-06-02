/**
 * The four layers of Explicit Architecture (Herberto Graça) — the synthesis of
 * Hexagonal (ports & adapters), Onion, and Clean architecture. They are ranked
 * by how INNER they sit: `domain` is innermost (most stable, depends on
 * nothing), `ui` is outermost.
 */
export type Layer = "domain" | "application" | "infrastructure" | "ui";

/**
 * One resolved import: its `path` (repo-relative or bare specifier) and the
 * `layer` that path belongs to.
 */
export interface LayeredImport {
  path: string;
  layer: Layer;
}

/**
 * One module in the layered import graph: its `path`, the `layer` it belongs to
 * (by folder convention: `domain/`, `application/`, `infrastructure/`,
 * `ui/`|`presentation/`), and the imports it makes (each already classified to
 * a layer).
 */
export interface LayeredFile {
  path: string;
  layer: Layer;
  imports: LayeredImport[];
}

export interface DependencyViolation {
  file: string;
  importPath: string;
  fromLayer: Layer;
  toLayer: Layer;
}

/**
 * Layer ranks for the dependency rule. Lower = more inner. Source dependencies
 * must point INWARD (toward a lower or equal rank).
 */
const RANK: Record<Layer, number> = {
  domain: 0,
  application: 1,
  infrastructure: 2,
  ui: 3,
};

/**
 * Find every import that violates the **dependency rule** of Explicit
 * Architecture (Hexagonal / Onion / Clean): source dependencies must point
 * INWARD. A file at rank R may import a target at rank ≤ R; importing a target
 * at a HIGHER rank (pointing OUTWARD) is a violation — e.g. `domain` importing
 * `infrastructure`/`application`/`ui`, or `application` importing
 * `infrastructure`/`ui`.
 *
 * NOTE: this audits layered dependency DIRECTION *within* a context. It
 * deliberately does NOT audit bounded-context crossings (which context a module
 * belongs to and whether an import crosses that seam); that is the separate
 * `DDD` family's concern.
 *
 * Output is sorted by `file` then `importPath`, so the result is deterministic
 * and diffable across runs.
 */
export function findDependencyRuleViolations(
  files: LayeredFile[],
): DependencyViolation[] {
  const violations: DependencyViolation[] = [];

  for (const file of files) {
    for (const imp of file.imports) {
      // An OUTWARD dependency (toward a higher rank) breaks the rule.
      if (RANK[imp.layer] > RANK[file.layer]) {
        violations.push({
          file: file.path,
          importPath: imp.path,
          fromLayer: file.layer,
          toLayer: imp.layer,
        });
      }
    }
  }

  return violations.sort(
    (a, b) => a.file.localeCompare(b.file) || a.importPath.localeCompare(b.importPath),
  );
}

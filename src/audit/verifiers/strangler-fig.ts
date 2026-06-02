/**
 * Signals observed about a monolith → microservices migration, assembled from
 * the Stage 2 LLM observations (see `references/detectors/strangler-fig.md`).
 *
 * The **Strangler Fig** pattern (Martin Fowler; microservices.io) incrementally
 * replaces a legacy system by routing functionality to new services behind a
 * façade, gradually "strangling" the monolith — WITHOUT a big-bang rewrite.
 *
 * - `hasFacade` — a façade/reverse-proxy/gateway/sidecar fronts old + new so
 *   both are reached through a single seam.
 * - `routesMigrated` / `routesTotal` — how many routes/capabilities have been
 *   cut over to new services vs the total to migrate.
 * - `hasDualPath` — old and new paths coexist behind a router (dual-path /
 *   dual-write / feature-flag cutover), enabling safe incremental rollout.
 * - `hasRetirementPlan` — there is a documented plan to retire the strangled
 *   legacy code once routes are migrated.
 * - `bigBangIndicators` — observed signals of a big-bang rewrite (the
 *   anti-pattern): e.g. a single giant cutover PR, a "rewrite from scratch"
 *   branch, no incremental path.
 */
export interface StranglerSignals {
  hasFacade: boolean;
  routesMigrated: number;
  routesTotal: number;
  hasDualPath: boolean;
  hasRetirementPlan: boolean;
  bigBangIndicators: string[];
}

export interface StranglerFinding {
  code: string;
  message: string;
}

/**
 * Assess the health of a Strangler-Fig migration against its observed signals.
 *
 * Pushes one finding per rule whose condition holds:
 * - no façade in front of the legacy system,
 * - big-bang rewrite indicators present,
 * - migration in progress but old + new do not coexist behind a router,
 * - routes migrated without a documented legacy-retirement plan.
 *
 * A fully-healthy migration (façade, dual path, retirement plan, no big-bang
 * indicators) returns `[]`. Output is sorted by `code`, so it is deterministic
 * and diffable across runs.
 */
export function assessStranglerHealth(
  s: StranglerSignals,
): StranglerFinding[] {
  const findings: StranglerFinding[] = [];

  if (!s.hasFacade) {
    findings.push({
      code: "no-facade",
      message:
        "No façade/proxy in front of the legacy system — new and old code are not routed through a single seam.",
    });
  }

  if (s.bigBangIndicators.length > 0) {
    findings.push({
      code: "big-bang-risk",
      message: `Big-bang rewrite indicators present: ${s.bigBangIndicators.join(", ")}.`,
    });
  }

  if (
    s.routesMigrated > 0 &&
    s.routesMigrated < s.routesTotal &&
    !s.hasDualPath
  ) {
    findings.push({
      code: "no-coexistence",
      message:
        "Migration is in progress but old and new paths do not coexist behind a router — there is no safe incremental cutover.",
    });
  }

  if (s.routesMigrated > 0 && !s.hasRetirementPlan) {
    findings.push({
      code: "no-retirement-plan",
      message:
        "Routes have been migrated but there is no documented plan to retire the strangled legacy code.",
    });
  }

  return findings.sort((a, b) => a.code.localeCompare(b.code));
}

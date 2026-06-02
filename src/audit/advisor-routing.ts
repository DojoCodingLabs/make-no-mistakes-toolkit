import type { AuditFamily } from "./types";

export interface AdvisorSignals {
  sharedDatabase: boolean;       // several teams write the same DB -> SCH
  feAndBackendValidate: boolean; // FE + backend validate the same data -> CDC
  migratingMonolith: boolean;    // splitting a monolith -> STR
  layeredArchitecture: boolean;  // domain/application/infra layering -> ARC
  crossModuleImports: boolean;   // modules import across boundaries -> DDD
}

// Canonical dependency order: data -> contracts -> context -> layers -> migration -> enforcement.
const ORDER: AuditFamily[] = ["SCH", "CDC", "DDD", "ARC", "STR", "ENF"];

export function recommendAudits(signals: AdvisorSignals): AuditFamily[] {
  const set = new Set<AuditFamily>();
  if (signals.sharedDatabase) set.add("SCH");
  if (signals.feAndBackendValidate) set.add("CDC");
  if (signals.crossModuleImports) set.add("DDD");
  if (signals.layeredArchitecture) set.add("ARC");
  if (signals.migratingMonolith) set.add("STR");
  if (set.size > 0) set.add("ENF"); // Cure-4 coverage always runs last when anything else runs
  if (set.size === 0) return [...ORDER]; // no signal => unsure => full sweep
  return ORDER.filter((id) => set.has(id));
}

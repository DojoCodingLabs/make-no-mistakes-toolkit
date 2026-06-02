export type Severity = "blocker" | "high" | "medium" | "low" | "advisory";

export type AuditId = "SCH" | "CDC" | "DDD" | "ARC" | "STR" | "ENF";

export type Cure = "ownership" | "ci_guard" | "agent_rule" | "hook";

export interface Evidence {
  file: string;
  line?: number;
  snippet?: string;
}

export interface Finding {
  id: string;            // e.g. "SCH-001"
  title: string;
  severity: Severity;
  anti_pattern: string;  // citation, e.g. "1NF (Codd 1970) + DRY"
  evidence: Evidence[];
  owner?: string;
  cure_map: Cure[];
  exemption?: string;    // honors "@repo-health-exempt: <reason>"
  confidence: "confirmed" | "probable" | "unverified";
}

export interface AuditReport {
  family: AuditId;
  repo: string;
  stack: string;
  date: string;          // ISO yyyy-mm-dd, passed in (no Date.now in pure code)
  engine_version: string;
  findings: Finding[];
}

import type { AuditReport, Finding } from "../types";

function evidenceCell(f: Finding): string {
  return f.evidence.map((e) => (e.line ? `${e.file}:${e.line}` : e.file)).join("<br>");
}

export function renderFindingsDoc(report: AuditReport): string {
  const counts = report.findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  const frontMatter = [
    "---", `family: ${report.family}`, `repo: ${report.repo}`, `stack: ${report.stack}`,
    `date: ${report.date}`, `engine_version: ${report.engine_version}`,
    `counts: ${JSON.stringify(counts)}`, "---", "",
  ].join("\n");
  const title = `# ${report.family} audit — ${report.repo} (${report.date})\n`;
  if (report.findings.length === 0) {
    return `${frontMatter}${title}\nNo findings. Clean bill of health for the ${report.family} family.\n`;
  }
  const header =
    "| ID | Severity | Title | Anti-pattern | Evidence | Cures |\n" +
    "|----|----------|-------|--------------|----------|-------|\n";
  const rows = report.findings.map(
    (f) => `| ${f.id} | ${f.severity} | ${f.title} | ${f.anti_pattern} | ${evidenceCell(f)} | ${f.cure_map.join(", ")} |`,
  ).join("\n");
  return `${frontMatter}${title}\n${header}${rows}\n`;
}

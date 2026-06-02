export interface DuplicatedColumn {
  column: string;
  tables: string[];
}
export interface SchemaDriftOptions {
  minTables: number;
  allowlist?: string[];
}
const DEFAULT_ALLOWLIST = ["id", "created_at", "updated_at", "deleted_at"];

/**
 * Parse CREATE TABLE blocks and report any column name appearing in
 * >= minTables tables (excluding allowlisted keys / timestamp columns and any
 * column ending in `_id`). A logical column duplicated across tables without a
 * shared source is a 1NF + DRY drift signal.
 */
export function findDuplicatedColumns(sql: string, opts: SchemaDriftOptions): DuplicatedColumn[] {
  const allow = new Set([...(opts.allowlist ?? []), ...DEFAULT_ALLOWLIST]);
  const byColumn = new Map<string, Set<string>>();
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?\s*\(([\s\S]*?)\);/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(sql)) !== null) {
    const table = m[1];
    const body = m[2];
    for (const rawLine of body.split(",")) {
      const colMatch = rawLine.trim().match(/^["'`]?(\w+)["'`]?\s+\w/);
      if (!colMatch) continue;
      const col = colMatch[1].toLowerCase();
      if (allow.has(col) || col.endsWith("_id")) continue;
      if (!byColumn.has(col)) byColumn.set(col, new Set());
      byColumn.get(col)!.add(table);
    }
  }
  const out: DuplicatedColumn[] = [];
  for (const [column, tables] of byColumn) {
    if (tables.size >= opts.minTables) out.push({ column, tables: [...tables] });
  }
  return out;
}

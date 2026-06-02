import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findDuplicatedColumns } from "./schema-drift";

const fx = (name: string) =>
  readFileSync(join(__dirname, "../__fixtures__/schema-drift", name), "utf8");

describe("findDuplicatedColumns", () => {
  it("flags a logical column repeated across >= 2 tables", () => {
    const dups = findDuplicatedColumns(fx("dirty.sql"), { minTables: 2 });
    const bio = dups.find((d) => d.column === "bio");
    expect(bio).toBeDefined();
    expect(bio!.tables.sort()).toEqual(["blog_authors", "hackathon_members", "profiles"]);
    const gh = dups.find((d) => d.column === "github_url");
    expect(gh!.tables.sort()).toEqual(["blog_authors", "profiles"]);
  });
  it("ignores the primary key column `id` (allowlisted)", () => {
    const dups = findDuplicatedColumns(fx("dirty.sql"), { minTables: 2 });
    expect(dups.find((d) => d.column === "id")).toBeUndefined();
  });
  it("returns nothing for a normalized schema", () => {
    const dups = findDuplicatedColumns(fx("clean.sql"), { minTables: 2 });
    expect(dups).toEqual([]);
  });
});

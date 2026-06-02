import { describe, it, expect } from "vitest";
import {
  findCrossContextImports,
  type SourceFile,
  type OwnershipRule,
} from "./ddd-boundaries";

const ownership: OwnershipRule[] = [
  { prefix: "src/pathways/", context: "pathways" },
  { prefix: "src/hackathons/", context: "hackathons" },
  { prefix: "src/platform/", context: "platform" },
];

describe("findCrossContextImports", () => {
  it("flags a pathways file importing a hackathons internal", () => {
    const files: SourceFile[] = [
      { path: "src/pathways/enroll.ts", imports: ["src/hackathons/internal/judge.ts"] },
    ];
    expect(findCrossContextImports(files, ownership)).toEqual([
      {
        file: "src/pathways/enroll.ts",
        importPath: "src/hackathons/internal/judge.ts",
        fromContext: "pathways",
        toContext: "hackathons",
      },
    ]);
  });

  it("does not flag a same-context import", () => {
    const files: SourceFile[] = [
      { path: "src/pathways/enroll.ts", imports: ["src/pathways/repo.ts"] },
    ];
    expect(findCrossContextImports(files, ownership)).toEqual([]);
  });

  it("does not flag an import of a shared/platform context", () => {
    const files: SourceFile[] = [
      { path: "src/pathways/enroll.ts", imports: ["src/platform/logger.ts"] },
    ];
    expect(findCrossContextImports(files, ownership)).toEqual([]);
  });

  it("does not flag an unowned import (e.g. node_modules)", () => {
    const files: SourceFile[] = [
      { path: "src/pathways/enroll.ts", imports: ["react", "../utils/clamp"] },
    ];
    expect(findCrossContextImports(files, ownership)).toEqual([]);
  });

  it("resolves a path's context by the longest matching prefix", () => {
    const nested: OwnershipRule[] = [
      { prefix: "src/", context: "core" },
      { prefix: "src/hackathons/", context: "hackathons" },
    ];
    const files: SourceFile[] = [
      // src/core-area belongs to "core"; importing the more-specific hackathons prefix crosses.
      { path: "src/area.ts", imports: ["src/hackathons/internal/judge.ts"] },
    ];
    expect(findCrossContextImports(files, nested)).toEqual([
      {
        file: "src/area.ts",
        importPath: "src/hackathons/internal/judge.ts",
        fromContext: "core",
        toContext: "hackathons",
      },
    ]);
  });

  it("honors a custom sharedContexts list", () => {
    const files: SourceFile[] = [
      { path: "src/pathways/enroll.ts", imports: ["src/hackathons/internal/judge.ts"] },
    ];
    expect(
      findCrossContextImports(files, ownership, { sharedContexts: ["hackathons"] }),
    ).toEqual([]);
  });

  it("returns violations sorted by file then importPath", () => {
    const files: SourceFile[] = [
      {
        path: "src/pathways/enroll.ts",
        imports: ["src/hackathons/zeta.ts", "src/hackathons/alpha.ts"],
      },
      { path: "src/hackathons/score.ts", imports: ["src/pathways/repo.ts"] },
    ];
    const result = findCrossContextImports(files, ownership);
    expect(result.map((v) => [v.file, v.importPath])).toEqual([
      ["src/hackathons/score.ts", "src/pathways/repo.ts"],
      ["src/pathways/enroll.ts", "src/hackathons/alpha.ts"],
      ["src/pathways/enroll.ts", "src/hackathons/zeta.ts"],
    ]);
  });
});

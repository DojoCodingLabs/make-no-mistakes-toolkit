import { describe, it, expect } from "vitest";
import {
  findDependencyRuleViolations,
  type LayeredFile,
} from "./explicit-architecture";

describe("findDependencyRuleViolations", () => {
  it("flags domain importing infrastructure (outward → domain-purity breach)", () => {
    const files: LayeredFile[] = [
      {
        path: "src/domain/order.ts",
        layer: "domain",
        imports: [{ path: "src/infrastructure/db.ts", layer: "infrastructure" }],
      },
    ];
    expect(findDependencyRuleViolations(files)).toEqual([
      {
        file: "src/domain/order.ts",
        importPath: "src/infrastructure/db.ts",
        fromLayer: "domain",
        toLayer: "infrastructure",
      },
    ]);
  });

  it("does not flag ui importing domain (inward is OK)", () => {
    const files: LayeredFile[] = [
      {
        path: "src/ui/order-page.ts",
        layer: "ui",
        imports: [{ path: "src/domain/order.ts", layer: "domain" }],
      },
    ];
    expect(findDependencyRuleViolations(files)).toEqual([]);
  });

  it("flags application importing ui (outward)", () => {
    const files: LayeredFile[] = [
      {
        path: "src/application/place-order.ts",
        layer: "application",
        imports: [{ path: "src/ui/order-page.ts", layer: "ui" }],
      },
    ];
    expect(findDependencyRuleViolations(files)).toEqual([
      {
        file: "src/application/place-order.ts",
        importPath: "src/ui/order-page.ts",
        fromLayer: "application",
        toLayer: "ui",
      },
    ]);
  });

  it("does not flag application importing domain (inward is OK)", () => {
    const files: LayeredFile[] = [
      {
        path: "src/application/place-order.ts",
        layer: "application",
        imports: [{ path: "src/domain/order.ts", layer: "domain" }],
      },
    ];
    expect(findDependencyRuleViolations(files)).toEqual([]);
  });

  it("does not flag a same-layer import", () => {
    const files: LayeredFile[] = [
      {
        path: "src/domain/order.ts",
        layer: "domain",
        imports: [{ path: "src/domain/money.ts", layer: "domain" }],
      },
    ];
    expect(findDependencyRuleViolations(files)).toEqual([]);
  });

  it("returns violations sorted by file then importPath", () => {
    const files: LayeredFile[] = [
      {
        path: "src/domain/order.ts",
        layer: "domain",
        imports: [
          { path: "src/ui/zeta.ts", layer: "ui" },
          { path: "src/infrastructure/alpha.ts", layer: "infrastructure" },
        ],
      },
      {
        path: "src/application/handler.ts",
        layer: "application",
        imports: [{ path: "src/infrastructure/repo.ts", layer: "infrastructure" }],
      },
    ];
    const result = findDependencyRuleViolations(files);
    expect(result.map((v) => [v.file, v.importPath])).toEqual([
      ["src/application/handler.ts", "src/infrastructure/repo.ts"],
      ["src/domain/order.ts", "src/infrastructure/alpha.ts"],
      ["src/domain/order.ts", "src/ui/zeta.ts"],
    ]);
  });
});

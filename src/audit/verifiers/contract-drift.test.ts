import { describe, it, expect } from "vitest";
import { diffValidationSchemas, type SchemaShape } from "./contract-drift";

describe("diffValidationSchemas", () => {
  it("flags a type mismatch with both producer and consumer types", () => {
    const producer: SchemaShape = { age: "number" };
    const consumer: SchemaShape = { age: "string" };
    expect(diffValidationSchemas(producer, consumer)).toEqual([
      { field: "age", kind: "type_mismatch", producerType: "number", consumerType: "string" },
    ]);
  });

  it("flags a field present in the producer but missing in the consumer", () => {
    const producer: SchemaShape = { id: "string", email: "string" };
    const consumer: SchemaShape = { id: "string" };
    expect(diffValidationSchemas(producer, consumer)).toEqual([
      { field: "email", kind: "missing_in_consumer", producerType: "string" },
    ]);
  });

  it("flags a field present in the consumer but missing in the producer", () => {
    const producer: SchemaShape = { id: "string" };
    const consumer: SchemaShape = { id: "string", nickname: "string" };
    expect(diffValidationSchemas(producer, consumer)).toEqual([
      { field: "nickname", kind: "missing_in_producer", consumerType: "string" },
    ]);
  });

  it("returns [] for identical schemas", () => {
    const producer: SchemaShape = { id: "string", age: "number" };
    const consumer: SchemaShape = { id: "string", age: "number" };
    expect(diffValidationSchemas(producer, consumer)).toEqual([]);
  });

  it("returns drifts in deterministic field-name order", () => {
    const producer: SchemaShape = { zeta: "number", alpha: "string", beta: "boolean" };
    const consumer: SchemaShape = { zeta: "string", beta: "boolean" };
    expect(diffValidationSchemas(producer, consumer).map((d) => d.field)).toEqual([
      "alpha",
      "zeta",
    ]);
  });
});

/**
 * Field name → normalized type string (e.g. `{ age: "number", id: "string" }`).
 * Both sides of a consumer-driven contract are parsed into this shape before
 * diffing, so the verifier is schema-language-agnostic (Zod / Yup / JSON-schema
 * / Dart models all normalize down to this map).
 */
export type SchemaShape = Record<string, string>;

export interface ContractDrift {
  field: string;
  kind: "missing_in_consumer" | "missing_in_producer" | "type_mismatch";
  producerType?: string;
  consumerType?: string;
}

/**
 * Diff a producer validation schema against a consumer validation schema for the
 * SAME payload and report every field that has drifted:
 *
 * - `missing_in_consumer` — present in producer, absent in consumer.
 * - `missing_in_producer` — present in consumer, absent in producer.
 * - `type_mismatch` — present in both with differing normalized type (both
 *   types are included).
 *
 * Identical schemas produce `[]`. Output is sorted by field name so the result
 * is deterministic and diffable across runs.
 */
export function diffValidationSchemas(
  producer: SchemaShape,
  consumer: SchemaShape,
): ContractDrift[] {
  const drifts: ContractDrift[] = [];
  const fields = new Set([...Object.keys(producer), ...Object.keys(consumer)]);

  for (const field of fields) {
    const inProducer = Object.prototype.hasOwnProperty.call(producer, field);
    const inConsumer = Object.prototype.hasOwnProperty.call(consumer, field);

    if (inProducer && !inConsumer) {
      drifts.push({ field, kind: "missing_in_consumer", producerType: producer[field] });
    } else if (!inProducer && inConsumer) {
      drifts.push({ field, kind: "missing_in_producer", consumerType: consumer[field] });
    } else if (producer[field] !== consumer[field]) {
      drifts.push({
        field,
        kind: "type_mismatch",
        producerType: producer[field],
        consumerType: consumer[field],
      });
    }
  }

  return drifts.sort((a, b) => a.field.localeCompare(b.field));
}

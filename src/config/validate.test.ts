/*
Tests for config/validate module behavior: Zod document validation and CLI value coercion.
*/

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { toJsonSchema } from "../core/zod-schema.ts";
import {
  parseConfigSetValue,
  validateConfigDocument,
  validateConfigDocumentPartial,
  validateConfigValue,
} from "./validate.ts";

const rootZod = z.strictObject({
  apiToken: z.string().min(1),
  maxRetries: z.number().int().min(0).max(10),
  enabled: z.boolean().default(true),
  prefs: z.strictObject({ ttl: z.number() }).optional(),
});
const rootSchema = toJsonSchema(rootZod, "input");

/** Tests for config/validate. */
describe("config/validate", () => {
  test("accepts valid document", () => {
    const result = validateConfigDocument({ apiToken: "x", maxRetries: 3, prefs: { ttl: 3600 } }, rootZod);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("ignores framework keys such as _bindings", () => {
    const result = validateConfigDocument({ apiToken: "x", maxRetries: 3, _bindings: { apiToken: "env" } }, rootZod);
    expect(result.valid).toBe(true);
  });

  test("rejects missing required property with its path", () => {
    const result = validateConfigDocument({ apiToken: "x" }, rootZod);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["maxRetries: required"]);
  });

  test("rejects unknown property on strict schemas", () => {
    const result = validateConfigDocument({ apiToken: "x", maxRetries: 1, extra: true }, rootZod);
    expect(result.errors).toEqual(['$: Unrecognized key: "extra" (allowed: apiToken, enabled, maxRetries, prefs)']);
  });

  test("reports one precise error for a bad discriminator", () => {
    const steps = z.strictObject({
      steps: z.array(
        z.discriminatedUnion("kind", [
          z.strictObject({ kind: z.literal("alpha"), title: z.string() }),
          z.strictObject({ kind: z.enum(["beta", "bravo"]), count: z.number().optional() }),
        ]),
      ),
    });
    expect(validateConfigDocument({ steps: [{ kind: "alpha", title: "x" }, { kind: "beta" }] }, steps).valid).toBe(
      true,
    );
    const bad = validateConfigDocument({ steps: [{ kind: "alfa" }, { kind: "beta", count: "x" }] }, steps);
    expect(bad.errors).toHaveLength(2);
    expect(bad.errors[0]).toStartWith("steps.0.kind: Invalid discriminator value");
    expect(bad.errors[0]).toEndWith('(got "alfa")');
    expect(bad.errors[1]).toBe("steps.1.count: Invalid input: expected number, received string");
  });

  test("caps at 10 errors plus a count of the remainder", () => {
    const many = z.strictObject({ steps: z.array(z.strictObject({ kind: z.literal("a") })) });
    const result = validateConfigDocument({ steps: Array.from({ length: 12 }, () => ({})) }, many);
    expect(result.errors).toHaveLength(11);
    expect(result.errors[10]).toBe("…and 2 more errors");
  });

  test("partial validation skips top-level required keys but still checks types", () => {
    expect(validateConfigDocumentPartial({ maxRetries: 2 }, rootZod).valid).toBe(true);
    expect(validateConfigDocumentPartial({ maxRetries: "x" }, rootZod).valid).toBe(false);
    expect(validateConfigDocumentPartial({ extra: 1 }, rootZod).valid).toBe(false);
  });

  test("validateConfigValue throws the first message without the root path prefix", () => {
    expect(() => validateConfigValue(11, rootZod.shape.maxRetries)).toThrow(/Too big/);
    expect(() => validateConfigValue("x", undefined)).not.toThrow();
  });

  test("parseConfigSetValue coerces number and boolean", () => {
    expect(parseConfigSetValue("5", { type: "integer" }, rootSchema, false)).toBe(5);
    expect(parseConfigSetValue("true", { type: "boolean" }, rootSchema, false)).toBe(true);
  });

  test("parseConfigSetValue validates the coerced value against the key schema", () => {
    const prop = rootSchema.properties as Record<string, Record<string, unknown>>;
    expect(parseConfigSetValue("5", prop.maxRetries, rootSchema, false, rootZod.shape.maxRetries)).toBe(5);
    expect(() => parseConfigSetValue("50", prop.maxRetries, rootSchema, false, rootZod.shape.maxRetries)).toThrow(
      /Too big/,
    );
  });

  test("parseConfigSetValue requires --json for objects", () => {
    expect(() => parseConfigSetValue("ttl:1", { type: "object" }, rootSchema, false)).toThrow(/--json/);
    expect(parseConfigSetValue('{"ttl":1}', { type: "object" }, rootSchema, true)).toEqual({ ttl: 1 });
    expect(parseConfigSetValue('{"ttl":1}', { type: "object" }, rootSchema, false)).toEqual({ ttl: 1 });
  });

  test("parseConfigSetValue accepts comma-separated string arrays", () => {
    const servicesSchema = { type: "array", items: { type: "string" } };
    expect(parseConfigSetValue("a,b", servicesSchema, rootSchema, false)).toEqual(["a", "b"]);
    expect(parseConfigSetValue('["a","b"]', servicesSchema, rootSchema, false)).toEqual(["a", "b"]);
  });

  test("parseConfigSetValue accepts comma-separated number arrays", () => {
    const schema = { type: "array", items: { type: "integer" } };
    expect(parseConfigSetValue("1, 2, 3", schema, rootSchema, false)).toEqual([1, 2, 3]);
  });

  test("parseConfigSetValue accepts comma-separated date arrays", () => {
    const schema = { type: "array", items: { type: "string", format: "date" } };
    expect(parseConfigSetValue("2024-01-01,2024-02-01", schema, rootSchema, false)).toEqual([
      "2024-01-01",
      "2024-02-01",
    ]);
  });

  test("parseConfigSetValue rejects non-primitive arrays without JSON", () => {
    const schema = {
      type: "array",
      items: { type: "object", properties: { ttl: { type: "number" } }, required: ["ttl"] },
    };
    expect(() => parseConfigSetValue("a,b", schema, rootSchema, false)).toThrow(/--json/);
    expect(parseConfigSetValue('[{"ttl":1}]', schema, rootSchema, false)).toEqual([{ ttl: 1 }]);
  });
});

/*
Tests for config/validate module behavior.
*/

import { describe, expect, test } from "bun:test";
import { parseConfigSetValue, validateConfigDocument } from "./validate.ts";

const rootSchema = {
  type: "object",
  additionalProperties: false,
  required: ["apiToken", "maxRetries"],
  properties: {
    apiToken: { type: "string", minLength: 1 },
    maxRetries: { type: "integer", minimum: 0, maximum: 10 },
    enabled: { type: "boolean", default: true },
    prefs: {
      type: "object",
      properties: { ttl: { type: "number" } },
      required: ["ttl"],
    },
  },
};

/** Tests for config/validate. */
describe("config/validate", () => {
  test("accepts valid document", () => {
    const result = validateConfigDocument({ apiToken: "x", maxRetries: 3, prefs: { ttl: 3600 } }, rootSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("rejects missing required property", () => {
    const result = validateConfigDocument({ apiToken: "x" }, rootSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("maxRetries"))).toBe(true);
  });

  test("rejects unknown property when additionalProperties is false", () => {
    const result = validateConfigDocument({ apiToken: "x", maxRetries: 1, extra: true }, rootSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("extra"))).toBe(true);
  });

  test("rejects type mismatch", () => {
    const result = validateConfigDocument({ apiToken: "x", maxRetries: "nope" }, rootSchema);
    expect(result.valid).toBe(false);
  });

  test("parseConfigSetValue coerces number and boolean", () => {
    expect(parseConfigSetValue("5", { type: "integer" }, rootSchema, false)).toBe(5);
    expect(parseConfigSetValue("true", { type: "boolean" }, rootSchema, false)).toBe(true);
  });

  test("parseConfigSetValue requires --json for objects", () => {
    expect(() => parseConfigSetValue("ttl:1", { type: "object" }, rootSchema, false)).toThrow(/--json/);
    expect(parseConfigSetValue('{"ttl":1}', { type: "object" }, rootSchema, true)).toEqual({
      ttl: 1,
    });
    expect(parseConfigSetValue('{"ttl":1}', { type: "object" }, rootSchema, false)).toEqual({
      ttl: 1,
    });
  });

  test("parseConfigSetValue accepts comma-separated string arrays", () => {
    const servicesSchema = {
      type: "array",
      items: { type: "string" },
    };
    expect(parseConfigSetValue("a,b", servicesSchema, rootSchema, false)).toEqual(["a", "b"]);
    expect(parseConfigSetValue('["a","b"]', servicesSchema, rootSchema, false)).toEqual(["a", "b"]);
  });

  test("parseConfigSetValue accepts comma-separated number arrays", () => {
    const schema = { type: "array", items: { type: "integer" } };
    expect(parseConfigSetValue("1, 2, 3", schema, rootSchema, false)).toEqual([1, 2, 3]);
  });

  test("parseConfigSetValue accepts comma-separated date arrays", () => {
    const schema = {
      type: "array",
      items: { type: "string", format: "date" },
    };
    expect(parseConfigSetValue("2024-01-01,2024-02-01", schema, rootSchema, false)).toEqual([
      "2024-01-01",
      "2024-02-01",
    ]);
  });

  test("parseConfigSetValue rejects non-primitive arrays without JSON", () => {
    const schema = {
      type: "array",
      items: {
        type: "object",
        properties: { ttl: { type: "number" } },
        required: ["ttl"],
      },
    };
    expect(() => parseConfigSetValue("a,b", schema, rootSchema, false)).toThrow(/--json/);
    expect(parseConfigSetValue('[{"ttl":1}]', schema, rootSchema, false)).toEqual([{ ttl: 1 }]);
  });
});

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

describe("config/validate", () => {
  test("accepts valid document", () => {
    const result = validateConfigDocument(
      { apiToken: "x", maxRetries: 3, prefs: { ttl: 3600 } },
      rootSchema,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("rejects missing required property", () => {
    const result = validateConfigDocument({ apiToken: "x" }, rootSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("maxRetries"))).toBe(true);
  });

  test("rejects unknown property when additionalProperties is false", () => {
    const result = validateConfigDocument(
      { apiToken: "x", maxRetries: 1, extra: true },
      rootSchema,
    );
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
    expect(() => parseConfigSetValue('{"ttl":1}', { type: "object" }, rootSchema, false)).toThrow(
      /--json/,
    );
    expect(parseConfigSetValue('{"ttl":1}', { type: "object" }, rootSchema, true)).toEqual({
      ttl: 1,
    });
  });
});

/*
Tests for config/validate module behavior.
*/

import { describe, expect, test } from "bun:test";
import {
  parseConfigSetValue,
  resolveSchemaDraft,
  validateConfigDocument,
  validateConfigDocumentPartial,
} from "./validate.ts";

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

  test("resolveSchemaDraft maps $schema URIs", () => {
    expect(resolveSchemaDraft({ $schema: "http://json-schema.org/draft-07/schema#" })).toBe("7");
    expect(resolveSchemaDraft({ $schema: "https://json-schema.org/draft/2020-12/schema" })).toBe("2020-12");
    expect(resolveSchemaDraft({ $schema: "https://json-schema.org/draft/2019-09/schema" })).toBe("2019-09");
    expect(resolveSchemaDraft({})).toBe("7");
  });

  test("validates draft 2020-12 schemas when $schema is set", () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1 },
      },
    };
    expect(validateConfigDocument({ name: "ok" }, schema).valid).toBe(true);
    expect(validateConfigDocument({ name: "" }, schema).valid).toBe(false);
    expect(validateConfigDocument({}, schema).valid).toBe(false);
  });

  test("validateConfigDocumentPartial accepts schemagen root with empty definitions", () => {
    const schema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      additionalProperties: false,
      required: ["email"],
      properties: {
        email: { type: "string" },
        services: { type: "array", items: { type: "string" } },
      },
      definitions: {},
    };
    expect(validateConfigDocumentPartial({ email: "a@example.com", services: ["a"] }, schema).valid).toBe(true);
  });

  test("validates draft 2020-12 $defs refs", () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["item"],
      properties: {
        item: { $ref: "#/$defs/Item" },
      },
      $defs: {
        Item: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: { id: { type: "string" } },
        },
      },
    };
    expect(validateConfigDocument({ item: { id: "a" } }, schema).valid).toBe(true);
    expect(validateConfigDocument({ item: { id: 1 } }, schema).valid).toBe(false);
  });
});

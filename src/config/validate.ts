/*
App config validation and CLI value coercion.
Documents and single values validate against Zod schemas (through the schema adapter); `configure set` and
prompt input are coerced from text using the emitted JSON Schema (comma-separated arrays, booleans, numbers).
*/

import type { z } from "zod";
import { parseCommaList, parseDate, parseDateTime } from "../core/formats.ts";
import { resolveJsonPointer } from "../core/json-pointer.ts";
import { validateWithSchema } from "../core/zod-schema.ts";
import { isFrameworkConfigKey } from "./bindings.ts";

/** Emitted JSON Schema node (read-only view used for coercion). */
type JsonSchema = Record<string, unknown>;

/** Homogeneous primitive `items` schema for comma-separated array input. */
interface PrimitiveArrayItems {
  /** Primitive item type. */
  kind: "string" | "integer" | "number" | "boolean";
  /** Optional string format (`date`, `date-time`). */
  format?: string;
}

/** Outcome of validating a config document. */
export interface ValidateResult {
  /** True when the document satisfies the schema. */
  valid: boolean;
  /** Human-readable `path: message` lines (empty when valid). */
  errors: string[];
}

/** Drops framework keys (e.g. `_bindings`) so strict schemas don't reject them. */
function dataForSchemaValidation(
  /** Config document as read from disk or merged for a write. */
  data: unknown,
): unknown {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return data;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isFrameworkConfigKey(key)) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Validates a full config document against its Zod schema. */
export function validateConfigDocument(
  /** Config document (framework keys are ignored). */
  data: unknown,
  /** Effective config schema. */
  schema: z.ZodType,
): ValidateResult {
  const result = validateWithSchema(schema, dataForSchemaValidation(data));
  return { valid: result.valid, errors: result.errors };
}

/** Validates present keys only — every top-level key becomes optional (partial writes / bootstrap). */
export function validateConfigDocumentPartial(
  /** Config document (framework keys are ignored). */
  data: unknown,
  /** Effective config schema. */
  schema: z.ZodObject,
): ValidateResult {
  return validateConfigDocument(data, schema.partial());
}

/** Validates one config value against its key schema; throws the first error message. */
export function validateConfigValue(
  /** Value to store for the key. */
  value: unknown,
  /** Zod schema for the key (no-op when undefined). */
  keySchema: z.ZodType | undefined,
): void {
  if (keySchema === undefined) {
    return;
  }
  const result = validateWithSchema(keySchema, value);
  if (!result.valid) {
    throw new Error(result.errors[0]?.replace(/^\$: /, "") ?? "Invalid config value");
  }
}

function resolveSchema(schema: JsonSchema, root: JsonSchema): JsonSchema | undefined {
  const ref = schema.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    return schema;
  }
  const target = resolveJsonPointer(root, ref);
  if (typeof target === "object" && target !== null && !Array.isArray(target)) {
    return target as JsonSchema;
  }
  return schema;
}

function normalizeTypes(type: unknown): string[] {
  if (typeof type === "string") {
    return [type];
  }
  if (Array.isArray(type)) {
    return type.filter((t): t is string => typeof t === "string");
  }
  return [];
}

/** Parses a JSON literal from `configure set --json` or a value starting with `[` / `{`. */
function parseJsonLiteral(
  /** Raw JSON text. */
  raw: string,
): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid JSON");
  }
}

function homogeneousPrimitiveArrayItems(
  arraySchema: JsonSchema,
  rootSchema: JsonSchema,
): PrimitiveArrayItems | undefined {
  const items = arraySchema.items;
  if (typeof items !== "object" || items === null || Array.isArray(items)) {
    return undefined;
  }
  const resolved = resolveSchema(items as JsonSchema, rootSchema);
  if (!resolved) {
    return undefined;
  }
  const types = normalizeTypes(resolved.type);
  if (types.length !== 1) {
    return undefined;
  }
  const kind = types[0];
  if (kind === "string" || kind === "integer" || kind === "number" || kind === "boolean") {
    const format = typeof resolved.format === "string" ? resolved.format : undefined;
    return { kind, format };
  }
  return undefined;
}

function parseBooleanToken(raw: string): boolean {
  const lower = raw.trim().toLowerCase();
  if (lower === "true" || lower === "1") return true;
  if (lower === "false" || lower === "0") return false;
  throw new Error("Expected boolean: true, false, 1, or 0");
}

function parsePrimitiveArraySegment(segment: string, items: PrimitiveArrayItems): unknown {
  switch (items.kind) {
    case "string": {
      if (items.format === "date") {
        return parseDate(segment);
      }
      if (items.format === "date-time") {
        return parseDateTime(segment);
      }
      return segment;
    }
    case "integer": {
      const n = Number(segment);
      if (Number.isNaN(n) || !Number.isInteger(n)) {
        throw new Error(`Expected integer: ${segment}`);
      }
      return n;
    }
    case "number": {
      const n = Number(segment);
      if (Number.isNaN(n)) {
        throw new Error(`Expected number: ${segment}`);
      }
      return n;
    }
    case "boolean":
      return parseBooleanToken(segment);
  }
}

function parseHomogeneousPrimitiveArray(raw: string, arraySchema: JsonSchema, rootSchema: JsonSchema): unknown[] {
  const items = homogeneousPrimitiveArrayItems(arraySchema, rootSchema);
  if (!items) {
    throw new Error("Use --json for object or array config values");
  }
  const segments = parseCommaList(raw);
  if (segments.length === 0) {
    throw new Error("Comma-separated list must contain at least one value");
  }
  return segments.map((segment) => parsePrimitiveArraySegment(segment, items));
}

/** Optional suffix for interactive configure value prompts (schema-aware). */
export function configValueInputHint(
  propertySchema: JsonSchema | undefined,
  rootSchema: JsonSchema,
): string | undefined {
  if (!propertySchema) {
    return undefined;
  }
  const resolved = resolveSchema(propertySchema, rootSchema);
  if (!resolved) {
    return undefined;
  }
  const types = normalizeTypes(resolved.type);
  if (types.includes("array") && homogeneousPrimitiveArrayItems(resolved, rootSchema)) {
    return "comma-separated or JSON array";
  }
  if (types.includes("array") || types.includes("object")) {
    return "JSON";
  }
  return undefined;
}

/**
 * Parses a CLI/MCP set value: coerces `raw` using the emitted property schema (booleans, numbers,
 * comma-separated primitive arrays, JSON literals), then validates it against the key's Zod schema when given.
 */
export function parseConfigSetValue(
  /** Raw value text from argv, MCP, or a prompt. */
  raw: string,
  /** Emitted JSON Schema for the key (drives coercion). */
  propertySchema: JsonSchema | undefined,
  /** Emitted JSON Schema root (resolves local `$ref`s). */
  rootSchema: JsonSchema,
  /** When true, `raw` must be a JSON literal. */
  useJson: boolean,
  /** Zod schema for the key; the coerced value is validated against it. */
  keySchema?: z.ZodType,
): unknown {
  const value = coerceConfigSetValue(raw, propertySchema, rootSchema, useJson);
  validateConfigValue(value, keySchema);
  return value;
}

/** Coerces a raw set value using the emitted property schema (no validation). */
function coerceConfigSetValue(
  /** Raw value text. */
  raw: string,
  /** Emitted JSON Schema for the key. */
  propertySchema: JsonSchema | undefined,
  /** Emitted JSON Schema root. */
  rootSchema: JsonSchema,
  /** When true, `raw` must be a JSON literal. */
  useJson: boolean,
): unknown {
  if (useJson) {
    return parseJsonLiteral(raw);
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseJsonLiteral(trimmed);
  }

  const resolved = propertySchema ? resolveSchema(propertySchema, rootSchema) : undefined;
  const types = resolved ? normalizeTypes(resolved.type) : ["string"];

  if (types.includes("boolean")) {
    return parseBooleanToken(trimmed);
  }
  if (types.includes("number") || types.includes("integer")) {
    const n = Number(trimmed);
    if (Number.isNaN(n)) {
      throw new Error("Expected number");
    }
    if (types.includes("integer") && !Number.isInteger(n)) {
      throw new Error("Expected integer");
    }
    return n;
  }
  if (types.includes("array")) {
    if (!resolved) {
      throw new Error("Use --json for object or array config values");
    }
    return parseHomogeneousPrimitiveArray(trimmed, resolved, rootSchema);
  }
  if (types.includes("object")) {
    throw new Error("Use --json for object or array config values");
  }
  return raw;
}

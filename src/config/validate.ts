/*
JSON Schema validation for program.appConfig and leaf inputSchema (@cfworker/json-schema).
CLI value coercion for configure set remains here (comma-separated arrays, booleans, etc.).
*/

import { format as jsonSchemaFormats, type Schema, type SchemaDraft, Validator } from "@cfworker/json-schema";
import { parseCommaList, parseDate, parseDateTime, validateCommaList } from "../core/formats.ts";
import { isFrameworkConfigKey } from "./bindings.ts";

type JsonSchema = Record<string, unknown>;

/** Homogeneous primitive `items` schema for comma-separated array input. */
interface PrimitiveArrayItems {
  kind: "string" | "integer" | "number" | "boolean";
  format?: string;
}

export interface ValidateResult {
  valid: boolean;
  errors: string[];
}

if (!jsonSchemaFormats["comma-list"]) {
  jsonSchemaFormats["comma-list"] = (value: string) => {
    try {
      validateCommaList(value);
      return true;
    } catch {
      return false;
    }
  };
}

function dataForSchemaValidation(data: unknown): unknown {
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

function schemaWithoutRequired(schema: unknown): JsonSchema {
  if (typeof schema !== "object" || schema === null) {
    return schema as JsonSchema;
  }
  if (Array.isArray(schema)) {
    return schema.map(schemaWithoutRequired) as unknown as JsonSchema;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "required") {
      continue;
    }
    out[key] = schemaWithoutRequired(value);
  }
  return out as JsonSchema;
}

function formatInstancePath(instanceLocation: string): string {
  if (instanceLocation.length === 0 || instanceLocation === "#") {
    return "$";
  }
  if (instanceLocation.startsWith("#/")) {
    return instanceLocation.slice(2).replace(/\//g, ".");
  }
  return instanceLocation;
}

function formatValidationErrors(errors: { instanceLocation: string; error: string }[]): string[] {
  return errors.map(({ instanceLocation, error }) => {
    const path = formatInstancePath(instanceLocation);
    return `${path}: ${error}`;
  });
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Map a schema `$schema` URI to the @cfworker/json-schema draft (defaults to Draft-07). */
export function resolveSchemaDraft(schema: JsonSchema): SchemaDraft {
  const $schema = schema.$schema;
  if (typeof $schema !== "string") {
    return "7";
  }
  const normalized = $schema.toLowerCase();
  if (normalized.includes("2020-12")) {
    return "2020-12";
  }
  if (normalized.includes("2019-09")) {
    return "2019-09";
  }
  if (normalized.includes("draft-04") || normalized.includes("draft/4")) {
    return "4";
  }
  if (normalized.includes("draft-07") || normalized.includes("draft/7")) {
    return "7";
  }
  return "7";
}

function resolveJsonPointer(root: JsonSchema, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    return undefined;
  }
  const segments = ref
    .slice(2)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(decodeJsonPointerSegment);
  let current: unknown = root;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function attachRootCompanionSchemas(validator: Validator, root: JsonSchema, active: JsonSchema): void {
  if (active === root) {
    return;
  }
  const companion: Schema = {};
  if (typeof root.definitions === "object" && root.definitions !== null && !Array.isArray(root.definitions)) {
    companion.definitions = root.definitions;
  }
  if (typeof root.$defs === "object" && root.$defs !== null && !Array.isArray(root.$defs)) {
    companion.$defs = root.$defs;
  }
  if (Object.keys(companion).length > 0) {
    validator.addSchema(companion);
  }
}

function validatorForSchema(schema: JsonSchema, root: JsonSchema, partial: boolean): Validator {
  const active = partial ? schemaWithoutRequired(schema) : schema;
  const validator = new Validator(active as Schema, resolveSchemaDraft(root), false);
  attachRootCompanionSchemas(validator, root, active);
  return validator;
}

function validateInstance(
  data: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  partial: boolean,
  stripFrameworkKeys: boolean,
): ValidateResult {
  const validator = validatorForSchema(schema, root, partial);
  const payload = stripFrameworkKeys ? dataForSchemaValidation(data) : data;
  const result = validator.validate(payload);
  if (result.valid) {
    return { valid: true, errors: [] };
  }
  return { valid: false, errors: formatValidationErrors(result.errors) };
}

function validateAgainstSchema(data: unknown, rootSchema: JsonSchema, partial: boolean): ValidateResult {
  return validateInstance(data, rootSchema, rootSchema, partial, true);
}

/** Validate `data` against a JSON Schema root. Returns human-readable error messages. */
export function validateConfigDocument(data: unknown, rootSchema: JsonSchema): ValidateResult {
  return validateAgainstSchema(data, rootSchema, false);
}

/** Validate present keys only — skips `required` checks (partial writes / bootstrap). */
export function validateConfigDocumentPartial(data: unknown, rootSchema: JsonSchema): ValidateResult {
  return validateAgainstSchema(data, rootSchema, true);
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

export function validateParsedConfigValue(
  parsed: unknown,
  propertySchema: JsonSchema | undefined,
  rootSchema: JsonSchema,
): unknown {
  if (!propertySchema) {
    return parsed;
  }
  const result = validateInstance(parsed, propertySchema, rootSchema, false, false);
  if (!result.valid) {
    throw new Error(result.errors[0] ?? "Invalid config value");
  }
  return parsed;
}

function parseJsonLiteral(raw: string, propertySchema: JsonSchema | undefined, rootSchema: JsonSchema): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid JSON");
  }
  return validateParsedConfigValue(parsed, propertySchema, rootSchema);
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

/** Parse a CLI/MCP set value against a property schema. */
export function parseConfigSetValue(
  raw: string,
  propertySchema: JsonSchema | undefined,
  rootSchema: JsonSchema,
  useJson: boolean,
): unknown {
  if (useJson) {
    return parseJsonLiteral(raw, propertySchema, rootSchema);
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseJsonLiteral(trimmed, propertySchema, rootSchema);
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
    const parsed = parseHomogeneousPrimitiveArray(trimmed, resolved, rootSchema);
    return validateParsedConfigValue(parsed, propertySchema, rootSchema);
  }
  if (types.includes("object")) {
    throw new Error("Use --json for object or array config values");
  }
  return raw;
}

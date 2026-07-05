/*
Draft-07 JSON Schema subset validator for program.appConfig files.
Aligned with common ts-json-schema-generator output (local $ref, objects, scalars).
*/

import { parseCommaList, parseDate, parseDateTime } from "../formats.ts";

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

/** Validate `data` against a JSON Schema root. Returns human-readable error messages. */
export function validateConfigDocument(data: unknown, rootSchema: JsonSchema): ValidateResult {
  const errors: string[] = [];
  validateValue(data, rootSchema, rootSchema, "$", errors);
  return { valid: errors.length === 0, errors };
}

function validateValue(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: string[],
): void {
  const resolved = resolveSchema(schema, root);
  if (!resolved) {
    return;
  }

  if ("const" in resolved) {
    if (value !== resolved.const) {
      errors.push(`${path}: must be ${JSON.stringify(resolved.const)}`);
    }
    return;
  }

  if (Array.isArray(resolved.enum)) {
    if (!resolved.enum.some((item) => item === value)) {
      errors.push(`${path}: must be one of ${JSON.stringify(resolved.enum)}`);
    }
    return;
  }

  const anyOf = resolved.anyOf ?? resolved.oneOf;
  if (Array.isArray(anyOf)) {
    const branchErrors: string[][] = [];
    for (const branch of anyOf) {
      if (typeof branch !== "object" || branch === null || Array.isArray(branch)) {
        continue;
      }
      const branchErrs: string[] = [];
      validateValue(value, branch as JsonSchema, root, path, branchErrs);
      if (branchErrs.length === 0) {
        return;
      }
      branchErrors.push(branchErrs);
    }
    errors.push(`${path}: must match one of the allowed types`);
    if (branchErrors.length === 1 && branchErrors[0]?.[0]) {
      errors.push(branchErrors[0][0]);
    }
    return;
  }

  const types = normalizeTypes(resolved.type);
  if (types.length > 0 && !matchesAnyType(value, types)) {
    errors.push(`${path}: must be ${types.join(" or ")}`);
    return;
  }

  if (types.includes("string") || (types.length === 0 && typeof value === "string")) {
    validateString(value, resolved, path, errors);
  }
  if (types.includes("number") || types.includes("integer")) {
    validateNumber(value, resolved, path, errors, types.includes("integer"));
  }
  if (types.includes("boolean")) {
    if (typeof value !== "boolean") {
      errors.push(`${path}: must be boolean`);
    }
  }
  if (types.includes("null") && value !== null) {
    errors.push(`${path}: must be null`);
  }
  if (types.includes("object") || (types.length === 0 && isPlainObject(value))) {
    validateObject(value, resolved, root, path, errors);
  }
  if (types.includes("array") || (types.length === 0 && Array.isArray(value))) {
    validateArray(value, resolved, root, path, errors);
  }
}

function resolveSchema(schema: JsonSchema, root: JsonSchema): JsonSchema | undefined {
  const ref = schema.$ref;
  if (typeof ref === "string" && ref.startsWith("#/definitions/")) {
    const name = decodeURIComponent(ref.slice("#/definitions/".length));
    const definitions = root.definitions;
    if (typeof definitions !== "object" || definitions === null || Array.isArray(definitions)) {
      return schema;
    }
    const target = (definitions as Record<string, unknown>)[name];
    if (typeof target === "object" && target !== null && !Array.isArray(target)) {
      return target as JsonSchema;
    }
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

function matchesAnyType(value: unknown, types: string[]): boolean {
  for (const t of types) {
    if (t === "null" && value === null) return true;
    if (t === "array" && Array.isArray(value)) return true;
    if (t === "object" && isPlainObject(value)) return true;
    if (t === "integer" && typeof value === "number" && Number.isInteger(value)) return true;
    if (t === "number" && typeof value === "number") return true;
    if (t === "boolean" && typeof value === "boolean") return true;
    if (t === "string" && typeof value === "string") return true;
  }
  return types.length === 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateString(value: unknown, schema: JsonSchema, path: string, errors: string[]): void {
  if (typeof value !== "string") {
    errors.push(`${path}: must be string`);
    return;
  }
  if (typeof schema.minLength === "number" && value.length < schema.minLength) {
    errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
  }
  if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
    errors.push(`${path}: string longer than maxLength ${schema.maxLength}`);
  }
  if (typeof schema.pattern === "string") {
    try {
      if (!new RegExp(schema.pattern).test(value)) {
        errors.push(`${path}: does not match pattern`);
      }
    } catch {
      /* invalid pattern in schema — skip */
    }
  }
}

function validateNumber(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[],
  integer: boolean,
): void {
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.push(`${path}: must be number`);
    return;
  }
  if (integer && !Number.isInteger(value)) {
    errors.push(`${path}: must be integer`);
  }
  if (typeof schema.minimum === "number" && value < schema.minimum) {
    errors.push(`${path}: below minimum ${schema.minimum}`);
  }
  if (typeof schema.maximum === "number" && value > schema.maximum) {
    errors.push(`${path}: above maximum ${schema.maximum}`);
  }
}

function validateObject(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: string[],
): void {
  if (!isPlainObject(value)) {
    errors.push(`${path}: must be object`);
    return;
  }
  const properties = schema.properties;
  const propMap =
    typeof properties === "object" && properties !== null && !Array.isArray(properties)
      ? (properties as Record<string, JsonSchema>)
      : undefined;

  if (propMap) {
    for (const [key, propSchema] of Object.entries(propMap)) {
      if (key in value) {
        validateValue(value[key], propSchema, root, `${path}.${key}`, errors);
      }
    }
  }

  const required = schema.required;
  if (Array.isArray(required)) {
    for (const key of required) {
      if (typeof key === "string" && !(key in value)) {
        errors.push(`${path}: missing required property '${key}'`);
      }
    }
  }

  if (schema.additionalProperties === false && propMap) {
    for (const key of Object.keys(value)) {
      if (!(key in propMap)) {
        errors.push(`${path}: unknown property '${key}'`);
      }
    }
  }
}

function validateArray(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${path}: must be array`);
    return;
  }
  if (typeof schema.minItems === "number" && value.length < schema.minItems) {
    errors.push(`${path}: fewer than minItems ${schema.minItems}`);
  }
  if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
    errors.push(`${path}: more than maxItems ${schema.maxItems}`);
  }
  const items = schema.items;
  if (typeof items === "object" && items !== null && !Array.isArray(items)) {
    for (let i = 0; i < value.length; i++) {
      validateValue(value[i], items as JsonSchema, root, `${path}[${i}]`, errors);
    }
  }
}

function validateParsedConfigValue(
  parsed: unknown,
  propertySchema: JsonSchema | undefined,
  rootSchema: JsonSchema,
): unknown {
  if (!propertySchema) {
    return parsed;
  }
  const errors: string[] = [];
  validateValue(parsed, propertySchema, rootSchema, "$", errors);
  if (errors.length > 0) {
    throw new Error(errors[0] ?? "Invalid config value");
  }
  return parsed;
}

function parseJsonLiteral(
  raw: string,
  propertySchema: JsonSchema | undefined,
  rootSchema: JsonSchema,
): unknown {
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

function parseHomogeneousPrimitiveArray(
  raw: string,
  arraySchema: JsonSchema,
  rootSchema: JsonSchema,
): unknown[] {
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

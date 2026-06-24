/*
Draft-07 JSON Schema subset validator for program.appConfig files.
Aligned with common ts-json-schema-generator output (local $ref, objects, scalars).
*/

type JsonSchema = Record<string, unknown>;

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

/** Parse a CLI/MCP set value against a property schema. */
export function parseConfigSetValue(
  raw: string,
  propertySchema: JsonSchema | undefined,
  rootSchema: JsonSchema,
  useJson: boolean,
): unknown {
  if (useJson) {
    const parsed = JSON.parse(raw) as unknown;
    const errors: string[] = [];
    if (propertySchema) {
      validateValue(parsed, propertySchema, rootSchema, "$", errors);
      if (errors.length > 0) {
        throw new Error(errors[0] ?? "Invalid config value");
      }
    }
    return parsed;
  }

  const resolved = propertySchema ? resolveSchema(propertySchema, rootSchema) : undefined;
  const types = resolved ? normalizeTypes(resolved.type) : ["string"];

  if (types.includes("boolean")) {
    const lower = raw.trim().toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
    throw new Error("Expected boolean: true, false, 1, or 0");
  }
  if (types.includes("number") || types.includes("integer")) {
    const n = Number(raw);
    if (Number.isNaN(n)) {
      throw new Error("Expected number");
    }
    if (types.includes("integer") && !Number.isInteger(n)) {
      throw new Error("Expected integer");
    }
    return n;
  }
  if (types.includes("object") || types.includes("array")) {
    throw new Error("Use --json for object or array config values");
  }
  return raw;
}

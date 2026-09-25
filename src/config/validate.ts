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

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** cfworker keywords that only wrap a deeper, more specific failure — dropped when one survives underneath. */
const WRAPPER_KEYWORDS = new Set([
  "$ref",
  "$recursiveRef",
  "properties",
  "items",
  "prefixItems",
  "additionalItems",
  "allOf",
  "anyOf",
  "oneOf",
]);

/** Raw cfworker validation error (the subset of `OutputUnit` this module reads). */
interface RawError {
  instanceLocation: string;
  keyword: string;
  keywordLocation: string;
  error: string;
}

/** Walks a `keywordLocation` JSON Pointer against `root`, following `$ref` segments through `resolveJsonPointer`. */
function schemaAtPointer(root: JsonSchema, keywordLocation: string): JsonSchema | unknown[] | undefined {
  if (!keywordLocation.startsWith("#")) {
    return undefined;
  }
  const segments = keywordLocation
    .slice(1)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(decodeJsonPointerSegment);
  let current: unknown = root;
  for (const segment of segments) {
    if (segment === "$ref") {
      if (typeof current !== "object" || current === null || Array.isArray(current)) {
        return undefined;
      }
      const ref = (current as JsonSchema).$ref;
      if (typeof ref !== "string") {
        return undefined;
      }
      current = resolveJsonPointer(root, ref);
      continue;
    }
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current as JsonSchema | unknown[] | undefined;
}

/** Walks an `instanceLocation` JSON Pointer against the validated payload. */
function instanceAtPointer(data: unknown, instanceLocation: string): unknown {
  if (!instanceLocation.startsWith("#")) {
    return undefined;
  }
  const segments = instanceLocation
    .slice(1)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(decodeJsonPointerSegment);
  let current: unknown = data;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** The parent JSON Pointer of `location` (its last `/segment` removed), or `undefined` at the root. */
function parentPointer(location: string): string | undefined {
  const idx = location.lastIndexOf("/");
  if (idx < 0) {
    return undefined;
  }
  return location.slice(0, idx) || "#";
}

/** A discriminator property common to every branch, with each branch's set of accepted string values. */
interface UnionDiscriminator {
  prop: string;
  valuesByBranch: string[][];
}

/**
 * Finds a property present in every branch as a string `const` or all-string `enum`, whose value sets are
 * pairwise disjoint across branches. Prefers `kind`, then `type`, then the alphabetically first eligible name.
 * Each branch is resolved through a bare `$ref` first — a schema built with a `definitions`/`$defs` map
 * (e.g. ts-json-schema-generator output) typically writes `anyOf: [{ $ref: "#/definitions/A" }, …]` rather
 * than inlining each branch, so without this every branch here would otherwise look property-less.
 */
function unionDiscriminator(branches: unknown[], root: JsonSchema): UnionDiscriminator | undefined {
  const resolvedBranches = branches.map((b) => {
    if (typeof b !== "object" || b === null || Array.isArray(b)) {
      return b;
    }
    const ref = (b as JsonSchema).$ref;
    if (typeof ref !== "string") {
      return b;
    }
    return resolveJsonPointer(root, ref) ?? b;
  });
  const objectBranches = resolvedBranches.filter(
    (b): b is JsonSchema => typeof b === "object" && b !== null && !Array.isArray(b),
  );
  if (objectBranches.length === 0 || objectBranches.length !== resolvedBranches.length) {
    return undefined;
  }

  const branchValuesFor = (prop: string): string[][] | undefined => {
    const perBranch: string[][] = [];
    for (const branch of objectBranches) {
      const props = branch.properties;
      const propSchema =
        typeof props === "object" && props !== null && !Array.isArray(props)
          ? (props as Record<string, JsonSchema>)[prop]
          : undefined;
      if (!propSchema || typeof propSchema !== "object") {
        return undefined;
      }
      let values: string[] | undefined;
      if (typeof propSchema.const === "string") {
        values = [propSchema.const];
      } else if (Array.isArray(propSchema.enum) && propSchema.enum.every((v) => typeof v === "string")) {
        values = propSchema.enum as string[];
      }
      if (!values || values.length === 0) {
        return undefined;
      }
      perBranch.push(values);
    }
    const seen = new Set<string>();
    for (const values of perBranch) {
      for (const v of values) {
        if (seen.has(v)) return undefined;
        seen.add(v);
      }
    }
    return perBranch;
  };

  const candidateProps = new Set<string>();
  for (const branch of objectBranches) {
    const props = branch.properties;
    if (typeof props === "object" && props !== null && !Array.isArray(props)) {
      for (const key of Object.keys(props)) candidateProps.add(key);
    }
  }

  const eligible: string[] = [];
  for (const prop of candidateProps) {
    if (branchValuesFor(prop)) eligible.push(prop);
  }
  if (eligible.length === 0) {
    return undefined;
  }
  const prop = eligible.includes("kind") ? "kind" : eligible.includes("type") ? "type" : [...eligible].sort()[0]!;
  return { prop, valuesByBranch: branchValuesFor(prop)! };
}

/** Sorted, comma-joined, unquoted list of values for error messages. */
function joinSorted(values: Iterable<string>): string {
  return [...new Set(values)].sort().join(", ");
}

/** Rewrites a single surviving cfworker error message into a terser, more actionable form. */
function rewriteErrorMessage(err: RawError, root: JsonSchema): string {
  const additionalPropsMatch = /^Property "(.+)" does not match additional properties schema\.$/.exec(err.error);
  if (additionalPropsMatch) {
    const name = additionalPropsMatch[1]!;
    const parentLoc = parentPointer(err.keywordLocation);
    const parentSchema = parentLoc ? schemaAtPointer(root, parentLoc) : undefined;
    const props =
      parentSchema && typeof parentSchema === "object" && !Array.isArray(parentSchema)
        ? (parentSchema as JsonSchema).properties
        : undefined;
    const keys = props && typeof props === "object" && !Array.isArray(props) ? Object.keys(props as JsonSchema) : [];
    const allowed = keys.sort().slice(0, 20).join(", ");
    return `unknown property "${name}"${allowed ? ` (allowed: ${allowed})` : ""}`;
  }

  const requiredMatch = /^Instance does not have required property "(.+)"\.$/.exec(err.error);
  if (requiredMatch) {
    return `missing required property "${requiredMatch[1]}"`;
  }

  const enumMatch = /^Instance does not match any of (\[.*\])\.$/.exec(err.error);
  if (enumMatch) {
    try {
      const values = JSON.parse(enumMatch[1]!) as unknown[];
      return `must be one of: ${values.map((v) => String(v)).join(", ")}`;
    } catch {
      // fall through to the raw message
    }
  }

  const typeMatch = /^Instance type "(.+)" is invalid\. Expected "(.+)"\.$/.exec(err.error);
  if (typeMatch) {
    return `must be ${typeMatch[2]} (got ${typeMatch[1]})`;
  }

  return err.error;
}

/** Maximum number of narrowed errors reported before collapsing the remainder into a count. */
const MAX_NARROWED_ERRORS = 10;

/**
 * Post-processes raw cfworker errors: for each `anyOf`/`oneOf` failure with a discriminated union, keeps only
 * the branch matching the instance's discriminator value (or reports one synthetic error naming what a valid
 * discriminator looks like); drops wrapper keywords once a more specific error survives under them; drops the
 * `additionalProperties`+`false` pair cfworker emits even for properties that are legitimately declared; then
 * rewrites the remaining messages into terser, more actionable text.
 */
function narrowUnionErrors(errors: RawError[], root: JsonSchema, data: unknown): string[] {
  const dropped = new Set<RawError>();
  const synthetic: Array<{ instanceLocation: string; message: string }> = [];
  // Locations of anyOf/oneOf errors resolved into a synthetic message rather than a kept branch — an ancestor
  // wrapper (e.g. the `$ref` pointing at that anyOf, for the same instance) counts as "resolved deeper" too.
  const syntheticReplacedLocations: Array<{ instanceLocation: string; keywordLocation: string }> = [];

  // Stage 1: discriminated-union narrowing.
  for (const err of errors) {
    if (err.keyword !== "anyOf" && err.keyword !== "oneOf") continue;
    const branches = schemaAtPointer(root, err.keywordLocation);
    if (!Array.isArray(branches)) continue;
    const discriminator = unionDiscriminator(branches, root);
    if (!discriminator) continue;

    // Array items reuse one schema, so keywordLocation repeats verbatim across indices — scope by
    // instanceLocation too, or narrowing one item would wrongly swallow every other item's errors.
    const under = errors.filter(
      (e) =>
        e !== err &&
        e.keywordLocation.startsWith(`${err.keywordLocation}/`) &&
        (e.instanceLocation === err.instanceLocation || e.instanceLocation.startsWith(`${err.instanceLocation}/`)),
    );
    const validValues = discriminator.valuesByBranch.flat();
    const instance = instanceAtPointer(data, err.instanceLocation);

    if (typeof instance !== "object" || instance === null || Array.isArray(instance)) {
      dropped.add(err);
      for (const e of under) dropped.add(e);
      syntheticReplacedLocations.push({ instanceLocation: err.instanceLocation, keywordLocation: err.keywordLocation });
      synthetic.push({
        instanceLocation: err.instanceLocation,
        message: `expected an object with "${discriminator.prop}" (one of: ${joinSorted(validValues)})`,
      });
      continue;
    }

    const propValue = (instance as Record<string, unknown>)[discriminator.prop];
    if (propValue === undefined) {
      dropped.add(err);
      for (const e of under) dropped.add(e);
      syntheticReplacedLocations.push({ instanceLocation: err.instanceLocation, keywordLocation: err.keywordLocation });
      synthetic.push({
        instanceLocation: err.instanceLocation,
        message: `missing "${discriminator.prop}" (expected one of: ${joinSorted(validValues)})`,
      });
      continue;
    }

    const branchIndex = discriminator.valuesByBranch.findIndex(
      (values) => typeof propValue === "string" && values.includes(propValue),
    );
    if (branchIndex < 0) {
      dropped.add(err);
      for (const e of under) dropped.add(e);
      syntheticReplacedLocations.push({ instanceLocation: err.instanceLocation, keywordLocation: err.keywordLocation });
      synthetic.push({
        instanceLocation: `${err.instanceLocation}/${discriminator.prop}`,
        message: `unknown ${discriminator.prop} "${String(propValue)}" (expected one of: ${joinSorted(validValues)})`,
      });
      continue;
    }

    const keepPrefix = `${err.keywordLocation}/${branchIndex}`;
    dropped.add(err);
    for (const e of under) {
      if (e.keywordLocation === keepPrefix || e.keywordLocation.startsWith(`${keepPrefix}/`)) continue;
      dropped.add(e);
    }
  }

  // Stage 2: drop wrapper keywords once a more specific error survives under them, or once a descendant anyOf/oneOf
  // was resolved into a synthetic message instead (which leaves no raw descendant error to detect otherwise).
  const survivingAfterStage1 = errors.filter((e) => !dropped.has(e));
  const nestsUnder = (candidateInstance: string, wrapperInstance: string) =>
    candidateInstance === wrapperInstance || candidateInstance.startsWith(`${wrapperInstance}/`);
  for (const err of survivingAfterStage1) {
    if (!WRAPPER_KEYWORDS.has(err.keyword)) continue;
    const prefix = `${err.keywordLocation}/`;
    // Array items reuse one schema, so a wrapper's keywordLocation repeats across indices — scope by
    // instanceLocation too, or one index's surviving error would mask another index's real problem.
    const hasDeeper = survivingAfterStage1.some(
      (other) =>
        other !== err &&
        !dropped.has(other) &&
        other.keywordLocation.startsWith(prefix) &&
        nestsUnder(other.instanceLocation, err.instanceLocation),
    );
    const hasSyntheticDeeper = syntheticReplacedLocations.some(
      (s) => s.keywordLocation.startsWith(prefix) && nestsUnder(s.instanceLocation, err.instanceLocation),
    );
    if (hasDeeper || hasSyntheticDeeper) dropped.add(err);
  }

  // Stage 3: drop the additionalProperties+false pair cfworker emits for properties actually in `properties`.
  const additionalPropsInstanceLocations = new Set(
    errors.filter((e) => e.keyword === "additionalProperties").map((e) => e.instanceLocation),
  );
  for (const err of errors) {
    if (dropped.has(err)) continue;
    if (err.keyword === "additionalProperties") {
      const match = /^Property "(.+)" does not match additional properties schema\.$/.exec(err.error);
      const parentLoc = parentPointer(err.keywordLocation);
      const parentSchema = parentLoc ? schemaAtPointer(root, parentLoc) : undefined;
      const props =
        match && parentSchema && typeof parentSchema === "object" && !Array.isArray(parentSchema)
          ? (parentSchema as JsonSchema).properties
          : undefined;
      const declared =
        match && props && typeof props === "object" && !Array.isArray(props)
          ? Object.hasOwn(props as JsonSchema, match[1]!)
          : false;
      if (declared) dropped.add(err);
      continue;
    }
    if (err.keyword === "false") {
      const parent = parentPointer(err.instanceLocation);
      if (parent !== undefined && additionalPropsInstanceLocations.has(parent)) {
        dropped.add(err);
      }
    }
  }

  // Stage 4: rewrite surviving messages, merge in synthetic ones, cap the total.
  const kept = errors
    .filter((e) => !dropped.has(e))
    .map((e) => `${formatInstancePath(e.instanceLocation)}: ${rewriteErrorMessage(e, root)}`);
  const syntheticFormatted = synthetic.map((s) => `${formatInstancePath(s.instanceLocation)}: ${s.message}`);
  const all = [...syntheticFormatted, ...kept];
  if (all.length <= MAX_NARROWED_ERRORS) {
    return all;
  }
  return [...all.slice(0, MAX_NARROWED_ERRORS), `…and ${all.length - MAX_NARROWED_ERRORS} more errors`];
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
  if (
    typeof root.definitions === "object" &&
    root.definitions !== null &&
    !Array.isArray(root.definitions) &&
    Object.keys(root.definitions).length > 0
  ) {
    companion.definitions = root.definitions;
  }
  if (
    typeof root.$defs === "object" &&
    root.$defs !== null &&
    !Array.isArray(root.$defs) &&
    Object.keys(root.$defs).length > 0
  ) {
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
  return { valid: false, errors: narrowUnionErrors(result.errors as RawError[], root, payload) };
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

/*
Effective JSON Schema for program.appConfig (block schema or all-string synthesis).
*/

import type { CliAppConfigEntry, CliProgram } from "../types.ts";
import { configEntryRequired, jsonSchemaRequiredKeys } from "./entry.ts";

/** Synthesize a draft-07 object schema with string properties from metadata entries. */
export function synthesizeAllStringSchema(
  schema: Record<string, CliAppConfigEntry>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, entry] of Object.entries(schema)) {
    const prop: Record<string, unknown> = {
      type: "string",
      description: entry.description,
    };
    if (entry.default !== undefined) {
      prop.default = entry.default;
    }
    properties[key] = prop;
    if (entry.required !== false) {
      required.push(key);
    }
  }
  const out: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    properties,
  };
  if (required.length > 0) {
    out.required = required;
  }
  return out;
}

/** Block JSON Schema used for validation, or synthesized all-string schema. */
export function effectiveJsonSchema(program: CliProgram): Record<string, unknown> | undefined {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return undefined;
  }
  if (appConfig.jsonSchema !== undefined) {
    return appConfig.jsonSchema;
  }
  return synthesizeAllStringSchema(appConfig.entries);
}

/** Property subschema for one config key from the effective root schema. */
export function configPropertySchema(
  jsonSchema: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const properties = jsonSchema.properties;
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return undefined;
  }
  const prop = (properties as Record<string, unknown>)[key];
  if (typeof prop !== "object" || prop === null || Array.isArray(prop)) {
    return undefined;
  }
  return prop as Record<string, unknown>;
}

/** Default value for a key from JSON Schema property or entry metadata. */
export function schemaDefaultForKey(program: CliProgram, key: string): unknown | undefined {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return undefined;
  }
  const entry = appConfig.entries[key];
  if (!entry) {
    return undefined;
  }
  const jsonSchema = effectiveJsonSchema(program);
  if (jsonSchema) {
    const prop = configPropertySchema(jsonSchema, key);
    if (prop && "default" in prop) {
      return prop.default;
    }
  }
  return entry.default;
}

/** Required key set for the program config schema. */
export function programConfigRequiredKeys(program: CliProgram): Set<string> {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return new Set();
  }
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const required = new Set<string>();
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (configEntryRequired(key, entry, fromSchema)) {
      required.add(key);
    }
  }
  return required;
}

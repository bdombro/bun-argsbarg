/*
Effective config schema for appConfig: the user's Zod object schema, or an all-string schema
synthesized from entries. Validation uses the Zod schema; prompts, coercion, manifests, and export read the
emitted JSON Schema.
*/

import { z } from "zod";
import type { AppConfigEntry, AppSpec, JsonSchema } from "../core/types.ts";
import { toJsonSchema } from "../core/zod-schema.ts";
import { configEntryRequired, jsonSchemaRequiredKeys } from "./entry.ts";

/** Synthesized all-string schemas, memoized per entries object so emission is cached too. */
const synthesized = new WeakMap<Record<string, AppConfigEntry>, z.ZodObject>();

/**
 * Synthesizes a strict all-string Zod object schema from metadata entries.
 * Entry defaults are applied by the resolver, so they are only recorded as JSON Schema `default` metadata.
 */
export function synthesizeAllStringSchema(
  /** Config entries keyed by config key. */
  entries: Record<string, AppConfigEntry>,
): z.ZodObject {
  const cached = synthesized.get(entries);
  if (cached !== undefined) {
    return cached;
  }
  const shape: Record<string, z.ZodType> = {};
  for (const [key, entry] of Object.entries(entries)) {
    const prop = z
      .string()
      .meta(
        entry.default === undefined
          ? { description: entry.description }
          : { description: entry.description, default: entry.default },
      );
    shape[key] = entry.required === false ? prop.optional() : prop;
  }
  const schema = z.strictObject(shape);
  synthesized.set(entries, schema);
  return schema;
}

/** Zod schema that validates the config file: `appConfig.schema`, or the synthesized all-string schema. */
export function effectiveConfigZod(program: AppSpec): z.ZodObject | undefined {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return undefined;
  }
  return appConfig.schema ?? synthesizeAllStringSchema(appConfig.entries);
}

/** Zod schema for one config key, when the effective schema declares it. */
export function configKeySchema(program: AppSpec, key: string): z.ZodType | undefined {
  const shape = effectiveConfigZod(program)?.shape as Record<string, z.ZodType> | undefined;
  return shape?.[key];
}

/** Emitted JSON Schema of the effective config schema (for prompts, coercion, manifests, and export). */
export function effectiveJsonSchema(program: AppSpec): JsonSchema | undefined {
  const schema = effectiveConfigZod(program);
  return schema === undefined ? undefined : toJsonSchema(schema, "input");
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
export function schemaDefaultForKey(program: AppSpec, key: string): unknown | undefined {
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
export function programConfigRequiredKeys(program: AppSpec): Set<string> {
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

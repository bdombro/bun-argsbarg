/*
Resolve program.appConfig values: defaults, file, env override, export to process.env.
*/

import type { CliAppConfigEntry, CliProgram } from "../types.ts";
import { configEntryRequired, jsonSchemaRequiredKeys } from "./entry.ts";
import type { AppConfigFileData } from "./file.ts";
import { displayAppConfigPath } from "./file.ts";
import { effectiveJsonSchema, schemaDefaultForKey } from "./schema.ts";

export type ResolvedConfig = Record<string, unknown>;

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string" && value.length === 0) {
    return false;
  }
  return true;
}

function envOverrideValue(envName: string): string | undefined {
  const val = process.env[envName];
  if (val === undefined || val.length === 0) {
    return undefined;
  }
  return val;
}

/** Coerce env string to typed value using property schema when possible. */
function coerceEnvValue(program: CliProgram, key: string, raw: string): unknown {
  const jsonSchema = effectiveJsonSchema(program);
  if (!jsonSchema) {
    return raw;
  }
  const properties = jsonSchema.properties;
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return raw;
  }
  const prop = (properties as Record<string, unknown>)[key];
  if (typeof prop !== "object" || prop === null || Array.isArray(prop)) {
    return raw;
  }
  const type = (prop as Record<string, unknown>).type;
  if (type === "number" || type === "integer") {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (type === "boolean") {
    const lower = raw.toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
  }
  return raw;
}

/** Resolve all schema keys from file data and process.env. */
export function resolveAppConfig(program: CliProgram, fileData: AppConfigFileData): ResolvedConfig {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return {};
  }
  const out: ResolvedConfig = {};
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    const value = resolveConfigKey(program, key, entry, fileData);
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function resolveConfigKey(
  program: CliProgram,
  key: string,
  entry: CliAppConfigEntry,
  fileData: AppConfigFileData,
): unknown {
  if (entry.env) {
    const fromEnv = envOverrideValue(entry.env);
    if (fromEnv !== undefined) {
      return coerceEnvValue(program, key, fromEnv);
    }
  }
  if (key in fileData && isPresent(fileData[key])) {
    return fileData[key];
  }
  const def = schemaDefaultForKey(program, key);
  if (def !== undefined) {
    return def;
  }
  return undefined;
}

/** Write mapped config values to process.env for subprocess inheritance. */
export function exportConfigToEnv(program: CliProgram, resolved: ResolvedConfig): void {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (!entry.env) {
      continue;
    }
    const value = resolved[key];
    if (!isPresent(value)) {
      continue;
    }
    process.env[entry.env] = stringifyConfigValue(value);
  }
}

export function stringifyConfigValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Required schema keys that are still missing after resolution. */
export function missingRequiredConfig(program: CliProgram, resolved: ResolvedConfig): string[] {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return [];
  }
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const missing: string[] = [];
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (!configEntryRequired(key, entry, fromSchema)) {
      continue;
    }
    if (!isPresent(resolved[key])) {
      missing.push(key);
    }
  }
  return missing;
}

/** Stderr message when required config keys are missing. */
export function formatMissingConfigMessage(program: CliProgram, keys: string[]): string {
  const list = keys.join(", ");
  const path = displayAppConfigPath(program);
  return [
    `Missing required configuration: ${list}`,
    `Configure interactively:  ${program.key} install --configure`,
    `Or set via:               ${program.key} config set <key> <value>`,
    `Config file:              ${path}`,
    `See:                      ${program.key} docs mcp`,
  ].join("\n");
}

/** MCP tools/call error when required config is missing. */
export function formatMcpMissingConfigMessage(program: CliProgram, keys: string[]): string {
  const list = keys.join(", ");
  const path = displayAppConfigPath(program);
  return [
    `Missing required configuration: ${list}`,
    `Configure: ${program.key} install --configure`,
    `Or set via: ${program.key} config set`,
    `Config file: ${path}`,
  ].join("\n");
}

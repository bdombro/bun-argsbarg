/*
MCP bundle / plugin manifest builders for program.appConfig env-mapped entries.
*/

import type { CliAppConfigEntry, CliProgram } from "../types.ts";
import {
  configEntryRequired,
  configEntrySensitive,
  configUserConfigKey,
  defaultConfigEntryTitle,
  jsonSchemaRequiredKeys,
} from "./entry.ts";
import { effectiveJsonSchema } from "./schema.ts";

function buildConfigUserConfigEntry(
  key: string,
  entry: CliAppConfigEntry,
  jsonSchemaRequired: Set<string> | undefined,
): Record<string, unknown> {
  return {
    type: "string",
    title: entry.title ?? defaultConfigEntryTitle(key),
    description: entry.description,
    sensitive: configEntrySensitive(key, entry),
    required: configEntryRequired(key, entry, jsonSchemaRequired),
  };
}

/** Builds MCPB/plugin user_config from schema entries with `env` set. */
export function buildProgramUserConfig(program: CliProgram): Record<string, unknown> | undefined {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return undefined;
  }
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (!entry.env) {
      continue;
    }
    out[configUserConfigKey(key)] = buildConfigUserConfigEntry(key, entry, fromSchema);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Plugin .mcp.json env mapping from program.appConfig env entries. */
export function buildPluginMcpEnvMapping(program: CliProgram): Record<string, string> | undefined {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (!entry.env) {
      continue;
    }
    const manifestKey = configUserConfigKey(key);
    out[entry.env] = `\${user_config.${manifestKey}}`;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

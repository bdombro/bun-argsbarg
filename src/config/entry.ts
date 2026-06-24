/*
Shared helpers for program.appConfig schema entries.
*/

import type { CliAppConfigEntry, CliProgram } from "../types.ts";

/** Default title when `CliAppConfigEntry.title` is omitted. */
export function defaultConfigEntryTitle(key: string): string {
  return key;
}

/** Default sensitive flag from config key name. */
export function defaultConfigEntrySensitive(key: string): boolean {
  return /key|token|secret|password/i.test(key);
}

/** Whether a schema entry is required for bootstrap / MCP enforcement. */
export function configEntryRequired(
  key: string,
  entry: CliAppConfigEntry,
  jsonSchemaRequired: Set<string> | undefined,
): boolean {
  if (entry.required === false) {
    return false;
  }
  if (jsonSchemaRequired !== undefined) {
    return jsonSchemaRequired.has(key);
  }
  return true;
}

/** Whether prompts and `config get` should redact this entry. */
export function configEntrySensitive(key: string, entry: CliAppConfigEntry): boolean {
  return entry.sensitive ?? defaultConfigEntrySensitive(key);
}

/** Manifest / plugin user_config key from a schema key. */
export function configUserConfigKey(key: string): string {
  const snake = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return snake || "config_key";
}

/** Required keys from a JSON Schema object root. */
export function jsonSchemaRequiredKeys(
  jsonSchema: Record<string, unknown>,
): Set<string> | undefined {
  const required = jsonSchema.required;
  if (!Array.isArray(required)) {
    return undefined;
  }
  return new Set(required.filter((k): k is string => typeof k === "string"));
}

/** Whether built-in config get/set commands are enabled. */
export function configCommandsEnabled(program: CliProgram): boolean {
  if (!program.appConfig) {
    return false;
  }
  const commands = program.appConfig.commands;
  if (commands === false) {
    return false;
  }
  if (typeof commands === "object" && commands.enabled === false) {
    return false;
  }
  return true;
}

/** Whether MCP exposes config set (config_get always on when commands enabled). */
export function configMcpSetEnabled(program: CliProgram): boolean {
  const commands = program.appConfig?.commands;
  if (typeof commands === "object" && commands.mcpSet === false) {
    return false;
  }
  return true;
}

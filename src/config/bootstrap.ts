/*
Bootstrap: load config, validate, resolve, export, TTY prompts, install --configure.
*/

import { existsSync, readSync } from "node:fs";
import type { CliAppConfigEntry, CliProgram } from "../types.ts";
import {
  configEntryRequired,
  configEntrySensitive,
  defaultConfigEntryTitle,
  jsonSchemaRequiredKeys,
} from "./entry.ts";
import {
  displayAppConfigPath,
  readAppConfigFile,
  readAppConfigFileRaw,
  resolveAppConfigPath,
  writeAppConfigFile,
} from "./file.ts";
import type { ResolvedConfig } from "./resolve.ts";
import {
  exportConfigToEnv,
  formatMissingConfigMessage,
  missingRequiredConfig,
  resolveAppConfig,
  stringifyConfigValue,
} from "./resolve.ts";
import { effectiveJsonSchema } from "./schema.ts";

export interface EnsureAppConfigOpts {
  interactive: boolean;
  exitOnMissing: boolean;
  configure?: boolean;
}

export interface ConfigBootstrapResult {
  fileData: Record<string, unknown>;
  resolved: ResolvedConfig;
}

/** Load, validate, resolve, and export config. */
export function bootstrapAppConfig(
  program: CliProgram,
  opts: { validateFile: boolean },
): ConfigBootstrapResult {
  const path = resolveAppConfigPath(program);
  const fileData = opts.validateFile ? readAppConfigFile(program) : readAppConfigFileRaw(path);
  const resolved = resolveAppConfig(program, fileData);
  exportConfigToEnv(program, resolved);
  return { fileData, resolved };
}

function readPromptLine(mask: boolean): string {
  if (!mask) {
    const buf = Buffer.alloc(4096);
    const n = readSync(0, buf, { length: 4096 });
    return buf.toString("utf8", 0, n).replace(/\r?\n$/, "");
  }
  let result = "";
  const buf = Buffer.alloc(1);
  while (true) {
    const n = readSync(0, buf, { length: 1 });
    if (n <= 0) {
      break;
    }
    const byte = buf[0];
    if (byte === undefined) {
      continue;
    }
    if (byte === 10 || byte === 13) {
      break;
    }
    if (byte === 127 || byte === 8) {
      result = result.slice(0, -1);
      continue;
    }
    result += String.fromCharCode(byte);
    process.stderr.write("*");
  }
  process.stderr.write("\n");
  return result;
}

function promptConfigKey(
  key: string,
  entry: CliAppConfigEntry,
  current: unknown,
  configure: boolean,
  jsonSchemaRequired: Set<string> | undefined,
): unknown {
  const title = entry.title ?? defaultConfigEntryTitle(key);
  const required = configEntryRequired(key, entry, jsonSchemaRequired);
  const heading = required || !configure ? title : `${title} (optional)`;
  process.stderr.write(`${heading}\n`);
  process.stderr.write(`  ${entry.description}\n`);
  const hasCurrent = current !== undefined && current !== null && String(current).length > 0;
  if (hasCurrent) {
    const sensitive = configEntrySensitive(key, entry);
    process.stderr.write(`Current: ${sensitive ? "REDACTED" : stringifyConfigValue(current)}\n`);
    process.stderr.write("Value (Enter to keep): ");
  } else {
    process.stderr.write("Value: ");
  }
  const input = readPromptLine(hasCurrent && configEntrySensitive(key, entry));
  if (input.length === 0 && hasCurrent) {
    return current;
  }
  return input.length > 0 ? input : undefined;
}

function promptMissingRequired(program: CliProgram): Record<string, unknown> {
  const appConfig = program.appConfig;
  const updates: Record<string, unknown> = {};
  if (!appConfig) {
    return updates;
  }
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const { resolved } = bootstrapAppConfig(program, { validateFile: false });
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (!configEntryRequired(key, entry, fromSchema)) {
      continue;
    }
    const current = resolved[key];
    if (current !== undefined && current !== null && String(current).length > 0) {
      continue;
    }
    const value = promptConfigKey(key, entry, undefined, false, fromSchema);
    if (value !== undefined && String(value).length > 0) {
      updates[key] = value;
    }
  }
  return updates;
}

/** Interactive `install --configure`. */
export function runInstallConfigure(program: CliProgram): { path: string; changed: boolean } {
  if (!program.appConfig) {
    throw new Error("install --configure requires program.appConfig on the program root.");
  }
  if (!process.stdin.isTTY) {
    const { resolved } = bootstrapAppConfig(program, { validateFile: false });
    const missing = missingRequiredConfig(program, resolved);
    if (missing.length > 0) {
      process.stderr.write(`${formatMissingConfigMessage(program, missing)}\n`);
    } else {
      process.stderr.write("install --configure requires an interactive terminal.\n");
    }
    process.exit(1);
  }

  const path = resolveAppConfigPath(program);
  const existing = readAppConfigFileRaw(path);
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const { resolved } = bootstrapAppConfig(program, { validateFile: false });
  const next: Record<string, unknown> = { ...existing };
  let changed = false;

  for (const [key, entry] of Object.entries(program.appConfig.entries)) {
    const current = resolved[key];
    const before = next[key];
    const value = promptConfigKey(key, entry, current, true, fromSchema);
    if (value !== undefined && String(value).length > 0) {
      if (JSON.stringify(value) !== JSON.stringify(before)) {
        changed = true;
      }
      next[key] = value;
    }
  }

  if (changed) {
    writeAppConfigFile(program, next);
    const updated = resolveAppConfig(program, next);
    exportConfigToEnv(program, updated);
    return { path, changed: true };
  }
  return { path, changed: false };
}

/** Config status for install --status (values never included). */
export function appConfigStatus(program: CliProgram):
  | {
      path: string;
      exists: boolean;
      required: Array<{ key: string; set: boolean }>;
    }
  | undefined {
  if (!program.appConfig) {
    return undefined;
  }
  const path = resolveAppConfigPath(program);
  let fileData: Record<string, unknown> = {};
  try {
    fileData = readAppConfigFile(program);
  } catch {
    fileData = readAppConfigFileRaw(path);
  }
  const resolved = resolveAppConfig(program, fileData);
  exportConfigToEnv(program, resolved);
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const required = Object.entries(program.appConfig.entries)
    .filter(([key, entry]) => configEntryRequired(key, entry, fromSchema))
    .map(([key]) => ({
      key,
      set:
        resolved[key] !== undefined && resolved[key] !== null && String(resolved[key]).length > 0,
    }));
  return { path, exists: existsSync(path), required };
}

/** Loads config, optionally prompts, and enforces required keys. */
export function ensureAppConfig(
  program: CliProgram,
  opts: EnsureAppConfigOpts,
): ConfigBootstrapResult | undefined {
  if (!program.appConfig) {
    return undefined;
  }

  let fileData: Record<string, unknown>;
  try {
    fileData = readAppConfigFile(program);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  }

  let resolved = resolveAppConfig(program, fileData);
  exportConfigToEnv(program, resolved);

  if (opts.interactive && process.stdin.isTTY) {
    if (opts.configure) {
      runInstallConfigure(program);
      fileData = readAppConfigFileRaw(resolveAppConfigPath(program));
      resolved = resolveAppConfig(program, fileData);
      exportConfigToEnv(program, resolved);
      return { fileData, resolved };
    }
    const updates = promptMissingRequired(program);
    if (Object.keys(updates).length > 0) {
      const merged = { ...fileData, ...updates };
      writeAppConfigFile(program, merged);
      fileData = merged;
      resolved = resolveAppConfig(program, fileData);
      exportConfigToEnv(program, resolved);
    }
  }

  const missing = missingRequiredConfig(program, resolved);
  if (missing.length === 0) {
    return { fileData, resolved };
  }

  if (opts.exitOnMissing) {
    process.stderr.write(`${formatMissingConfigMessage(program, missing)}\n`);
    process.exit(1);
  }

  return { fileData, resolved };
}

export { displayAppConfigPath };

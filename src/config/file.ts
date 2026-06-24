/*
JSON app config file path helpers and strict read/write.
*/

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sanitizeToolSegment } from "../mcp/tools.ts";
import { appConfigHome, expandTilde } from "../paths/host.ts";
import type { CliProgram } from "../types.ts";
import { effectiveJsonSchema } from "./schema.ts";
import { validateConfigDocument } from "./validate.ts";

export type AppConfigFileData = Record<string, unknown>;

/** Resolved absolute path to the app JSON config file. */
export function resolveAppConfigPath(program: CliProgram): string {
  const custom = program.appConfig?.path;
  if (custom) {
    return expandTilde(custom);
  }
  const dirName = sanitizeToolSegment(program.key);
  return join(appConfigHome(), dirName, "config");
}

/** Human-readable config path for error messages (`~` when under home). */
export function displayAppConfigPath(program: CliProgram): string {
  const resolved = resolveAppConfigPath(program);
  const home = process.env.HOME ?? "";
  if (home.length > 0 && resolved.startsWith(home)) {
    return `~${resolved.slice(home.length)}`;
  }
  return resolved;
}

function parseConfigJson(text: string, path: string): AppConfigFileData {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("root must be a JSON object");
    }
    return parsed as AppConfigFileData;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in config file ${path}: ${msg}`);
  }
}

/** Read config file; returns `{}` when missing. Does not validate. */
export function readAppConfigFileRaw(path: string): AppConfigFileData {
  if (!existsSync(path)) {
    return {};
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read config file ${path}: ${msg}`);
  }
  return parseConfigJson(text, path);
}

/** Read and validate config file against program schema. */
export function readAppConfigFile(program: CliProgram): AppConfigFileData {
  const path = resolveAppConfigPath(program);
  const data = readAppConfigFileRaw(path);
  if (Object.keys(data).length === 0) {
    return data;
  }
  validateAppConfigData(program, data, path);
  return data;
}

/** Validate in-memory config data; throws on failure. */
export function validateAppConfigData(
  program: CliProgram,
  data: AppConfigFileData,
  pathLabel?: string,
): void {
  const appConfig = program.appConfig;
  if (!appConfig) {
    throw new Error("program.appConfig is not set");
  }
  const allowed = new Set(Object.keys(appConfig.entries));
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) {
      const where = pathLabel ?? "config";
      throw new Error(`Unknown config key '${key}' in ${where}`);
    }
  }
  const jsonSchema = effectiveJsonSchema(program);
  if (!jsonSchema) {
    return;
  }
  const result = validateConfigDocument(data, jsonSchema);
  if (!result.valid) {
    const where = pathLabel ?? "config";
    throw new Error(`Invalid config in ${where}: ${result.errors.join("; ")}`);
  }
}

/** Merge-write schema keys to the config file (`0o600`). */
export function writeAppConfigFile(program: CliProgram, data: AppConfigFileData): void {
  validateAppConfigData(program, data, displayAppConfigPath(program));
  const path = resolveAppConfigPath(program);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

/** Removes the app config file when present. Returns true if removed. */
export function uninstallAppConfig(program: CliProgram, dry: boolean): boolean {
  const path = resolveAppConfigPath(program);
  if (!existsSync(path)) {
    return false;
  }
  if (!dry) {
    unlinkSync(path);
  }
  return true;
}

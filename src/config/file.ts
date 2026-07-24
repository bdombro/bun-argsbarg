/*
JSON app config file path helpers and strict read/write.
*/

import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CliProgram } from "~/core/types.ts";
import { sanitizeToolSegment } from "~/mcp/tools.ts";
import { appConfigLibHome, displayHomePath } from "~/paths/host.ts";
import { isFrameworkConfigKey, validateBindingsShape } from "./bindings.ts";
import { effectiveJsonSchema } from "./schema.ts";
import { validateConfigDocument, validateConfigDocumentPartial } from "./validate.ts";

export type AppConfigFileData = Record<string, unknown>;

/** Resolved absolute path to the app JSON config file (`~/.local/lib/<key>/config.json`). */
export function resolveAppConfigPath(program: CliProgram): string {
  const dirName = sanitizeToolSegment(program.key);
  return join(appConfigLibHome(), dirName, "config.json");
}

/** Resolved absolute directory containing the app JSON config file. */
export function resolveAppConfigDir(program: CliProgram): string {
  return dirname(resolveAppConfigPath(program));
}

/** Human-readable config path for error messages (`~/…` when under home). */
export function displayAppConfigPath(program: CliProgram): string {
  return displayHomePath(resolveAppConfigPath(program));
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
    throw new Error(`Invalid JSON in config file ${displayHomePath(path)}: ${msg}`);
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
    throw new Error(`Could not read config file ${displayHomePath(path)}: ${msg}`);
  }
  return parseConfigJson(text, path);
}

function isEmptyConfigDocument(data: AppConfigFileData): boolean {
  return Object.keys(data).every((k) => isFrameworkConfigKey(k));
}

/** True when `config.json` exists on disk. */
export function appConfigFileExists(program: CliProgram): boolean {
  return existsSync(resolveAppConfigPath(program));
}

/** Validate in-memory config data; throws on failure. */
export function validateAppConfigData(
  program: CliProgram,
  data: AppConfigFileData,
  pathLabel?: string,
  opts: { partial?: boolean } = {},
): void {
  const appConfig = program.appConfig;
  if (!appConfig) {
    throw new Error("program.appConfig is not set");
  }
  const where = pathLabel ? displayHomePath(pathLabel) : "config";
  const bindingErrors = validateBindingsShape(data);
  if (bindingErrors.length > 0) {
    throw new Error(`Invalid config in ${where}: ${bindingErrors.join("; ")}`);
  }
  const allowed = new Set(Object.keys(appConfig.entries));
  for (const key of Object.keys(data)) {
    if (isFrameworkConfigKey(key)) continue;
    if (!allowed.has(key)) {
      throw new Error(`Unknown config key '${key}' in ${where}`);
    }
  }
  const jsonSchema = effectiveJsonSchema(program);
  if (!jsonSchema) {
    return;
  }
  if (opts.partial || isEmptyConfigDocument(data)) {
    const result = validateConfigDocumentPartial(data, jsonSchema);
    if (!result.valid) {
      throw new Error(`Invalid config in ${where}: ${result.errors.join("; ")}`);
    }
    return;
  }
  const result = validateConfigDocument(data, jsonSchema);
  if (!result.valid) {
    throw new Error(`Invalid config in ${where}: ${result.errors.join("; ")}`);
  }
}

/** Write JSON to the config path without schema validation (`0o600`). */
export function writeAppConfigFileRaw(program: CliProgram, data: AppConfigFileData, dry = false): void {
  const path = resolveAppConfigPath(program);
  if (dry) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

/** Create `config.json` as `{}` when missing; returns absolute path if created. */
export function ensureAppConfigFile(program: CliProgram, dry = false): string | null {
  const path = resolveAppConfigPath(program);
  if (existsSync(path)) {
    return null;
  }
  writeAppConfigFileRaw(program, {}, dry);
  return path;
}

/** Read and validate config file against program schema. */
export function readAppConfigFile(program: CliProgram): AppConfigFileData {
  const path = resolveAppConfigPath(program);
  const data = readAppConfigFileRaw(path);
  if (isEmptyConfigDocument(data)) {
    return data;
  }
  validateAppConfigData(program, data, path);
  return data;
}

/** Merge-write schema keys to the config file (`0o600`). */
export function writeAppConfigFile(
  program: CliProgram,
  data: AppConfigFileData,
  opts: { partial?: boolean } = {},
): void {
  validateAppConfigData(program, data, displayAppConfigPath(program), opts);
  writeAppConfigFileRaw(program, data);
}

/** True when the app config file is present. */
export function appConfigInstalled(program: CliProgram): boolean {
  return appConfigFileExists(program);
}

/** Removes the app config file and config directory when present. */
export function uninstallAppConfig(program: CliProgram, dry: boolean): string[] {
  const path = resolveAppConfigPath(program);
  const dir = resolveAppConfigDir(program);
  const hasFile = existsSync(path);
  const hasDir = existsSync(dir);

  if (!hasFile && !hasDir) {
    return [];
  }

  const changed: string[] = [];
  if (hasFile) changed.push(path);
  if (hasDir) changed.push(`${dir}/`);

  if (!dry) {
    if (hasFile) unlinkSync(path);
    if (hasDir) rmSync(dir, { recursive: true, force: true });
  }
  return changed;
}

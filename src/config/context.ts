/*
Handler-facing resolved app config snapshot (ctx.appConfig).
*/

import type { CliProgram } from "../core/types.ts";
import { isFrameworkConfigKey, setBinding } from "./bindings.ts";
import {
  readAppConfigFileRaw,
  resolveAppConfigDir,
  resolveAppConfigPath,
  writeAppConfigFile,
  writeAppConfigFileRaw,
} from "./file.ts";
import type { ResolvedConfig } from "./resolve.ts";
import { captureMappedHostEnv, exportConfigToEnv, resolveAppConfig } from "./resolve.ts";
import { configPropertySchema, effectiveJsonSchema } from "./schema.ts";
import { validateParsedConfigValue } from "./validate.ts";

function rebuildResolved(program: CliProgram, fileData: Record<string, unknown>): ResolvedConfig {
  const hostEnv = captureMappedHostEnv(program);
  const resolved = resolveAppConfig(program, fileData, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);
  return resolved;
}

/** Empty snapshot when program.appConfig is not set. */
export class EmptyAppConfigSnapshot {
  private fileData: Record<string, unknown>;

  constructor(
    private readonly program: CliProgram,
    fileData?: Record<string, unknown>,
  ) {
    this.fileData = fileData ?? readAppConfigFileRaw(resolveAppConfigPath(program));
  }

  get(_key: string): undefined {
    return undefined;
  }

  require(key: string): never {
    throw new Error(`Configuration key '${key}' is not available (program.appConfig is not set)`);
  }

  set(_key: string, _value: unknown): void {
    throw new Error("program.appConfig is not set");
  }

  read(): ResolvedConfig {
    return {};
  }

  readUnsafe(): Record<string, unknown> {
    return { ...this.fileData };
  }

  getUnsafe(key: string): unknown {
    return this.fileData[key];
  }

  setUnsafe(key: string, value: unknown): void {
    const next = { ...this.fileData, [key]: value };
    writeAppConfigFileRaw(this.program, next);
    this.fileData = next;
  }

  /** Resolved absolute path to the app JSON config file (OS default from `program.key`). */
  get path(): string {
    return resolveAppConfigPath(this.program);
  }

  /** Resolved absolute directory containing the config file. */
  get dir(): string {
    return resolveAppConfigDir(this.program);
  }
}

/** Resolved config for handlers with program.appConfig set. */
export class AppConfigSnapshot {
  private snapshot: ResolvedConfig;
  private fileData: Record<string, unknown>;

  constructor(
    private readonly program: CliProgram,
    fileData: Record<string, unknown>,
    resolved: ResolvedConfig,
  ) {
    this.fileData = { ...fileData };
    this.snapshot = { ...resolved };
  }

  get(key: string): unknown {
    this.assertEntryKey(key);
    return this.snapshot[key];
  }

  require(key: string): unknown {
    const value = this.get(key);
    if (value === undefined || value === null || (typeof value === "string" && value.length === 0)) {
      throw new Error(`Missing required configuration: ${key}`);
    }
    return value;
  }

  set(key: string, value: unknown): void {
    this.assertEntryKey(key);
    const jsonSchema = effectiveJsonSchema(this.program);
    if (!jsonSchema) {
      throw new Error("Internal error: missing effective jsonSchema.");
    }
    const propSchema = configPropertySchema(jsonSchema, key);
    validateParsedConfigValue(value, propSchema, jsonSchema);
    const next = setBinding({ ...this.fileData, [key]: value }, key, "file");
    this.persistFileData(next);
  }

  read(): ResolvedConfig {
    return { ...this.snapshot };
  }

  readUnsafe(): Record<string, unknown> {
    return { ...this.fileData };
  }

  getUnsafe(key: string): unknown {
    return this.fileData[key];
  }

  setUnsafe(key: string, value: unknown): void {
    this.assertUnsafeKey(key);
    const next = { ...this.fileData, [key]: value };
    this.persistFileData(next);
  }

  /** Resolved absolute path to the app JSON config file (`~/.local/lib/<key>/config.json`). */
  get path(): string {
    return resolveAppConfigPath(this.program);
  }

  /** Resolved absolute directory containing the config file. */
  get dir(): string {
    return resolveAppConfigDir(this.program);
  }

  /** Replace snapshot after external bootstrap (internal). */
  refresh(fileData: Record<string, unknown>, resolved: ResolvedConfig): void {
    this.fileData = { ...fileData };
    this.snapshot = { ...resolved };
  }

  private persistFileData(next: Record<string, unknown>): void {
    writeAppConfigFile(this.program, next, { partial: true });
    this.fileData = next;
    this.snapshot = rebuildResolved(this.program, next);
  }

  private assertEntryKey(key: string): void {
    const entries = this.program.appConfig?.entries;
    if (!entries || !(key in entries)) {
      throw new Error(`Unknown configuration key: ${key}`);
    }
  }

  private assertUnsafeKey(key: string): void {
    if (isFrameworkConfigKey(key)) return;
    this.assertEntryKey(key);
  }
}

export type AnyAppConfigSnapshot = AppConfigSnapshot | EmptyAppConfigSnapshot;

export function createAppConfigSnapshot(
  program: CliProgram,
  fileData: Record<string, unknown>,
  resolved: ResolvedConfig,
): AnyAppConfigSnapshot {
  if (!program.appConfig) {
    return new EmptyAppConfigSnapshot(program, fileData);
  }
  return new AppConfigSnapshot(program, fileData, resolved);
}

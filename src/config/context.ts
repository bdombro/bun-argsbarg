/*
Handler-facing resolved app config snapshot (ctx.appConfig).
*/

import type { CliProgram } from "../types.ts";
import { resolveAppConfigDir, resolveAppConfigPath, writeAppConfigFile } from "./file.ts";
import type { ResolvedConfig } from "./resolve.ts";
import { exportConfigToEnv, resolveAppConfig } from "./resolve.ts";

/** Empty snapshot when program.appConfig is not set. */
export class EmptyAppConfigSnapshot {
  constructor(private readonly program: CliProgram) {}

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
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.length === 0)
    ) {
      throw new Error(`Missing required configuration: ${key}`);
    }
    return value;
  }

  set(key: string, value: unknown): void {
    this.assertEntryKey(key);
    const next = { ...this.fileData, [key]: value };
    writeAppConfigFile(this.program, next);
    this.fileData = next;
    this.snapshot = resolveAppConfig(this.program, next);
    exportConfigToEnv(this.program, this.snapshot);
  }

  read(): ResolvedConfig {
    return { ...this.snapshot };
  }

  /** Resolved absolute path to the app JSON config file (honors `program.appConfig.path` or OS default). */
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

  private assertEntryKey(key: string): void {
    const entries = this.program.appConfig?.entries;
    if (!entries || !(key in entries)) {
      throw new Error(`Unknown configuration key: ${key}`);
    }
  }
}

export type AnyAppConfigSnapshot = AppConfigSnapshot | EmptyAppConfigSnapshot;

export function createAppConfigSnapshot(
  program: CliProgram,
  fileData: Record<string, unknown>,
  resolved: ResolvedConfig,
): AnyAppConfigSnapshot {
  if (!program.appConfig) {
    return new EmptyAppConfigSnapshot(program);
  }
  return new AppConfigSnapshot(program, fileData, resolved);
}

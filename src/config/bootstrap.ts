/*
Loads the app config file, runs setup prompts when needed, and checks that required
settings are present before the CLI or MCP server handles a request.
*/

import { readSync } from "node:fs";
import type { CliAppConfigEntry, CliProgram, ServerRuntime } from "../core/types.ts";
import type { LogEmitter } from "../log/emitter.ts";
import { readPromptLine as readStdinLine } from "../prompt.ts";
import { bindingForKey, clearFileValue, isKeyAddressed, readBindings, setBinding } from "./bindings.ts";
import { configEntryRequired, configEntrySensitive, defaultConfigEntryTitle, jsonSchemaRequiredKeys } from "./entry.ts";
import {
  appConfigFileExists,
  displayAppConfigPath,
  readAppConfigFile,
  readAppConfigFileRaw,
  resolveAppConfigPath,
  writeAppConfigFile,
} from "./file.ts";
import type { ResolvedConfig } from "./resolve.ts";
import {
  captureMappedHostEnv,
  exportConfigToEnv,
  formatMissingConfigMessage,
  missingRequiredConfig,
  resolveAppConfig,
  stringifyConfigValue,
} from "./resolve.ts";
import { configPropertySchema, effectiveJsonSchema } from "./schema.ts";
import { configValueInputHint, parseConfigSetValue } from "./validate.ts";

export { displayAppConfigPath } from "./file.ts";

/** Tells ensureAppConfig whether to prompt the user and how strictly to require settings. */
export interface EnsureAppConfigOpts {
  /** In a terminal, ask for any required settings that are still empty (or run the full configure wizard). */
  interactive: boolean;
  /** Stop the program with an error if required settings are still missing after loading. */
  exitOnMissing: boolean;
  /** With `interactive`, walk through every setting instead of only the missing required ones. */
  configure?: boolean;
}

/** Config as read from disk, plus the final values after env vars and defaults are applied. */
export interface ConfigBootstrapResult {
  /** Key/value pairs stored in the config file. */
  fileData: Record<string, unknown>;
  /** Effective values the app will use (file, defaults, and shell env combined). */
  resolved: ResolvedConfig;
}

/** Options for {@link bootstrapAppConfig}. */
export interface BootstrapAppConfigOpts {
  /** `true` = strict validate; `false` = raw read; `"soft"` = validate, log, store error in runtime.state. */
  validateFile: boolean | "soft";
  runtime?: ServerRuntime;
  emitter?: LogEmitter;
}

/** Read the config file, merge env overrides, and export mapped values into `process.env`. */
export function bootstrapAppConfig(program: CliProgram, opts: BootstrapAppConfigOpts): ConfigBootstrapResult {
  let fileData: Record<string, unknown>;
  if (opts.validateFile === true) {
    fileData = readAppConfigFile(program);
  } else if (opts.validateFile === "soft") {
    try {
      fileData = readAppConfigFile(program);
      if (opts.runtime) {
        delete opts.runtime.state.configFileError;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fileData = readAppConfigFileRaw(resolveAppConfigPath(program));
      if (opts.runtime) {
        opts.runtime.state.configFileError = message;
      }
      opts.emitter?.emit({
        level: "warn",
        message,
        action: "config.invalid",
      });
    }
  } else {
    fileData = readAppConfigFileRaw(resolveAppConfigPath(program));
  }
  const hostEnv = captureMappedHostEnv(program);
  const resolved = resolveAppConfig(program, fileData, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);
  return { fileData, resolved };
}

/** Read a line from the terminal without showing what the user types (for tokens and passwords). */
function readSensitiveLine(): string {
  const stdin = process.stdin;
  const canRaw = stdin.isTTY && typeof stdin.setRawMode === "function";
  const wasRaw = canRaw && stdin.isRaw;
  if (canRaw) {
    try {
      stdin.setRawMode(true);
    } catch {
      // Best-effort: read still works if raw mode is unavailable.
    }
  }
  try {
    let result = "";
    const buf = Buffer.alloc(1);
    while (true) {
      const n = readSync(0, buf, { length: 1 });
      if (n <= 0) {
        break;
      }
      const byte = buf[0];
      if (byte === 3) {
        process.stderr.write("\n");
        process.exit(130);
      }
      if (byte === 4) {
        break;
      }
      if (byte === 10 || byte === 13) {
        break;
      }
      if (byte === 127 || byte === 8) {
        if (result.length > 0) {
          result = result.slice(0, -1);
          process.stderr.write("\b \b");
        }
        continue;
      }
      result += String.fromCharCode(byte);
      process.stderr.write("*");
    }
    process.stderr.write("\n");
    return result;
  } finally {
    if (canRaw) {
      try {
        stdin.setRawMode(!!wasRaw);
      } catch {
        // Ignore restore failures.
      }
    }
  }
}

/** Read one line of user input; sensitive settings use a hidden prompt. */
function readPromptLine(mask: boolean): string {
  if (mask) {
    return readSensitiveLine();
  }
  return readStdinLine();
}

/** Whether this setting already has a non-empty value in the user's shell environment. */
function resolvedFromEnv(entry: CliAppConfigEntry, hostEnv: Record<string, string | undefined>): boolean {
  if (!entry.env) {
    return false;
  }
  const val = hostEnv[entry.env];
  return val !== undefined && val.length > 0;
}

/** Ask the user for one setting and return what they chose (or nothing if they skipped it). */
function promptConfigKey(
  key: string,
  entry: CliAppConfigEntry,
  current: unknown,
  configure: boolean,
  jsonSchemaRequired: Set<string> | undefined,
  hostEnv: Record<string, string | undefined>,
  jsonSchema: Record<string, unknown> | undefined,
): { value: unknown; userTyped: boolean } {
  const baseTitle = entry.title ?? defaultConfigEntryTitle(key);
  const titleWithEnv = entry.env ? `${baseTitle} (${entry.env})` : baseTitle;
  const required = configEntryRequired(key, entry, jsonSchemaRequired);
  const heading = required || !configure ? titleWithEnv : `${titleWithEnv} (optional)`;
  const propSchema = jsonSchema ? configPropertySchema(jsonSchema, key) : undefined;
  const valueHint = jsonSchema ? configValueInputHint(propSchema, jsonSchema) : undefined;
  const valueHintSuffix = valueHint ? ` (${valueHint})` : "";
  process.stderr.write(`${heading}\n`);
  process.stderr.write(`  ${entry.description}\n`);
  const hasCurrent = current !== undefined && current !== null && String(current).length > 0;
  const sensitive = configEntrySensitive(key, entry);
  if (hasCurrent) {
    process.stderr.write(`  Current: ${sensitive ? "REDACTED" : stringifyConfigValue(current)}\n`);
    const acceptPrompt = resolvedFromEnv(entry, hostEnv)
      ? `  Value (Enter to use env)${valueHintSuffix}: `
      : `  Value (Enter to keep)${valueHintSuffix}: `;
    process.stderr.write(acceptPrompt);
  } else {
    process.stderr.write(`  Value${valueHintSuffix}: `);
  }
  const input = readPromptLine(sensitive);
  if (input.length === 0 && hasCurrent) {
    return { value: current, userTyped: false };
  }
  if (input.length > 0) {
    const rootSchema = jsonSchema ?? { type: "object", properties: {} };
    const parsed = parseConfigSetValue(input, propSchema, rootSchema, false);
    return { value: parsed, userTyped: true };
  }
  return { value: undefined, userTyped: false };
}

/** Options for the interactive configure wizard (app config target). */
export interface RunInstallConfigureOpts {
  /** Where the wizard was started from (standalone command vs right after install). */
  context?: "standalone" | "after-install";
  /** When false, omit the "Configuration Setup" banner (e.g. inside interactive `configure`). */
  showHeading?: boolean;
  /** When true, prompt every entry (Enter keeps the current value). */
  rePromptAll?: boolean;
}

/** Print the "Configuration Setup" heading before the configure prompts. */
function writeConfigureSetupHeading(): void {
  process.stderr.write("\nConfiguration Setup\n\n");
}

/** Whether this app has any settings worth prompting during configure. */
function shouldShowConfigureSetupHeading(program: CliProgram): boolean {
  if (!program.appConfig) return false;
  return Object.keys(program.appConfig.entries).length > 0;
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.length === 0) return false;
  return true;
}

function bindingsDiffer(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(readBindings(a)) !== JSON.stringify(readBindings(b));
}

/** Whether the configure wizard should prompt for a config key. */
export function shouldWizardPromptConfigKey(
  key: string,
  fileData: Record<string, unknown>,
  entry: CliAppConfigEntry,
  resolved: Record<string, unknown>,
  opts: Pick<RunInstallConfigureOpts, "rePromptAll">,
): boolean {
  const bindings = readBindings(fileData);
  if (bindings[key] === "env" && !isPresent(resolved[key])) {
    return true;
  }
  if (opts.rePromptAll) {
    return true;
  }
  return !isKeyAddressed(key, fileData, entry);
}

/** Ask the user for each required setting that is still empty; returns updates to save to the config file. */
function promptMissingRequired(program: CliProgram): Record<string, unknown> {
  const appConfig = program.appConfig;
  const updates: Record<string, unknown> = {};
  if (!appConfig) {
    return updates;
  }
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const hostEnv = captureMappedHostEnv(program);
  const path = resolveAppConfigPath(program);
  const fileData = readAppConfigFileRaw(path);
  const resolved = resolveAppConfig(program, fileData, hostEnv);
  let headingWritten = false;
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (!configEntryRequired(key, entry, fromSchema)) {
      continue;
    }
    const bindings = readBindings(fileData);
    if (bindings[key] === "env" && !isPresent(resolved[key])) {
      // Re-prompt when env binding is broken.
    } else if (isKeyAddressed(key, fileData, entry) && isPresent(resolved[key])) {
      continue;
    }
    const current = resolved[key];
    if (!headingWritten) {
      writeConfigureSetupHeading();
      headingWritten = true;
    }
    const { value, userTyped } = promptConfigKey(key, entry, current, false, fromSchema, hostEnv, jsonSchema);
    if (userTyped && value !== undefined && String(value).length > 0) {
      updates[key] = value;
      Object.assign(updates, setBinding(updates, key, "file"));
    }
  }
  return updates;
}

/** Run the full interactive app config wizard (`configure`). */
export function runConfigure(
  program: CliProgram,
  opts: RunInstallConfigureOpts = {},
): { path: string; changed: boolean } {
  if (!program.appConfig) {
    throw new Error("configure requires program.appConfig on the program root.");
  }
  if (!process.stdin.isTTY) {
    const { resolved } = bootstrapAppConfig(program, { validateFile: false });
    const missing = missingRequiredConfig(program, resolved);
    if (missing.length > 0) {
      process.stderr.write(`${formatMissingConfigMessage(program, missing)}\n`);
    } else {
      process.stderr.write("configure requires an interactive terminal.\n");
    }
    process.exit(1);
  }

  const path = resolveAppConfigPath(program);
  const existing = readAppConfigFileRaw(path);
  const hostEnv = captureMappedHostEnv(program);
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const resolved = resolveAppConfig(program, existing, hostEnv);
  let next: Record<string, unknown> = { ...existing };
  let changed = false;

  if (opts.showHeading !== false && shouldShowConfigureSetupHeading(program)) {
    writeConfigureSetupHeading();
  }

  for (const [key, entry] of Object.entries(program.appConfig.entries)) {
    if (!shouldWizardPromptConfigKey(key, existing, entry, resolved, opts)) {
      continue;
    }

    const before = next[key];
    const bindingsBefore = readBindings(next);
    const current = resolved[key];
    const required = configEntryRequired(key, entry, fromSchema);
    const { value, userTyped } = promptConfigKey(key, entry, current, true, fromSchema, hostEnv, jsonSchema);

    if (userTyped && value !== undefined && String(value).length > 0) {
      if (JSON.stringify(value) !== JSON.stringify(before) || bindingsBefore[key] !== "file") {
        changed = true;
      }
      next = setBinding({ ...next, [key]: value }, key, "file");
      continue;
    }

    if (!userTyped && isPresent(current) && resolvedFromEnv(entry, hostEnv)) {
      const storedInFile =
        key in existing && existing[key] !== undefined && existing[key] !== null && String(existing[key]).length > 0;
      if (!storedInFile) {
        const withBinding = setBinding(clearFileValue(next, key), key, "env");
        if (bindingsDiffer(next, withBinding) || key in next) {
          changed = true;
        }
        next = withBinding;
      }
      continue;
    }

    if (!userTyped && !required && !isPresent(current) && inputWasSkipped(value, userTyped)) {
      const withBinding = setBinding(next, key, "skip");
      if (bindingsDiffer(next, withBinding)) {
        changed = true;
      }
      next = withBinding;
    }
  }

  if (changed) {
    writeAppConfigFile(program, next, { partial: true });
    const updated = resolveAppConfig(program, next, hostEnv);
    exportConfigToEnv(program, updated, hostEnv);
    return { path, changed: true };
  }
  return { path, changed: false };
}

function inputWasSkipped(value: unknown, userTyped: boolean): boolean {
  return !userTyped && (value === undefined || String(value).length === 0);
}

/** Summary for `configure --status`: config path, whether the file exists, and which required settings are set (never their values). */
export function appConfigStatus(program: CliProgram):
  | {
      path: string;
      exists: boolean;
      required: Array<{ key: string; set: boolean; binding?: "env" | "file" | "skip" | "missing" }>;
    }
  | undefined {
  if (!program.appConfig) {
    return undefined;
  }
  const path = displayAppConfigPath(program);
  let fileData: Record<string, unknown> = {};
  try {
    fileData = readAppConfigFile(program);
  } catch {
    fileData = readAppConfigFileRaw(resolveAppConfigPath(program));
  }
  const hostEnv = captureMappedHostEnv(program);
  const resolved = resolveAppConfig(program, fileData, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const required = Object.entries(program.appConfig.entries)
    .filter(([key, entry]) => configEntryRequired(key, entry, fromSchema))
    .map(([key]) => {
      const set = resolved[key] !== undefined && resolved[key] !== null && String(resolved[key]).length > 0;
      return {
        key,
        set,
        binding: bindingForKey(key, fileData, set),
      };
    });
  return { path, exists: appConfigFileExists(program), required };
}

/** Load config at startup, optionally prompt the user, and fail if required settings are still missing. */
export function ensureAppConfig(program: CliProgram, opts: EnsureAppConfigOpts): ConfigBootstrapResult | undefined {
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

  const hostEnv = captureMappedHostEnv(program);
  let resolved = resolveAppConfig(program, fileData, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);

  if (opts.interactive && process.stdin.isTTY) {
    if (opts.configure) {
      runConfigure(program, { context: "standalone", rePromptAll: true });
      fileData = readAppConfigFileRaw(resolveAppConfigPath(program));
      resolved = resolveAppConfig(program, fileData, hostEnv);
      exportConfigToEnv(program, resolved, hostEnv);
      return { fileData, resolved };
    }
    const updates = promptMissingRequired(program);
    if (Object.keys(updates).length > 0) {
      const merged = { ...fileData, ...updates };
      writeAppConfigFile(program, merged, { partial: true });
      fileData = merged;
      resolved = resolveAppConfig(program, fileData, hostEnv);
      exportConfigToEnv(program, resolved, hostEnv);
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

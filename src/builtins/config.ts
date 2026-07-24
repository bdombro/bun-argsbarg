/*
Built-in `configure get` / `configure set` subcommands.
*/

import { clearFileValue, setBinding } from "../config/bindings.ts";
import { bootstrapAppConfig } from "../config/bootstrap.ts";
import {
  configCommandsEnabled,
  configEntrySensitive,
  configMcpSetEnabled,
  defaultConfigEntryTitle,
} from "../config/entry.ts";
import { writeAppConfigFile } from "../config/file.ts";
import { captureMappedHostEnv, exportConfigToEnv, resolveAppConfig } from "../config/resolve.ts";
import { configPropertySchema, effectiveJsonSchema } from "../config/schema.ts";
import { parseConfigSetValue } from "../config/validate.ts";
import type { CliLeaf, CliOption, CliProgram } from "../core/types.ts";
import { CliOptionKind } from "../core/types.ts";

const JSON_OPTION: CliOption = {
  name: "json",
  description: "Emit JSON (compact).",
  kind: CliOptionKind.Presence,
};

const PRETTY_OPTION: CliOption = {
  name: "pretty",
  description: "Pretty-print JSON (requires --json).",
  kind: CliOptionKind.Presence,
};

function configGetOutput(program: CliProgram, key: string | undefined, json: boolean, pretty: boolean): void {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  const { resolved } = bootstrapAppConfig(program, { validateFile: true });
  const entries = appConfig.entries;

  if (key !== undefined) {
    if (!(key in entries)) {
      process.stderr.write(`Unknown configuration key: ${key}\n`);
      process.exit(1);
    }
    const entry = entries[key];
    if (!entry) {
      process.exit(1);
    }
    const value = resolved[key];
    if (json) {
      const out =
        configEntrySensitive(key, entry) && value !== undefined && String(value).length > 0
          ? { set: true }
          : (value ?? null);
      const space = pretty ? 2 : undefined;
      process.stdout.write(`${JSON.stringify(out, null, space)}\n`);
      return;
    }
    if (configEntrySensitive(key, entry)) {
      const set = value !== undefined && value !== null && String(value).length > 0;
      process.stdout.write(set ? "REDACTED\n" : "(not set)\n");
      return;
    }
    if (value === undefined) {
      process.stdout.write("(not set)\n");
      return;
    }
    if (typeof value === "object") {
      process.stdout.write(`${JSON.stringify(value)}\n`);
      return;
    }
    process.stdout.write(`${String(value)}\n`);
    return;
  }

  const out: Record<string, unknown> = {};
  for (const [k, entry] of Object.entries(entries)) {
    const value = resolved[k];
    if (configEntrySensitive(k, entry)) {
      out[k] =
        value !== undefined && value !== null && String(value).length > 0
          ? json
            ? { set: true }
            : "REDACTED"
          : json
            ? null
            : "(not set)";
    } else {
      out[k] = value ?? (json ? null : "(not set)");
    }
  }

  if (json) {
    const space = pretty ? 2 : undefined;
    process.stdout.write(`${JSON.stringify(out, null, space)}\n`);
    return;
  }

  for (const [k, v] of Object.entries(out)) {
    const title = entries[k]?.title ?? defaultConfigEntryTitle(k);
    process.stdout.write(`${title}: ${String(v)}\n`);
  }
}

const FROM_ENV_OPTION: CliOption = {
  name: "from-env",
  description: "Bind this key to its mapped environment variable (no literal value stored).",
  kind: CliOptionKind.Presence,
};

function configSetFromEnv(program: CliProgram, key: string): void {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  const entry = appConfig.entries[key];
  if (!entry?.env) {
    process.stderr.write(`Configuration key '${key}' has no env mapping for --from-env.\n`);
    process.exit(1);
  }
  const hostEnv = captureMappedHostEnv(program);
  const { fileData } = bootstrapAppConfig(program, { validateFile: true });
  let next = clearFileValue(fileData, key);
  next = setBinding(next, key, "env");
  writeAppConfigFile(program, next, { partial: true });
  const resolved = resolveAppConfig(program, next, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);
}

function configSetRun(program: CliProgram, key: string, rawValue: string, useJson: boolean): void {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  const entries = appConfig.entries;
  if (!(key in entries)) {
    process.stderr.write(`Unknown configuration key: ${key}\n`);
    process.exit(1);
  }

  const jsonSchema = effectiveJsonSchema(program);
  if (!jsonSchema) {
    process.stderr.write("Internal error: missing effective jsonSchema.\n");
    process.exit(1);
  }

  const propSchema = configPropertySchema(jsonSchema, key);
  let parsed: unknown;
  try {
    parsed = parseConfigSetValue(rawValue, propSchema, jsonSchema, useJson);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  }

  const hostEnv = captureMappedHostEnv(program);
  const { fileData } = bootstrapAppConfig(program, { validateFile: true });
  const next = setBinding({ ...fileData, [key]: parsed }, key, "file");
  writeAppConfigFile(program, next, { partial: true });
  const resolved = resolveAppConfig(program, next, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);
}

function configGetLeaf(program: CliProgram): CliLeaf {
  return {
    key: "get",
    description: "Print resolved configuration value(s).",
    options: [JSON_OPTION, PRETTY_OPTION],
    positionals: [
      {
        name: "key",
        description: "Schema key to read (omit for all keys).",
        kind: CliOptionKind.String,
        argMin: 0,
        argMax: 1,
      },
    ],
    handler: (ctx) => {
      const key = ctx.args[0];
      configGetOutput(program, key, ctx.hasFlag("json"), ctx.hasFlag("pretty"));
    },
  };
}

function configSetLeaf(program: CliProgram, mcpSetEnabled: boolean): CliLeaf {
  return {
    key: "set",
    description: "Write one configuration key to the config file.",
    options: [JSON_OPTION, FROM_ENV_OPTION],
    mcpTool: mcpSetEnabled ? undefined : { enabled: false },
    positionals: [
      {
        name: "key",
        description: "Schema key to write.",
        kind: CliOptionKind.String,
        argMin: 1,
        argMax: 1,
      },
      {
        name: "value",
        description:
          "Value to store (comma-separated or JSON for primitive arrays; --json for objects and nested arrays).",
        kind: CliOptionKind.String,
        argMin: 0,
        argMax: 1,
      },
    ],
    handler: (ctx) => {
      const key = ctx.args[0];
      if (!key) {
        process.stderr.write("configure set requires a key.\n");
        process.exit(1);
      }
      if (ctx.hasFlag("from-env")) {
        const raw = ctx.args[1];
        if (raw !== undefined && raw.length > 0) {
          process.stderr.write("configure set --from-env does not accept a value.\n");
          process.exit(1);
        }
        configSetFromEnv(program, key);
        return;
      }
      const raw = ctx.args[1];
      if (raw === undefined || raw.length === 0) {
        if (!ctx.hasFlag("json")) {
          process.stderr.write("configure set requires a value (or --from-env).\n");
          process.exit(1);
        }
        process.stderr.write("configure set requires a value.\n");
        process.exit(1);
      }
      configSetRun(program, key, raw, ctx.hasFlag("json"));
    },
  };
}

/** `configure get` / `configure set` leaves when app config commands are enabled. */
export function configureConfigSubcommands(
  program: CliProgram,
  mcpSetEnabled = configMcpSetEnabled(program),
): CliLeaf[] {
  if (!program.appConfig) {
    throw new Error("configure config subcommands require program.appConfig");
  }
  return [configGetLeaf(program), configSetLeaf(program, mcpSetEnabled)];
}

export { configCommandsEnabled };

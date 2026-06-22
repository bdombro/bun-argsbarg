import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CliProgram } from "../types.ts";
import { expectedMcpEntry } from "./mcp-config.ts";

export const OPENCODE_CONFIG_SCHEMA = "https://opencode.ai/config.json";

/** Global OpenCode config filenames, in precedence order (matches OpenCode). */
export const OPENCODE_CONFIG_FILENAMES = [
  "opencode.jsonc",
  "opencode.json",
  "config.json",
] as const;

export interface OpenCodeLocalMcpEntry {
  type: "local";
  command: string[];
  enabled?: boolean;
}

/** `~/.config/opencode` (or `$XDG_CONFIG_HOME/opencode`). */
export function opencodeConfigDir(home: string): string {
  const xdg = process.env.XDG_CONFIG_HOME ?? join(home, ".config");
  return join(xdg, "opencode");
}

/** True when OpenCode config directory exists. */
export function opencodePresent(home: string): boolean {
  return existsSync(opencodeConfigDir(home));
}

/** Path to write a new entry: first existing config file, else `config.json`. */
export function resolveOpenCodeConfigPathForInstall(home: string): string {
  const dir = opencodeConfigDir(home);
  for (const file of OPENCODE_CONFIG_FILENAMES) {
    const path = join(dir, file);
    if (existsSync(path)) return path;
  }
  return join(dir, "config.json");
}

/** First config file containing `mcp[name]`, if any. */
export function detectOpenCodeMcpConfigPath(home: string, name: string): string | undefined {
  const dir = opencodeConfigDir(home);
  for (const file of OPENCODE_CONFIG_FILENAMES) {
    const path = join(dir, file);
    if (openCodeMcpHasServer(path, name)) return path;
  }
  return undefined;
}

export function expectedOpenCodeMcpEntry(root: CliProgram): OpenCodeLocalMcpEntry {
  const entry = expectedMcpEntry(root);
  return { type: "local", command: [entry.command, ...entry.args], enabled: true };
}

function entriesEqual(a: OpenCodeLocalMcpEntry, b: OpenCodeLocalMcpEntry): boolean {
  return a.type === b.type && JSON.stringify(a.command) === JSON.stringify(b.command);
}

function readConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Could not parse OpenCode config at ${path} (JSON with comments is not supported by install --mcp). ` +
        `Add the server manually or use a .json config file.`,
    );
  }
}

/** Reads `mcp[name]` when it is a local stdio server. */
export function readOpenCodeMcpEntry(
  path: string,
  name: string,
): OpenCodeLocalMcpEntry | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const data = readConfig(path);
    const raw = (data.mcp as Record<string, unknown> | undefined)?.[name];
    if (!raw || typeof raw !== "object") return undefined;
    const entry = raw as { type?: string; command?: unknown };
    if (entry.type !== "local" || !Array.isArray(entry.command)) return undefined;
    if (!entry.command.every((p) => typeof p === "string")) return undefined;
    return {
      type: "local",
      command: entry.command as string[],
      enabled: (raw as { enabled?: boolean }).enabled,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Could not parse OpenCode")) throw err;
    return undefined;
  }
}

export function openCodeMcpHasServer(path: string, name: string): boolean {
  try {
    return readOpenCodeMcpEntry(path, name) !== undefined;
  } catch {
    return false;
  }
}

/** Returns an error when an existing OpenCode entry conflicts, or null if safe to merge. */
export function checkOpenCodeMcpConflict(
  path: string,
  name: string,
  expected: OpenCodeLocalMcpEntry,
  yes: boolean,
): string | null {
  const existing = readOpenCodeMcpEntry(path, name);
  if (existing && !entriesEqual(existing, expected) && !yes) {
    return (
      `MCP server "${name}" in ${path} differs from expected OpenCode entry.\n` +
      `  existing: ${JSON.stringify(existing)}\n` +
      `  expected: ${JSON.stringify(expected)}\n` +
      `Use --yes to overwrite.`
    );
  }
  return null;
}

/** Merges a local MCP entry into OpenCode `mcp` config. */
export function mergeOpenCodeMcpConfig(
  path: string,
  name: string,
  entry: OpenCodeLocalMcpEntry,
  dry: boolean,
): void {
  if (dry) return;
  const data = readConfig(path);
  if (!data.$schema) data.$schema = OPENCODE_CONFIG_SCHEMA;
  const servers = (data.mcp as Record<string, OpenCodeLocalMcpEntry> | undefined) ?? {};
  servers[name] = entry;
  data.mcp = servers;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** Removes `mcp[name]` from an OpenCode config file. */
export function removeOpenCodeMcpConfig(path: string, name: string, dry: boolean): void {
  if (dry || !existsSync(path)) return;
  const data = readConfig(path);
  const servers = data.mcp as Record<string, unknown> | undefined;
  if (!servers?.[name]) return;
  delete servers[name];
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

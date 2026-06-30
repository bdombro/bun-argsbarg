import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServerEntry } from "./mcp-config.ts";

/** True when the `openclaw` executable is on PATH. */
export function openclawOnPath(): boolean {
  return Bun.which("openclaw") !== null;
}

/** Global OpenClaw config path (`~/.openclaw/openclaw.json`). */
export function resolveOpenclawConfigPath(home: string): string {
  return join(home, ".openclaw", "openclaw.json");
}

function readOpenclawMcpEntry(path: string, name: string): McpServerEntry | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as {
      mcp?: { servers?: Record<string, { command?: string; args?: string[] }> };
    };
    const entry = data.mcp?.servers?.[name];
    if (!entry?.command) return undefined;
    return { command: entry.command, args: entry.args ?? [] };
  } catch {
    return undefined;
  }
}

export function openclawMcpHasServer(home: string, name: string): boolean {
  const path = resolveOpenclawConfigPath(home);
  if (!existsSync(path)) return false;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as {
      mcp?: { servers?: Record<string, unknown> };
    };
    return data.mcp?.servers?.[name] !== undefined;
  } catch {
    return false;
  }
}

function entriesEqual(a: McpServerEntry, b: McpServerEntry): boolean {
  return a.command === b.command && JSON.stringify(a.args) === JSON.stringify(b.args);
}

/** Returns an error when an existing OpenClaw entry conflicts, or null if safe to merge. */
export function checkOpenclawMcpConflict(
  home: string,
  name: string,
  expected: McpServerEntry,
  yes: boolean,
): string | null {
  const path = resolveOpenclawConfigPath(home);
  const existing = readOpenclawMcpEntry(path, name);
  if (existing && !entriesEqual(existing, expected) && !yes) {
    return (
      `MCP server "${name}" in ${path} differs from expected OpenClaw entry.\n` +
      `  existing: ${JSON.stringify(existing)}\n` +
      `  expected: ${JSON.stringify(expected)}\n` +
      `Use --yes to overwrite.`
    );
  }
  return null;
}

function runOpenclaw(args: string[]): void {
  const proc = Bun.spawnSync({
    cmd: ["openclaw", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    const err = new TextDecoder().decode(proc.stderr).trim();
    throw new Error(err || `openclaw ${args.join(" ")} failed (exit ${proc.exitCode})`);
  }
}

/** Registers a stdio MCP server via `openclaw mcp add`. */
export function mergeOpenclawMcpConfig(
  home: string,
  name: string,
  entry: McpServerEntry,
  dry: boolean,
  overwrite: boolean,
): string {
  const configPath = resolveOpenclawConfigPath(home);
  if (dry) return configPath;

  mkdirSync(join(home, ".openclaw"), { recursive: true });
  if (openclawMcpHasServer(home, name) && overwrite) {
    runOpenclaw(["mcp", "unset", name]);
  }

  const args = ["mcp", "add", name, "--command", entry.command];
  for (const arg of entry.args) {
    args.push("--arg", arg);
  }
  runOpenclaw(args);
  return configPath;
}

/** Removes an OpenClaw MCP server via `openclaw mcp unset`. */
export function removeOpenclawMcpConfig(home: string, name: string, dry: boolean): void {
  if (dry || !openclawMcpHasServer(home, name)) return;
  runOpenclaw(["mcp", "unset", name]);
}

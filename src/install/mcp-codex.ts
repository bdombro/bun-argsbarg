import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { McpServerEntry } from "./mcp-config.ts";

/** True when the `codex` executable is on PATH. */
export function codexOnPath(): boolean {
  return Bun.which("codex") !== null;
}

/** Global Codex config path (`~/.codex/config.toml`). */
export function resolveCodexConfigPath(home: string): string {
  return join(home, ".codex", "config.toml");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTomlStringArray(inner: string): string[] {
  const re = /"([^"]*)"/g;
  const out: string[] = [];
  let m = re.exec(inner);
  while (m !== null) {
    const value = m[1];
    if (value !== undefined) {
      out.push(value);
    }
    m = re.exec(inner);
  }
  return out;
}

/** Reads stdio `command`/`args` from a Codex `[mcp_servers.name]` block, if present. */
export function readCodexMcpEntry(path: string, name: string): McpServerEntry | undefined {
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8");
  const sectionRe = new RegExp(`^\\[mcp_servers\\.${escapeRegExp(name)}\\]\\s*$`, "m");
  const match = sectionRe.exec(text);
  if (!match) return undefined;

  const after = text.slice(match.index + match[0].length);
  const nextSection = after.search(/^\[/m);
  const block = nextSection === -1 ? after : after.slice(0, nextSection);

  const transport = block.match(/transport\s*=\s*\{[^}]*type\s*=\s*"stdio"[^}]*\}/s)?.[0];
  const search = transport ?? block;

  const cmd =
    search.match(/command\s*=\s*"([^"]*)"/)?.[1] ?? search.match(/command\s*=\s*'([^']*)'/)?.[1];
  if (!cmd) return undefined;

  const argsMatch = search.match(/args\s*=\s*\[([^\]]*)\]/s);
  const argsInner = argsMatch?.[1];
  const args = argsInner !== undefined ? parseTomlStringArray(argsInner) : [];
  return { command: cmd, args };
}

export function codexMcpHasServer(home: string, name: string): boolean {
  const path = resolveCodexConfigPath(home);
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf8");
  return new RegExp(`^\\[mcp_servers\\.${escapeRegExp(name)}\\]`, "m").test(text);
}

function entriesEqual(a: McpServerEntry, b: McpServerEntry): boolean {
  return a.command === b.command && JSON.stringify(a.args) === JSON.stringify(b.args);
}

/** Returns an error when an existing Codex entry conflicts, or null if safe to merge. */
export function checkCodexMcpConflict(
  home: string,
  name: string,
  expected: McpServerEntry,
  yes: boolean,
): string | null {
  const path = resolveCodexConfigPath(home);
  const existing = readCodexMcpEntry(path, name);
  if (existing && !entriesEqual(existing, expected) && !yes) {
    return (
      `MCP server "${name}" in ${path} differs from expected Codex entry.\n` +
      `  existing: ${JSON.stringify(existing)}\n` +
      `  expected: ${JSON.stringify(expected)}\n` +
      `Use --yes to overwrite.`
    );
  }
  return null;
}

function runCodex(args: string[]): void {
  const proc = Bun.spawnSync({
    cmd: ["codex", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    const err = new TextDecoder().decode(proc.stderr).trim();
    throw new Error(err || `codex ${args.join(" ")} failed (exit ${proc.exitCode})`);
  }
}

/** Registers a stdio MCP server via `codex mcp add`. */
export function mergeCodexMcpConfig(
  home: string,
  name: string,
  entry: McpServerEntry,
  dry: boolean,
  overwrite: boolean,
): string {
  const configPath = resolveCodexConfigPath(home);
  if (dry) return configPath;

  mkdirSync(dirname(configPath), { recursive: true });
  if (codexMcpHasServer(home, name) && overwrite) {
    runCodex(["mcp", "remove", name]);
  }

  runCodex(["mcp", "add", name, "--", entry.command, ...entry.args]);
  return configPath;
}

/** Removes a Codex MCP server via `codex mcp remove`. */
export function removeCodexMcpConfig(home: string, name: string, dry: boolean): void {
  if (dry || !codexMcpHasServer(home, name)) return;
  runCodex(["mcp", "remove", name]);
}

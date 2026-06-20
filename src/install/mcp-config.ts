import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CliProgram } from "../types.ts";
import { InstallPaths } from "./paths.ts";

export interface McpServerEntry {
  command: string;
  args: string[];
}

export function expectedMcpEntry(root: CliProgram): McpServerEntry {
  return { command: root.key, args: ["mcp"] };
}

function entriesEqual(a: McpServerEntry, b: McpServerEntry): boolean {
  return a.command === b.command && JSON.stringify(a.args) === JSON.stringify(b.args);
}

/** Reads mcpServers[name] from a JSON config file, or undefined. */
export function readMcpServerEntry(path: string, name: string): McpServerEntry | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as { mcpServers?: Record<string, McpServerEntry> };
    return data.mcpServers?.[name];
  } catch {
    return undefined;
  }
}

/** Returns an error message when existing entry conflicts, or null if safe to merge. */
export function checkMcpConflict(
  path: string,
  name: string,
  expected: McpServerEntry,
  yes: boolean,
): string | null {
  const existing = readMcpServerEntry(path, name);
  if (existing && !entriesEqual(existing, expected) && !yes) {
    return (
      `MCP server "${name}" in ${path} differs from expected entry.\n` +
      `  existing: ${JSON.stringify(existing)}\n` +
      `  expected: ${JSON.stringify(expected)}\n` +
      `Use --yes to overwrite.`
    );
  }
  return null;
}

/** Merges MCP server entry into config file. */
export function mergeMcpConfig(path: string, name: string, entry: McpServerEntry, dry: boolean): void {
  if (dry) return;
  let data: Record<string, unknown> = {};
  if (existsSync(path)) {
    data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  }
  const servers = (data.mcpServers as Record<string, McpServerEntry> | undefined) ?? {};
  servers[name] = entry;
  data.mcpServers = servers;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** Removes MCP server entry from config file (keeps file if other keys remain). */
export function removeMcpConfig(path: string, name: string, dry: boolean): void {
  if (dry || !existsSync(path)) return;
  const data = JSON.parse(readFileSync(path, "utf8")) as { mcpServers?: Record<string, unknown> };
  if (!data.mcpServers?.[name]) return;
  delete data.mcpServers[name];
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

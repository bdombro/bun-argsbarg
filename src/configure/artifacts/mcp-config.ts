import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CliProgram } from "../../core/types.ts";
import { displayHomePath } from "../../paths/host.ts";

export interface McpServerEntry {
  command: string;
  args: string[];
}

export type McpInstallResult = "installed" | "skipped-match" | "skipped-conflict";

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
    const data = JSON.parse(readFileSync(path, "utf8")) as {
      mcpServers?: Record<string, McpServerEntry>;
    };
    return data.mcpServers?.[name];
  } catch {
    return undefined;
  }
}

/** Installs MCP entry when missing; skips when matching; warns and skips on conflict. */
export function installMcpServerEntry(path: string, name: string, entry: McpServerEntry): McpInstallResult {
  const existing = readMcpServerEntry(path, name);
  if (existing) {
    if (entriesEqual(existing, entry)) {
      return "skipped-match";
    }
    process.stderr.write(
      `MCP server "${name}" in ${displayHomePath(path)} differs; leaving existing entry unchanged.\n`,
    );
    return "skipped-conflict";
  }
  mergeMcpConfig(path, name, entry, false);
  return "installed";
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
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** Removes MCP server entry from config file (keeps file if other keys remain). */
export function removeMcpConfig(path: string, name: string, dry: boolean): string[] {
  if (dry || !existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf8")) as { mcpServers?: Record<string, unknown> };
  if (!data.mcpServers?.[name]) return [];
  delete data.mcpServers[name];
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return [path];
}

import { defaultConfigEntryTitle } from "../config/entry.ts";
import { displayAppConfigPath } from "../config/file.ts";
import { expectedMcpEntry } from "../configure/artifacts/mcp-config.ts";
import { resolveClaudeDesktopMcpPath, userHome } from "../configure/artifacts/paths.ts";
import { CliOptionKind, type CliProgram } from "../core/types.ts";
import { collectMcpTools, leafWireOptions, type McpToolDef, mcpServerId, resolveMcpSchemaUri } from "../mcp/tools.ts";
import { resolveCapabilities } from "../runtime/capabilities.ts";
import { resolveDocsTopicResourceUri } from "./mcp-resources.ts";
import { docsEnabled, docsUserTopicKeys, resolveDocsConfig } from "./resolve.ts";

/** Extra manual client setup notes for generated `docs mcp`. */
function appendManualClientSetup(
  lines: string[],
  _root: CliProgram,
  serverId: string,
  entry: { command: string; args: string[] },
): void {
  const home = userHome();
  const claudeDesktopPath = resolveClaudeDesktopMcpPath(home);
  const mcpServersJson = JSON.stringify({ mcpServers: { [serverId]: entry } }, null, 2);

  lines.push(
    "### Manual client setup",
    "",
    "Many clients do not read `~/.agents/mcp.json` yet. Copy the `mcpServers` entry from that file, or paste:",
    "",
    "```json",
    mcpServersJson,
    "```",
    "",
    "| Client | Config file |",
    "| --- | --- |",
    "| **Cursor** | `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project) |",
    "| **Claude Code** | `~/.claude.json` under `mcpServers`, or project `.mcp.json` |",
    "| **Claude Desktop** | See platform paths below |",
    "",
    "Restart Cursor or reload MCP after editing. Restart Claude Desktop after config changes.",
    "",
    "Claude Desktop config paths:",
    "",
    "- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`",
    "- **Windows:** `%APPDATA%\\Claude\\claude_desktop_config.json`",
    "- **Linux:** `~/.config/Claude/claude_desktop_config.json`",
    "",
    `On this machine (macOS/Linux): \`${claudeDesktopPath}\``,
    "",
  );
}

/** Formats one exposed MCP tool for the auto-generated MCP guide. */
function formatToolLine(root: CliProgram, tool: McpToolDef): string {
  const cliPath = tool.path.length > 0 ? `${root.key} ${tool.path.join(" ")}` : root.key;
  let line = `- \`${cliPath}\` — ${tool.description}`;
  const opts = leafWireOptions(tool.leaf);
  const flags = opts.filter((o) => o.kind === CliOptionKind.Presence).map((o) => `--${o.name}`);
  if (flags.length > 0) {
    line += ` (flags: ${flags.join(", ")})`;
  }
  return line;
}

/** Generates the auto `docs mcp` markdown guide from schema and MCP config. */
export function generateMcpGuide(root: CliProgram): string {
  const tools = collectMcpTools(root);
  const schemaUri = resolveMcpSchemaUri(root);
  const serverId = mcpServerId(root);
  const mcp = root.mcpServer;
  if (!mcp) {
    throw new Error("MCP server not enabled");
  }
  const caps = resolveCapabilities(root);
  const entry = expectedMcpEntry(root);

  const lines: string[] = [
    `# MCP server (${root.key})`,
    "",
    `${root.key} exposes an MCP server with features similar to the CLI.`,
    "",
    "## Installation",
    "",
    "### `.agents` auto-install",
    "",
    "When `mcpServer.enabled` is set, `configure install` merges this server into `~/.agents/mcp.json` per the https://dotagentsprotocol.com.",
    "",
  ];

  if (caps.configure) {
    lines.push(`Install the CLI first so \`${root.key}\` is on your PATH (e.g. \`brew install ${root.key}\`).`, "");
  } else {
    lines.push(`The CLI binary \`${root.key}\` must already be on your PATH.`, "");
  }

  lines.push(
    "```bash",
    `${root.key} configure install`,
    "```",
    "",
    "Writes or updates `~/.agents/mcp.json` with a `mcpServers` entry for this app.",
    "",
  );

  appendManualClientSetup(lines, root, serverId, entry);

  lines.push(
    "### Manual `mcpServers` entry",
    "",
    "Same shape as in `~/.agents/mcp.json`:",
    "",
    "```json",
    JSON.stringify(
      {
        mcpServers: {
          [serverId]: entry,
        },
      },
      null,
      2,
    ),
    "```",
    "",
    "## Running directly",
    "",
    "Start the stdio MCP server without editing host config:",
    "",
    "```bash",
    `${root.key} mcp`,
    "```",
    "",
  );

  lines.push(
    "## Environment",
    "",
    "- **`shellEnv`** — on by default; captures login-shell environment at MCP startup (PATH, toolchain shims, exports). Opt out with `shellEnv: false`.",
    "",
  );

  if (root.appConfig?.entries && Object.keys(root.appConfig.entries).length > 0) {
    lines.push("## Configuration", "");
    lines.push(
      `Configure before first use in Cursor or Claude Desktop (MCP hosts are non-interactive): \`${root.key} configure\`.`,
      "",
      `Default config file: \`${displayAppConfigPath(root)}\` (flat JSON keys).`,
      "",
    );
    for (const [key, entryConfig] of Object.entries(root.appConfig.entries)) {
      const label = entryConfig.title ?? defaultConfigEntryTitle(key);
      const req = entryConfig.required === false ? "optional" : "required";
      const envNote = entryConfig.env ? ` → env \`${entryConfig.env}\`` : "";
      lines.push(`- **${label}** (\`${key}\`, ${req}${envNote}) — ${entryConfig.description}`);
    }
    lines.push(
      "",
      "Example:",
      "",
      "```typescript",
      "config: {",
      "  schema: {",
      '    apiToken: { description: "…", env: "API_TOKEN", sensitive: true },',
      "  },",
      "},",
      "```",
      "",
    );
  }

  lines.push(
    "## What agents get",
    "",
    "| Mechanism | Purpose |",
    "|-----------|---------|",
    "| `tools/list` | Callable tools for exposed leaf commands |",
    "| `tools/call` | Runs handlers headlessly; JSON stdout becomes `structuredContent` when valid |",
    `| Schema resource | \`${schemaUri}\` — same JSON as \`${root.key} docs cli-schema\` |`,
  );
  if (docsEnabled(root)) {
    const docs = resolveDocsConfig(root);
    for (const key of docsUserTopicKeys(docs)) {
      const uri = resolveDocsTopicResourceUri(root, key);
      lines.push(`| Docs topic \`${key}\` | \`${uri}\` — same markdown as \`${root.key} docs ${key}\` |`);
    }
  }
  lines.push("", "## Exposed tools", "");

  if (tools.length === 0) {
    lines.push("(No MCP tools exposed.)", "");
  } else {
    for (const tool of tools) {
      lines.push(formatToolLine(root, tool));
    }
    lines.push("");
  }

  lines.push(
    "## Tool arguments",
    "",
    "Arguments are a flat JSON object keyed by long option and positional names (hyphenated option names are valid keys).",
    `See \`${root.key} docs cli-schema\` or the schema resource for per-tool shapes.`,
    "",
    "Varargs positionals accept a JSON array of strings (not a comma-separated string).",
    "Options with `format: comma-list` accept a comma-separated string or JSON array.",
    "Options with a schema `default` are applied when omitted.",
    "",
    "## Protocol",
    "",
    "Stdio NDJSON JSON-RPC. Help and `docs cli-schema` are not available through tool calls.",
    `Run \`${root.key} docs\` for bundled user documentation.`,
    "",
  );

  return lines.join("\n");
}

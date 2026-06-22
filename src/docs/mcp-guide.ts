import { collectOptionDefs } from "../parse.ts";
import {
  collectMcpTools,
  mcpServerId,
  resolveMcpSchemaUri,
  type McpToolDef,
} from "../mcp/tools.ts";
import { type CliProgram, CliOptionKind } from "../types.ts";

/** Formats one exposed MCP tool for the auto-generated MCP guide. */
function formatToolLine(root: CliProgram, tool: McpToolDef): string {
  const cliPath = tool.path.length > 0 ? `${root.key} ${tool.path.join(" ")}` : root.key;
  let line = `- \`${cliPath}\` — ${tool.description}`;
  const opts = collectOptionDefs(root, tool.path);
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
  const mcp = root.mcpServer!;

  const lines: string[] = [
    `# MCP server (${root.key})`,
    "",
    `${root.key} exposes an MCP server with features similar to the CLI.`,
    "",
    "## Quick start",
    "",
    "```bash",
    `${root.key} mcp`,
    "```",
    "",
    "## Client setup",
    "",
    "### `install --mcp`",
    "",
    "```bash",
    `${root.key} install --mcp --yes`,
    "```",
    "",
    "Merges the server entry below into host config when each host is present:",
    "",
    "| Host | Config file |",
    "| --- | --- |",
    "| Cursor | `~/.cursor/mcp.json` (when `~/.cursor` exists) |",
    "| Claude Code | `~/.claude.json` |",
    "| Claude Desktop | `claude_desktop_config.json` (when Claude Desktop app data exists) |",
    "",
    "Claude Desktop paths by platform:",
    "",
    "- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`",
    "- **Windows:** `%APPDATA%\\Claude\\claude_desktop_config.json`",
    "- **Linux:** `~/.config/Claude/claude_desktop_config.json`",
    "",
    "Restart Claude Desktop after changing its config.",
    "",
    "### Manual entry",
    "",
    "Add under `mcpServers` in the host config:",
    "",
    "```json",
    JSON.stringify(
      {
        mcpServers: {
          [serverId]: {
            command: root.key,
            args: ["mcp"],
          },
        },
      },
      null,
      2,
    ),
    "```",
    "",
  ];

  if (mcp.shellEnv || mcp.envFile) {
    lines.push("## Environment", "");
    if (mcp.shellEnv) {
      lines.push(
        "- **`shellEnv`** — captures login-shell environment at MCP startup (PATH, toolchain shims, exports).",
      );
    }
    if (mcp.envFile) {
      lines.push(
        "- **`envFile`** — loads `" + mcp.envFile + "` after shell env (overrides for its keys).",
      );
    }
    lines.push("");
  }

  lines.push(
    "## What agents get",
    "",
    "| Mechanism | Purpose |",
    "|-----------|---------|",
    "| `tools/list` | Callable tools for exposed leaf commands |",
    "| `tools/call` | Runs handlers headlessly; JSON stdout becomes `structuredContent` when valid |",
    `| Schema resource | \`${schemaUri}\` — same JSON as \`${root.key} docs schema\` |`,
    "",
    "## Exposed tools",
    "",
  );

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
    `See \`${root.key} docs schema\` or the schema resource for per-tool shapes.`,
    "",
    "Varargs positionals accept a JSON array or a comma-separated string.",
    "",
    "## Protocol",
    "",
    "Stdio NDJSON JSON-RPC. Help and `docs schema` are not available through tool calls.",
    `Run \`${root.key} docs\` for bundled user documentation.`,
    "",
  );

  return lines.join("\n");
}

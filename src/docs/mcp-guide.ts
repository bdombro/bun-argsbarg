import { resolveCapabilities } from "../capabilities.ts";
import { defaultConfigEntryTitle } from "../config/entry.ts";
import { displayAppConfigPath } from "../config/file.ts";
import { expectedOpenCodeMcpEntry, OPENCODE_CONFIG_SCHEMA } from "../install/mcp-opencode.ts";
import {
  collectMcpTools,
  type McpToolDef,
  mcpServerId,
  resolveMcpSchemaUri,
} from "../mcp/tools.ts";
import { collectOptionDefs } from "../parse.ts";
import { CliOptionKind, type CliProgram } from "../types.ts";

/** Extra host notes for generated `docs mcp` (manual fallbacks and ChatGPT Connectors). */
function appendManualHostSetup(lines: string[], root: CliProgram, serverId: string): void {
  const openCodeEntry = expectedOpenCodeMcpEntry(root);

  lines.push(
    "| OpenCode | `~/.config/opencode/*` (when `~/.config/opencode` exists) |",
    "| OpenAI Codex | `~/.codex/config.toml` via `codex mcp add` (when `codex` is on PATH) |",
    "| ChatGPT desktop | `chatgpt_mcp_config.json` (when ChatGPT app data exists) |",
    "",
    "Claude Desktop paths by platform:",
    "",
    "- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`",
    "- **Windows:** `%APPDATA%\\Claude\\claude_desktop_config.json`",
    "- **Linux:** `~/.config/Claude/claude_desktop_config.json`",
    "",
    "ChatGPT desktop JSON (when auto-installed):",
    "",
    "- **macOS:** `~/Library/Application Support/ChatGPT/chatgpt_mcp_config.json`",
    "- **Windows:** `%APPDATA%\\OpenAI\\ChatGPT\\chatgpt_mcp_config.json`",
    "",
    "Restart Claude Desktop and ChatGPT desktop after changing their config files.",
    "",
    "### Manual fallbacks",
    "",
    "**OpenCode** (no `~/.config/opencode` yet):",
    "",
    "```json",
    JSON.stringify(
      {
        $schema: OPENCODE_CONFIG_SCHEMA,
        mcp: { [serverId]: openCodeEntry },
      },
      null,
      2,
    ),
    "```",
    "",
    "**Codex** (`codex` not on PATH):",
    "",
    "```toml",
    `[mcp_servers.${serverId}]`,
    `command = "${root.key}"`,
    'args = ["mcp"]',
    "```",
    "",
    `Or after installing Codex CLI: \`codex mcp add ${serverId} -- ${root.key} mcp\`.`,
    "",
    "### ChatGPT web (Connectors)",
    "",
    `OpenAI's documented path for **ChatGPT web/desktop** is **Settings → Connectors → Developer mode** with a **remote HTTPS MCP URL** — not local stdio. ChatGPT does not spawn \`${root.key} mcp\` directly.`,
    "",
    "For local stdio, bridge and tunnel, then register the HTTPS URL in Connectors:",
    "",
    `1. Expose \`${root.key} mcp\` over HTTP (e.g. \`mcp-remote\`).`,
    "2. Tunnel if needed (ngrok, Cloudflare Tunnel).",
    "3. Add the public URL as a custom connector.",
    "",
    "Desktop `chatgpt_mcp_config.json` is merged when the ChatGPT app is installed; support varies by build. Use Connectors when local JSON is absent or tools do not appear.",
    "",
  );
}

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
  const mcp = root.mcpServer;
  if (!mcp) {
    throw new Error("MCP server not enabled");
  }
  const caps = resolveCapabilities(root);

  const lines: string[] = [
    `# MCP server (${root.key})`,
    "",
    `${root.key} exposes an MCP server with features similar to the CLI.`,
    "",
    "## Installation",
    "",
    "### `install --mcp`",
    "",
  ];

  if (caps.install) {
    lines.push(
      `Install the CLI first so \`${root.key}\` is on your PATH (e.g. \`${root.key} install --bin --yes\` or \`install --all --yes\`). Host configs reference the binary by name.`,
      "",
    );
  } else {
    lines.push(
      `The CLI binary \`${root.key}\` must already be on your PATH. Host configs reference it by name.`,
      "",
    );
  }

  lines.push(
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
  );

  appendManualHostSetup(lines, root, serverId);

  lines.push(
    "### Manual `mcpServers` entry",
    "",
    "For Cursor, Claude, and ChatGPT desktop JSON configs, add under `mcpServers`:",
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
    "## Running directly",
    "",
    "Start the stdio MCP server without editing host config:",
    "",
    "```bash",
    `${root.key} mcp`,
    "```",
    "",
  );

  if (mcp.shellEnv) {
    lines.push("## Environment", "");
    lines.push(
      "- **`shellEnv`** — captures login-shell environment at MCP startup (PATH, toolchain shims, exports).",
    );
    lines.push("");
  }

  if (root.appConfig?.entries && Object.keys(root.appConfig.entries).length > 0) {
    lines.push("## Configuration", "");
    lines.push(
      `Configure before first use in Cursor or Claude Desktop (MCP hosts are non-interactive): \`${root.key} install --configure\`.`,
      "",
      `Default config file: \`${displayAppConfigPath(root)}\` (flat JSON keys).`,
      "",
    );
    for (const [key, entry] of Object.entries(root.appConfig.entries)) {
      const label = entry.title ?? defaultConfigEntryTitle(key);
      const req = entry.required === false ? "optional" : "required";
      const envNote = entry.env ? ` → env \`${entry.env}\`` : "";
      lines.push(`- **${label}** (\`${key}\`, ${req}${envNote}) — ${entry.description}`);
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
    "Varargs positionals accept a JSON array of strings (not a comma-separated string).",
    "Options with `format: comma-list` accept a comma-separated string or JSON array.",
    "Options with a schema `default` are applied when omitted.",
    "",
    "## Protocol",
    "",
    "Stdio NDJSON JSON-RPC. Help and `docs schema` are not available through tool calls.",
    `Run \`${root.key} docs\` for bundled user documentation.`,
    "",
  );

  return lines.join("\n");
}

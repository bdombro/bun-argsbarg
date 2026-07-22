import { resolveApiListenAddress } from "../api/server.ts";
import { defaultConfigEntryTitle } from "../config/entry.ts";
import { displayAppConfigPath } from "../config/file.ts";
import { collectMcpTools, type McpToolDef } from "../mcp/tools.ts";
import { collectOptionDefs } from "../parse.ts";
import { CliOptionKind, type CliProgram } from "../types.ts";

/** Formats one exposed tool for the auto-generated HTTP guide. */
function formatToolLine(root: CliProgram, tool: McpToolDef): string {
  const cliPath = tool.path.length > 0 ? `${root.key} ${tool.path.join(" ")}` : root.key;
  let line = `- \`${tool.apiName}\` (MCP: \`${tool.name}\`, CLI: \`${cliPath}\`) — ${tool.description}`;
  const opts = collectOptionDefs(root, tool.path);
  const flags = opts.filter((o) => o.kind === CliOptionKind.Presence).map((o) => `--${o.name}`);
  if (flags.length > 0) {
    line += ` (flags: ${flags.join(", ")})`;
  }
  return line;
}

/** Generates the auto `docs http` markdown guide from schema and API config. */
export function generateHttpGuide(root: CliProgram): string {
  const api = root.apiServer;
  if (!api) {
    throw new Error("HTTP API server not enabled");
  }

  const tools = collectMcpTools(root);
  const { hostname, port } = resolveApiListenAddress(root);
  const baseUrl = `http://${hostname}:${port}`;

  const lines: string[] = [
    `# HTTP API (${root.key})`,
    "",
    `${root.key} exposes the same callable tools over HTTP as MCP.`,
    "",
    "## Running",
    "",
    "```bash",
    `${root.key} api`,
    "```",
    "",
    `Listens on **${baseUrl}** by default (\`apiServer.host\` / \`apiServer.port\`).`,
    "",
    "Bind is localhost-only in v0 — use a reverse proxy for remote access.",
    "",
    "## Endpoints",
    "",
    "| Method | Path | Purpose |",
    "| --- | --- | --- |",
    "| `GET` | `/health` | Liveness check |",
    "| `GET` | `/openapi.json` | OpenAPI 3.1 document (tool paths and request shapes) |",
    "| `GET` | `/openapi-browser` | Interactive Scalar API reference |",
    "| `POST` | `/tools/:name` | Invoke with flat JSON args object in the body |",
    "| `OPTIONS` | `*` | CORS preflight |",
    "",
    "Replace `{tool-key}` below with a path segment from `openapi.json` (`paths` keys are `/tools/{tool-key}`). Match body keys to that tool's `requestBody` schema in the spec.",
    "",
    "## Examples",
    "",
    "```bash",
    `curl -s ${baseUrl}/health`,
    `curl -s ${baseUrl}/openapi.json`,
    `curl -s -X POST ${baseUrl}/tools/{tool-key} \\`,
    '  -H "content-type: application/json" \\',
    "  -d '{...}'",
    "```",
    "",
    "## Responses",
    "",
    "Success (`200`): raw response body (JSON object, string, or binary). No `{ ok, stdout }` envelope.",
    "",
    "Handlers must use `ctx.respond()` or return a value for API/MCP tool calls.",
    "",
    'Errors use `{ "error": "..." }` with `400`, `404`, `503`, or `500`.',
    "",
  ];

  if (root.appConfig?.entries && Object.keys(root.appConfig.entries).length > 0) {
    lines.push("## Configuration", "");
    lines.push(
      `Configure before first use: \`${root.key} configure\`.`,
      "",
      `Default config file: \`${displayAppConfigPath(root)}\`.`,
      "",
    );
    for (const [key, entry] of Object.entries(root.appConfig.entries)) {
      const label = entry.title ?? defaultConfigEntryTitle(key);
      const req = entry.required === false ? "optional" : "required";
      const envNote = entry.env ? ` → env \`${entry.env}\`` : "";
      lines.push(`- **${label}** (\`${key}\`, ${req}${envNote}) — ${entry.description}`);
    }
    lines.push("");
  }

  lines.push("## Exposed tools", "");

  if (tools.length === 0) {
    lines.push("(No tools exposed.)", "");
  } else {
    for (const tool of tools) {
      lines.push(formatToolLine(root, tool));
    }
    lines.push("");
  }

  lines.push(
    "## Tool arguments",
    "",
    "POST bodies are a flat JSON object keyed by long option and positional names (hyphenated option names are valid keys).",
    "",
    `For HTTP clients, use **\`GET /openapi.json\`** (or **\`GET /openapi-browser\`**) for per-tool request shapes — each \`POST /tools/{name}\` path has a \`requestBody\` schema.`,
    "",
    "Varargs positionals accept a JSON array of strings (not a comma-separated string).",
    "Options with `format: comma-list` accept a comma-separated string or JSON array.",
    "Options with a schema `default` are applied when omitted.",
    "",
    `Shell invocation reference: \`${root.key} docs api\`. Full CLI tree JSON: \`${root.key} docs cli-schema\`.`,
    "",
    "## OpenAPI",
    "",
    "The HTTP API is described in OpenAPI 3.1.",
    "",
    `- **Browse** — [${baseUrl}/openapi-browser](${baseUrl}/openapi-browser) (Scalar UI; loads \`/openapi.json\`)`,
    `- **Fetch** — \`curl -s ${baseUrl}/openapi.json\``,
    `- **Save offline** — \`${root.key} docs openapi --save\` → \`./docs/openapi.json\` (or \`just docgen\` in app repos)`,
    "",
    "Use the spec to discover tool names (`paths`) and request/response shapes before calling `POST /tools/:name`.",
    "",
  );

  return lines.join("\n");
}

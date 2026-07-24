import { defaultConfigEntryTitle } from "~/config/entry.ts";
import { displayAppConfigPath } from "~/config/file.ts";
import { collectOptionDefs } from "~/core/parse.ts";
import { CliOptionKind, type CliProgram } from "~/core/types.ts";
import { collectHttpRoutes } from "~/http/routes.ts";
import { resolveHttpListenAddress } from "~/http/server.ts";

/** Formats one HTTP route for the auto-generated HTTP guide. */
function formatRouteLine(root: CliProgram, route: ReturnType<typeof collectHttpRoutes>[number]): string {
  const cliPath = route.commandPath.join(" ");
  let line = `- \`${route.method} ${route.openApiPath}\` (CLI: \`${root.key} ${cliPath}\`) — ${route.leaf.description}`;
  const opts = collectOptionDefs(root, route.commandPath);
  const flags = opts.filter((o) => o.kind === CliOptionKind.Presence).map((o) => `--${o.name}`);
  if (flags.length > 0) {
    line += ` (flags: ${flags.join(", ")})`;
  }
  return line;
}

/** Generates the auto `docs http` markdown guide from schema and API config. */
export function generateHttpGuide(root: CliProgram): string {
  const api = root.httpServer;
  if (!api) {
    throw new Error("HTTP API server not enabled");
  }

  const routes = collectHttpRoutes(root);
  const { hostname, port } = resolveHttpListenAddress(root);
  const baseUrl = `http://${hostname}:${port}`;

  const lines: string[] = [
    `# HTTP API (${root.key})`,
    "",
    `${root.key} exposes user commands over HTTP REST routes derived from the CLI tree.`,
    "",
    "## Running",
    "",
    "```bash",
    `${root.key} http`,
    "```",
    "",
    `Listens on **${baseUrl}** by default (\`httpServer.host\` / \`httpServer.port\`).`,
    "",
    "Bind is localhost-only in v0 — use a reverse proxy for remote access.",
    "",
    "## Endpoints",
    "",
    "| Method | Path | Purpose |",
    "| --- | --- | --- |",
    "| `GET` | `/health` or `/health/live` | Liveness check |",
    "| `GET` | `/health/ready` | Readiness (config + `program.readiness`) |",
    "| `GET` | `/openapi.json` | OpenAPI 3.1 REST paths |",
    "| `GET` | `/openapi-browser` | Interactive Scalar API reference |",
    "| `*` | `/api/...` | Invoke user commands (method per route) |",
    "| `OPTIONS` | `*` | CORS preflight |",
    "",
    "Discover paths from `openapi.json` (`/api/...`). Query binds options; POST/PUT/PATCH body binds options and `inputSchema` fields.",
    "",
    "## Examples",
    "",
    "```bash",
    `curl -s ${baseUrl}/health`,
    `curl -s ${baseUrl}/health/ready`,
    `curl -s ${baseUrl}/openapi.json`,
    `curl -s ${baseUrl}/api/workspaces`,
    `curl -s -X POST ${baseUrl}/api/workspaces \\`,
    '  -H "content-type: application/json" \\',
    `  -d '{"name":"qa2"}'`,
    "```",
    "",
    "## Responses",
    "",
    "Success: status from handler → `http.successStatus` → method default (GET 200, POST 201, DELETE 204).",
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

  lines.push("## REST routes", "");

  if (routes.length === 0) {
    lines.push("(No routes exposed.)", "");
  } else {
    for (const route of routes) {
      lines.push(formatRouteLine(root, route));
    }
    lines.push("");
  }

  lines.push(
    "## Request bodies",
    "",
    "POST/PUT/PATCH bodies are a flat JSON object keyed by long option and positional names (hyphenated option names are valid keys).",
    "",
    `For HTTP clients, use **\`GET /openapi.json\`** (or **\`GET /openapi-browser\`**) for per-route request shapes.`,
    "",
    "Varargs positionals accept a JSON array of strings (not a comma-separated string).",
    "Options with `format: comma-list` accept a comma-separated string or JSON array.",
    "Options with a schema `default` are applied when omitted.",
    "",
    `Shell invocation reference: \`${root.key} docs cli\`. Full CLI tree JSON: \`${root.key} docs cli-schema\`.`,
    "",
    "## OpenAPI",
    "",
    "The HTTP API is described in OpenAPI 3.1.",
    "",
    `- **Browse** — [${baseUrl}/openapi-browser](${baseUrl}/openapi-browser) (Scalar UI; loads \`/openapi.json\`)`,
    `- **Fetch** — \`curl -s ${baseUrl}/openapi.json\``,
    `- **Save offline** — \`${root.key} docs openapi --save\` → \`./docs/openapi.json\` (or \`just docgen\` in app repos)`,
    "",
    "Use the spec to discover REST paths and request/response shapes before calling `/api/...`.",
    "",
  );

  return lines.join("\n");
}

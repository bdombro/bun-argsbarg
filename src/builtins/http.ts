import {
  CliFallbackMode,
  type CliLeaf,
  type CliOption,
  CliOptionKind,
  type CliProgram,
  type CliRouter,
} from "~/core/types.ts";
import { docsEnabled } from "~/docs/resolve.ts";
import { resolveHttpListenAddress } from "~/http/server.ts";
import { resolveCapabilities } from "~/runtime/capabilities.ts";

const HTTP_SERVE_OPTIONS: CliOption[] = [
  { name: "host", description: "Listen host.", kind: CliOptionKind.String },
  { name: "port", description: "Listen port.", kind: CliOptionKind.Number },
  { name: "trust-proxy", description: "Honor X-Forwarded-For for client IP.", kind: CliOptionKind.Presence },
  { name: "obscure-errors", description: "Hide unexpected errors from clients.", kind: CliOptionKind.Presence },
  {
    name: "log-format",
    description: "Log format: json (ECS) or text.",
    kind: CliOptionKind.Enum,
    choices: ["json", "text"],
  },
  {
    name: "log-file",
    description: "Append logs to this file (relative → app config dir).",
    kind: CliOptionKind.String,
  },
  { name: "no-access-log", description: "Disable HTTP access logs.", kind: CliOptionKind.Presence },
  { name: "dev", description: "Print full stacks to stderr on errors.", kind: CliOptionKind.Presence },
];

/** Built-in `http` router: bare `myapp http` runs the HTTP server (via hidden `serve` fallback). */
export function cliBuiltinHttpCommand(program: CliProgram): CliRouter {
  const caps = resolveCapabilities(program);
  const { hostname, port } = resolveHttpListenAddress(program);
  const lines = [
    `HTTP tool server on http://${hostname}:${port}.`,
    "",
    "Endpoints: GET /health, GET /health/ready, GET /openapi.json, GET /swagger, /api/*",
    "",
  ];
  if (caps.configure) {
    lines.push("Configure app settings:", "", "  {argsbarg:program} configure", "");
  }
  if (docsEnabled(program)) {
    lines.push("Full setup guide: {argsbarg:program} docs http");
  }

  const serve: CliLeaf = {
    key: "serve",
    cli: { hidden: true },
    description: "Run as an HTTP API server for tools.",
    handler: () => {},
  };

  return {
    key: "http",
    description: "HTTP API server for tools.",
    notes: lines.join("\n"),
    options: [...HTTP_SERVE_OPTIONS],
    fallbackCommand: "serve",
    fallbackMode: CliFallbackMode.MissingOnly,
    commands: [serve],
  };
}

export { HTTP_SERVE_OPTIONS };

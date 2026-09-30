import {
  type AppSpec,
  type CommandGroup,
  type CommandOption,
  FallbackMode,
  OptionKind,
  type RunnableCommand,
} from "../core/types.ts";
import { httpUserPathGlob, resolveHttpPathPrefix } from "../http/paths.ts";
import { resolveHttpListenAddress } from "../http/server.ts";

const HTTP_SERVE_OPTIONS: readonly CommandOption[] = [
  { name: "host", description: "Listen host.", kind: OptionKind.String },
  { name: "port", description: "Listen port.", kind: OptionKind.Number },
  { name: "trust-proxy", description: "Honor X-Forwarded-For for client IP.", kind: OptionKind.Presence },
  { name: "obscure-errors", description: "Hide unexpected errors from clients.", kind: OptionKind.Presence },
  {
    name: "log-format",
    description: "Log format: json (ECS Logging) or text.",
    kind: OptionKind.Enum,
    choices: ["json", "text"],
  },
  {
    name: "log-file",
    description: "Append logs to this file (relative → app config dir).",
    kind: OptionKind.String,
  },
  { name: "no-access-log", description: "Disable HTTP access logs.", kind: OptionKind.Presence },
  { name: "dev", description: "Print full stacks to stderr on errors.", kind: OptionKind.Presence },
];

/** Built-in `http` router: bare `myapp http` runs the HTTP server (via hidden `serve` fallback). */
export function cliBuiltinHttpCommand(program: AppSpec): CommandGroup {
  const { hostname, port } = resolveHttpListenAddress(program);
  const userGlob = httpUserPathGlob(resolveHttpPathPrefix(program));
  const lines = [
    `HTTP tool server on http://${hostname}:${port}.`,
    "",
    `Endpoints: GET /health/liveness, GET /health/readiness, GET /openapi.json, GET /swagger, ${userGlob}`,
    "",
  ];

  const serve: RunnableCommand = {
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
    fallbackMode: FallbackMode.MissingOnly,
    commands: [serve],
  };
}

export { HTTP_SERVE_OPTIONS };

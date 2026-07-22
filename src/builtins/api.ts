import { resolveApiListenAddress } from "../api/server.ts";
import { resolveCapabilities } from "../capabilities.ts";
import { docsEnabled } from "../docs/resolve.ts";
import { CliFallbackMode, type CliLeaf, type CliProgram, type CliRouter } from "../types.ts";

/** Built-in `api` router: bare `myapp api` runs the HTTP server (via hidden `serve` fallback). */
export function cliBuiltinApiCommand(program: CliProgram): CliRouter {
  const caps = resolveCapabilities(program);
  const { hostname, port } = resolveApiListenAddress(program);
  const lines = [
    `HTTP tool server on http://${hostname}:${port}.`,
    "",
    "Endpoints: GET /health, GET /openapi.json, GET /openapi-browser, POST /tools/:name",
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
    hidden: true,
    description: "Run as an HTTP API server for tools.",
    handler: () => {},
  };

  return {
    key: "api",
    description: "HTTP API server for tools.",
    notes: lines.join("\n"),
    fallbackCommand: "serve",
    fallbackMode: CliFallbackMode.MissingOnly,
    commands: [serve],
  };
}

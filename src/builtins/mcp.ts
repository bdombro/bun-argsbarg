import { resolveCapabilities } from "../capabilities.ts";
import { docsEnabled } from "../docs/resolve.ts";
import { CliFallbackMode, type CliLeaf, type CliProgram, type CliRouter } from "../types.ts";

/** Built-in `mcp` router: bare `myapp mcp` runs stdio (via hidden `serve` fallback); `mcp bundle` packs `.mcpb`. */
export function cliBuiltinMcpCommand(program: CliProgram): CliRouter {
  const caps = resolveCapabilities(program);
  const lines = [
    "Stdio MCP server. Add to Cursor, Claude Code, or Claude Desktop:",
    "",
    "  command: {argsbarg:program}",
    "  args: mcp",
    "",
  ];
  if (caps.install) {
    lines.push("Or:", "", "  {argsbarg:program} install --mcp --yes", "");
  }
  if (docsEnabled(program)) {
    lines.push("Full setup guide: {argsbarg:program} docs mcp");
  }

  const serve: CliLeaf = {
    key: "serve",
    hidden: true,
    description: "Run as an MCP server over stdio for AI agents.",
    handler: () => {},
  };

  const bundle: CliLeaf = {
    key: "bundle",
    description: "Pack dist MCP artifacts (`.mcpb`, Claude Code plugin zip) from dist/<key>.",
    handler: () => {},
  };

  return {
    key: "mcp",
    description: "MCP server and bundle tools.",
    notes: lines.join("\n"),
    fallbackCommand: "serve",
    fallbackMode: CliFallbackMode.MissingOnly,
    commands: [serve, bundle],
  };
}

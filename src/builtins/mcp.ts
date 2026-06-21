import { resolveCapabilities } from "../capabilities.ts";
import { docsEnabled } from "../docs/resolve.ts";
import { type CliLeaf, type CliProgram } from "../types.ts";

/** Presence options for the top-level `mcp` built-in (leaf). */
export function cliBuiltinMcpCommand(program: CliProgram): CliLeaf {
  const caps = resolveCapabilities(program);
  const lines = [
    "Stdio MCP server. Add to Cursor or Claude:",
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
  return {
    key: "mcp",
    description: "Run as an MCP server over stdio for AI agents.",
    notes: lines.join("\n"),
    handler: () => {},
  };
}

import { CliCommand, CliOption, CliOptionKind } from "../types.ts";

/** Presence options for the top-level `mcp` built-in (leaf). */
export function cliBuiltinMcpCommand(): CliCommand {
  return {
    key: "mcp",
    description: "Run as an MCP server over stdio for AI agents.",
    notes:
      "Configure MCP clients with `command` set to this program name and `args` set to `[\"mcp\"]`.\n\n" +
      "See docs/mcp.md for setup details.",
    handler: () => {},
  };
}

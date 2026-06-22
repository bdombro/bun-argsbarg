/*
This module starts the ArgsBarg MCP stdio server for opt-in program roots.
*/

import { bootstrapMcpEnv } from "./mcp/env.ts";
import { mcpServeStdioLoop } from "./mcp/server.ts";
import type { CliProgram } from "./types.ts";

/**
 * Runs the MCP JSON-RPC server on stdin/stdout until stdin closes, then exits.
 * Caller must ensure `root.mcpServer` is set.
 */
export async function cliMcpServeStdio(root: CliProgram): Promise<never> {
  try {
    if (root.mcpServer) {
      bootstrapMcpEnv(root.mcpServer);
    }
    await mcpServeStdioLoop(root);
    process.exit(0);
  } catch (err) {
    if (err instanceof Error) {
      process.stderr.write(`${err.message}\n`);
    } else {
      process.stderr.write("MCP server error.\n");
    }
    process.exit(1);
  }
}

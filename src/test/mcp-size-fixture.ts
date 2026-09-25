#!/usr/bin/env bun
/*
MCP size-warning integration test fixture (not a public example). One leaf with oversized notes,
triggering the "description" startup size warning on stderr.
*/

import { Cli, type CliProgram } from "../index.ts";

const program = {
  commands: [
    {
      key: "run",
      description: "Run it.",
      notes: "x".repeat(3_000),
      handler: (ctx) => {
        if (ctx.invocation === "cli") {
          console.log("ran");
          return;
        }
        return "ran";
      },
    },
  ],
  description: "MCP size-warning test fixture.",
  key: "mcp-size-test",
  mcpServer: { enabled: true },
  version: "0.0.0-test",
} satisfies CliProgram;

const cli = new Cli(program);
await cli.run();

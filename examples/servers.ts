#!/usr/bin/env bun
/*
This example shows the smallest end-to-end CLI+MCP+API setup.
It includes one command, a couple of options, and a direct call to the runtime so
readers can copy the pattern into their own scripts quickly.

Demonstrates: `servers.ts hello`, MCP tool `hello`, and `POST /api/hello`.

Ex API Call:
curl -s -X POST http://127.0.0.1:3000/api/hello \
  -H 'content-type: application/json' \
  -d '{"name":"alice"}'
Ex API Response:
{ "greeting": "hello alice" }


*/

import pkg from "../package.json" with { type: "json" };
import { Cli, CliOptionKind, type CliProgram } from "../src/index";

const program = {
  key: "servers.ts",
  version: pkg.version,
  description: "Tiny demo.",
  mcpServer: { enabled: true },
  httpServer: { enabled: true },
  docs: {
    topics: {
      readme: { text: "# servers.ts\n\nServers demo.\n" },
    },
  },
  commands: [
    {
      key: "hello",
      description: "Say hello.",
      positionals: [
        {
          name: "name",
          description: "Who to greet.",
          kind: CliOptionKind.String,
          argMin: 0,
          argMax: 1,
        },
      ],
      options: [
        {
          name: "verbose",
          description: "Enable extra logging.",
          kind: CliOptionKind.Presence,
          shortName: "v",
        },
      ],
      handler: (ctx) => {
        const name = ctx.args[0] ?? "world";
        if (ctx.hasFlag("verbose") && ctx.invocation === "cli") {
          console.log("verbose mode");
        }
        const greeting = `hello ${name}`;
        if (ctx.invocation === "cli") {
          console.log(greeting);
          return;
        }
        return { greeting, verbose: ctx.hasFlag("verbose") };
      },
    },
  ],
} satisfies CliProgram;

const cli = new Cli(program);
await cli.run();

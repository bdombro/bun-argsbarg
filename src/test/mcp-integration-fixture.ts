#!/usr/bin/env bun
/*
MCP integration test fixture for subprocess tests (not a public example).
*/

import { Cli, CliOptionKind, type CliProgram } from "../index.ts";

const program = {
  appConfig: {
    entries: {
      argsTestSecret: {
        description: "Test secret for integration tests.",
        env: "ARGS_TEST_SECRET",
      },
    },
  },
  commands: [
    {
      key: "echo-env",
      description: "Echo an env var.",
      options: [
        {
          name: "name",
          description: "Env var name to read.",
          kind: CliOptionKind.String,
          required: true,
        },
      ],
      handler: (ctx) => {
        const name = ctx.stringOpt("name") ?? "";
        const value = process.env[name] ?? "";
        if (ctx.invocation === "cli") {
          console.log(value);
          return;
        }
        return value;
      },
    },
    {
      key: "set-mode",
      description: "Set mode enum.",
      options: [
        {
          name: "mode",
          description: "Operating mode.",
          kind: CliOptionKind.Enum,
          choices: ["dev", "prod"],
          required: true,
        },
      ],
      handler: (ctx) => {
        const mode = ctx.stringOpt("mode") ?? "";
        const text = `mode=${mode}`;
        if (ctx.invocation === "cli") {
          console.log(text);
          return;
        }
        return text;
      },
    },
  ],
  description: "MCP integration test fixture.",
  docs: {
    topics: {
      readme: { text: "# MCP test readme\n" },
    },
  },
  key: "mcp-test",
  mcpServer: {
    enabled: true,
    resources: [
      {
        uri: "test://hello",
        name: "hello",
        load: () => "hello resource",
      },
    ],
  },
  version: "0.0.0-test",
} satisfies CliProgram;

const cli = new Cli(program);
await cli.run();

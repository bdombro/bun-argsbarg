#!/usr/bin/env bun
/*
MCP test fixture for subprocess integration tests only.
*/

import { Cli, CliOptionKind, type CliProgram } from "../src/index.ts";

const configPath = process.env.ARGS_TEST_CONFIG_FILE;

const program = {
  key: "mcp-test",
  version: "0.0.0-test",
  description: "MCP integration test fixture.",
  ...(configPath
    ? {
        appConfig: {
          path: configPath,
          entries: {
            argsTestSecret: {
              description: "Test secret for integration tests.",
              env: "ARGS_TEST_SECRET",
            },
          },
        },
      }
    : {
        appConfig: {
          entries: {
            argsTestSecret: {
              description: "Test secret for integration tests.",
              env: "ARGS_TEST_SECRET",
            },
          },
        },
      }),
  mcpServer: {
    enabled: true,
    resources: [
      {
        uri: "test://hello",
        name: "hello",
        description: "Test resource.",
        mimeType: "text/plain",
        load: () => "hello resource",
      },
    ],
  },
  docs: {
    enabled: true,
    topics: {
      readme: { text: "# MCP test readme\n" },
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
        console.log(process.env[name] ?? "");
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
        console.log(`mode=${ctx.stringOpt("mode")}`);
      },
    },
  ],
} satisfies CliProgram;

const cli = new Cli(program);
await cli.run();

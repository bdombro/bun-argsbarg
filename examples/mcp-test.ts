#!/usr/bin/env bun
/*
MCP test fixture for subprocess integration tests only.
*/

import { cliRun, CliProgram, CliOptionKind } from "../src/index.ts";

const envFilePath = process.env.ARGS_TEST_ENV_FILE;

const cli = {
  key: "mcp-test",
  description: "MCP integration test fixture.",
  mcpServer: {
    name: "mcp-test",
    version: "0.0.0-test",
    ...(envFilePath ? { envFile: envFilePath } : {}),
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
  commands: [
    {
      key: "echo-env",
      description: "Echo an env var.",
      mcpTool: {
        requiresEnv: ["ARGS_TEST_SECRET"],
      },
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

await cliRun(cli);

#!/usr/bin/env node
/*
MCP integration test fixture for subprocess tests (not a public example).
*/

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type AppSpec, argsbarg, OptionKind } from "../index.ts";

/** Runs a child CLI with piped output while a tool invocation is active. */
const execFileAsync = promisify(execFile);
/** Cwd observed before an application-specific override. */
let hookCwd = process.cwd();
/** Active workspace handlers, used to detect accidental concurrent dispatch. */
let activeWorkspaceCalls = 0;

const program = {
  commands: [
    {
      description: "Report handler and child cwd.",
      /** Reports cwd after an asynchronous child process without allowing overlapping tools. */
      handler: async () => {
        activeWorkspaceCalls++;
        const overlap = activeWorkspaceCalls > 1;
        const { stdout } = await execFileAsync(process.execPath, ["-p", "process.cwd()"]);
        activeWorkspaceCalls--;
        return { childCwd: stdout.trim(), cwd: process.cwd(), hookCwd, overlap };
      },
      key: "workspace-cwd",
    },
    {
      key: "echo-env",
      description: "Echo an env var.",
      options: [
        {
          name: "name",
          description: "Env var name to read.",
          kind: OptionKind.String,
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
          kind: OptionKind.Enum,
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
  hooks: {
    /** Records cwd before each tool and optionally applies the fixture's application override. */
    beforeInvoke: () => {
      hookCwd = process.cwd();
      if (process.env.MCP_TEST_CWD) process.chdir(process.env.MCP_TEST_CWD);
    },
  },
  key: "mcp-test",
  mcpServer: {
    enabled: true,
    instructions: "Read the fixture skill.",
    resources: [
      {
        uri: "test://hello",
        name: "hello",
        load: () => "hello resource",
      },
    ],
  },
  version: "0.0.0-test",
} satisfies AppSpec;

const cli = argsbarg(program);
await cli.run();

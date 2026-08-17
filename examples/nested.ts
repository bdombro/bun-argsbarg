#!/usr/bin/env bun
/*
This example shows nested routing with groups and fallback behavior.
It adds a deeper command tree so readers can see how grouped routing, leaf handlers,
and fallback commands fit together in one schema.

It demonstrates how the schema scales beyond one command.
*/

import pkg from "../package.json" with { type: "json" };
import { Cli, CliFallbackMode, CliOptionKind, type CliProgram, wantsExplicitJson } from "../src/index";

const program = {
  commands: [
    {
      key: "stat",
      description: "File metadata.",
      commands: [
        {
          key: "owner",
          description: "Ownership helpers.",
          commands: [
            {
              key: "lookup",
              description: "Resolve owner info.",
              options: [
                {
                  name: "json",
                  description: "Emit handler output as JSON.",
                  kind: CliOptionKind.Presence,
                },
                {
                  name: "user-name",
                  description: "User to look up.",
                  kind: CliOptionKind.String,
                  shortName: "u",
                },
              ],
              positionals: [
                {
                  name: "path",
                  description: "File or directory.",
                  kind: CliOptionKind.String,
                },
              ],
              handler: (ctx) => {
                const user = ctx.stringOpt("user-name") ?? "?";
                const path = ctx.args[0];
                if (!path) {
                  console.error("Missing path.");
                  process.exit(1);
                }
                if (wantsExplicitJson(ctx, ctx.hasFlag("json"))) {
                  const payload = { user, path };
                  if (ctx.invocation === "cli") {
                    console.log(JSON.stringify(payload));
                    return;
                  }
                  return payload;
                }
                const text = `lookup user=${user} path=${path}`;
                if (ctx.invocation === "cli") {
                  console.log(text);
                  return;
                }
                return text;
              },
            },
          ],
        },
      ],
    },
    {
      key: "read",
      description: "Print the first line of each file.",
      notes: "Pass one or more file paths. The program prints the first line of each.",
      positionals: [
        {
          name: "files",
          description: "Paths to read.",
          kind: CliOptionKind.String,
          argMax: 0,
        },
      ],
      handler: async (ctx) => {
        if (ctx.args.length === 0) {
          console.error("Missing file path.");
          process.exit(1);
        }
        for (const path of ctx.args) {
          try {
            const file = Bun.file(path);
            const text = await file.text();
            const firstLine = text.split("\n")[0];
            console.log(`${path}: ${firstLine}`);
          } catch {
            console.error(`Cannot open: ${path}`);
          }
        }
      },
    },
  ],
  configure: {},
  description: "Nested groups demo.",
  docs: {
    topics: {
      readme: { text: "# nested.ts\n\nNested groups demo.\n" },
    },
  },
  fallbackCommand: "read",
  fallbackMode: CliFallbackMode.MissingOrUnknown,
  key: "nested.ts",
  mcpServer: { enabled: true },
  version: pkg.version,
} satisfies CliProgram;

const cli = new Cli(program);
await cli.run();

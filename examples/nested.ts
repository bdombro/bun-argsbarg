#!/usr/bin/env bun
/*
This example shows nested routing with groups and fallback behavior.
It adds a deeper command tree so readers can see how grouped routing, leaf handlers,
and fallback commands fit together in one schema.

It demonstrates how the schema scales beyond one command.
*/

import { cliRun, CliCommand, CliOptionKind, CliFallbackMode } from "../src/index.ts";

const cli: CliCommand = {
  key: "nested.ts",
  description: "Nested groups demo.",
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
                  argMin: 1,
                  argMax: 1,
                },
              ],
              handler: (ctx) => {
                const user = ctx.stringOpt("user-name") ?? "?";
                const path = ctx.args[0];
                if (!path) {
                  console.error("Missing path.");
                  process.exit(1);
                }
                console.log(`lookup user=${user} path=${path}`);
              },
            },
          ],
        },
      ],
    },
    {
      key: "read",
      description: "Print the first line of each file.",
      notes: "Pass one or more file paths. {app} prints the first line of each.",
      positionals: [
        {
          name: "files",
          description: "Paths to read.",
          kind: CliOptionKind.String,
          argMin: 1,
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
          } catch (err) {
            console.error(`Cannot open: ${path}`);
          }
        }
      },
    },
  ],
  fallbackCommand: "read",
  fallbackMode: CliFallbackMode.MissingOrUnknown,
};

await cliRun(cli);

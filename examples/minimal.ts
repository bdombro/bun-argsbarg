#!/usr/bin/env bun
/*
This example shows the smallest end-to-end CLI setup.
It includes one command, a couple of options, and a direct call to the runtime so
readers can copy the pattern into their own scripts quickly.

It demonstrates the minimal Bun integration path.
*/

import { cliRun, CliCommand, CliOptionKind, CliFallbackMode } from "../src/index.ts";

const cli: CliCommand = {
  key: "minimal.ts",
  description: "Tiny demo.",
  commands: [
    {
      key: "hello",
      description: "Say hello.",
      options: [
        {
          name: "name",
          description: "Who to greet.",
          kind: CliOptionKind.String,
          shortName: "n",
        },
        {
          name: "verbose",
          description: "Enable extra logging.",
          kind: CliOptionKind.Presence,
          shortName: "v",
        },
      ],
      handler: (ctx) => {
        const name = ctx.stringOpt("name") ?? "world";
        if (ctx.hasFlag("verbose")) {
          console.log("verbose mode");
        }
        console.log(`hello ${name}`);
      },
    },
  ],
  fallbackCommand: "hello",
  fallbackMode: CliFallbackMode.MissingOrUnknown,
};

await cliRun(cli);

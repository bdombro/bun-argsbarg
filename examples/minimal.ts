#!/usr/bin/env bun
/*
This example shows the smallest end-to-end CLI setup.
It includes one command, a couple of options, and a direct call to the runtime so
readers can copy the pattern into their own scripts quickly.

It demonstrates the minimal Bun integration path.
*/

import { cliRun, CliCommand, createOption, CliOptionKind, CliFallbackMode } from "../src/index.ts";

const cli: CliCommand = {
  key: "minimal.ts",
  description: "Tiny demo.",
  children: [
    {
      key: "hello",
      description: "Say hello.",
      options: [
        createOption("name", "Who to greet.", {
          kind: CliOptionKind.String,
          shortName: "n",
        }),
        createOption("verbose", "Enable extra logging.", {
          shortName: "v",
        }),
      ],
      handler: (ctx) => {
        const name = ctx.stringOpt("name") ?? "world";
        if (ctx.flag("verbose")) {
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

#!/usr/bin/env bun
/*
This example shows the smallest end-to-end CLI setup.
It includes one command, a couple of options, and a direct call to the runtime so
readers can copy the pattern into their own scripts quickly.

It demonstrates the minimal Bun integration path.
*/

import { cliRun, CliCommand, CliOptionKind } from "../src/index.ts";

const cli: CliCommand = {
  key: "minimal.ts",
  description: "Tiny demo.",
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
    if (ctx.hasFlag("verbose")) {
      console.log("verbose mode");
    }
    console.log(`hello ${name}`);
  },
};

await cliRun(cli);

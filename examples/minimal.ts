#!/usr/bin/env bun
/*
This example shows the smallest end-to-end CLI setup.
It includes one command, a couple of options, and a direct call to the runtime so
readers can copy the pattern into their own scripts quickly.

It demonstrates the minimal Bun integration path.
*/

import pkg from "../package.json" with { type: "json" };
import { Cli, CliOptionKind, type CliProgram } from "../src/index.ts";

const program = {
  key: "minimal.ts",
  version: pkg.version,
  description: "Tiny demo.",
  docs: {
    enabled: true,
    topics: {
      readme: { text: "# minimal.ts\n\nTiny demo.\n" },
    },
  },
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
} satisfies CliProgram;

const cli = new Cli(program);
await cli.run();

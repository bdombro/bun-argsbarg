#!/usr/bin/env bun
/*
This example shows the smallest end-to-end CLI setup.
It includes one command, a couple of options, and a direct call to the runtime so
readers can copy the pattern into their own scripts quickly.

It demonstrates the minimal Bun integration path.
*/

import pkg from "../package.json" with { type: "json" };
import { OptionKind, argsbarg } from "../src/index";

const app = argsbarg({
  description: "Tiny demo.",
  handler: (ctx) => {
    const name = ctx.args[0] ?? "world";
    if (ctx.hasFlag("verbose")) {
      console.log("verbose mode");
    }
    console.log(`hello ${name}`);
  },
  key: "minimal.ts",
  options: [
    {
      name: "verbose",
      description: "Enable extra logging.",
      kind: OptionKind.Presence,
      shortName: "v",
    },
  ],
  positionals: [
    {
      name: "name",
      description: "Who to greet.",
      kind: OptionKind.String,
      argMin: 0,
      argMax: 1,
    },
  ],
  version: pkg.version,
});

await app.run();

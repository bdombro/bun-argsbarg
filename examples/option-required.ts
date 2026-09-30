#!/usr/bin/env node
/*
This example shows the smallest end-to-end CLI setup.
It includes one command, a couple of options, and a direct call to the runtime so
readers can copy the pattern into their own scripts quickly.

It demonstrates the minimal integration path.
*/

import pkg from "../package.json" with { type: "json" };
import { OptionKind, isInteractiveTty, argsbarg } from "../src/index.ts";

const app = argsbarg({
  description: "Demo of a required option.",
  handler: (ctx) => {
    const requiredAlways = ctx.stringOpt("requiredAlways");
    if (requiredAlways === undefined) {
      throw new Error("requiredAlways missing after validation");
    }
    const requiredNonTty = ctx.stringOpt("requiredNonTty") ?? "valueWhenOmitted";
    const optional = ctx.stringOpt("optional") ?? "valueWhenOmitted";
    console.log(`requiredAlways: ${requiredAlways}`);
    console.log(`requiredNonTty: ${requiredNonTty}`);
    console.log(`optional: ${optional}`);
  },
  key: "option-required.ts",
  options: [
    {
      name: "requiredAlways",
      description: "Always required string option.",
      kind: OptionKind.String,
      required: true,
      shortName: "a",
    },
    {
      name: "requiredNonTty",
      description: "Required when not running in a tty.",
      kind: OptionKind.String,
      required: !isInteractiveTty,
      shortName: "t",
    },
    {
      name: "optional",
      description: "optional string option.",
      kind: OptionKind.String,
      shortName: "o",
    },
  ],
  version: pkg.version,
});

await app.run();

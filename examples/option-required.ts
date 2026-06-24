#!/usr/bin/env bun
/*
This example shows the smallest end-to-end CLI setup.
It includes one command, a couple of options, and a direct call to the runtime so
readers can copy the pattern into their own scripts quickly.

It demonstrates the minimal Bun integration path.
*/

import pkg from "../package.json" with { type: "json" };
import { Cli, CliOptionKind, type CliProgram, isInteractiveTty } from "../src/index.ts";

const program = {
  key: "option-required.ts",
  version: pkg.version,
  description: "Demo of a required option.",
  options: [
    {
      name: "requiredAlways",
      description: "Always required string option.",
      kind: CliOptionKind.String,
      required: true,
      shortName: "a",
    },
    {
      name: "requiredNonTty",
      description: "Required when not running in a tty.",
      kind: CliOptionKind.String,
      required: !isInteractiveTty,
      shortName: "t",
    },
    {
      name: "optional",
      description: "optional string option.",
      kind: CliOptionKind.String,
      shortName: "o",
    },
  ],
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
} satisfies CliProgram;

const cli = new Cli(program);
await cli.run();

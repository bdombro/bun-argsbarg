#!/usr/bin/env node
/*
 * Value formats demo: duration, comma-list, date, default, and ctx.inputs.
 * Run: node ./examples/formats.ts run --tags alpha,beta --on 2026-06-22
 * MCP: pass comma-list as string or array; varargs N/A on this leaf.
 */

import pkg from "../package.json" with { type: "json" };
import { FallbackMode, OptionKind, ValueFormat, command, argsbarg } from "../src/index.ts";

const app = argsbarg({
  commands: [
    command({
      key: "run",
      description: "Print coerced option values from ctx.inputs.",
      options: [
        {
          name: "timeout",
          description: "Wait budget (default 30s).",
          kind: OptionKind.String,
          format: ValueFormat.Duration,
          default: "30s",
        },
        {
          name: "tags",
          description: "Comma-separated labels.",
          kind: OptionKind.String,
          format: ValueFormat.CommaList,
        },
        {
          name: "on",
          description: "Calendar day (YYYY-MM-DD).",
          kind: OptionKind.String,
          format: ValueFormat.Date,
        },
        {
          name: "verbose",
          description: "Also print raw ctx.opts strings.",
          kind: OptionKind.Presence,
          shortName: "v",
        },
      ],
      handler: (ctx) => {
        const inputs = ctx.inputs;
        const out = {
          inputs,
          durationMs: ctx.durationOpt("timeout"),
          tags: ctx.commaListOpt("tags"),
          on: ctx.dateOpt("on"),
        };
        if (ctx.hasFlag("verbose")) {
          Object.assign(out, { rawOpts: ctx.opts });
        }
        process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
      },
    }),
  ],
  description: "Value formats and ctx.inputs demo.",
  fallbackCommand: "run",
  fallbackMode: FallbackMode.MissingOnly,
  key: "formats.ts",
  version: pkg.version,
});

await app.run();

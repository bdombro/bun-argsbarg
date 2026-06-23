#!/usr/bin/env bun
/*
 * Value formats demo: duration, comma-list, date, default, and readLeafInputs().
 * Run: bun ./examples/formats.ts run --tags alpha,beta --on 2026-06-22
 * MCP: pass comma-list as string or array; varargs N/A on this leaf.
 */

import pkg from "../package.json" with { type: "json" };
import { cliRun, CliFallbackMode, CliOptionKind, CliValueFormat, type CliProgram } from "../src/index.ts";

const cli = {
  key: "formats.ts",
  version: pkg.version,
  description: "Value formats and readLeafInputs demo.",
  fallbackCommand: "run",
  fallbackMode: CliFallbackMode.MissingOnly,
  mcpServer: { enabled: true },
  commands: [
    {
      key: "run",
      description: "Print coerced option values from readLeafInputs().",
      options: [
        {
          name: "timeout",
          description: "Wait budget (default 30s).",
          kind: CliOptionKind.String,
          format: CliValueFormat.Duration,
          default: "30s",
        },
        {
          name: "tags",
          description: "Comma-separated labels.",
          kind: CliOptionKind.String,
          format: CliValueFormat.CommaList,
        },
        {
          name: "on",
          description: "Calendar day (YYYY-MM-DD).",
          kind: CliOptionKind.String,
          format: CliValueFormat.Date,
        },
        {
          name: "verbose",
          description: "Also print raw ctx.opts strings.",
          kind: CliOptionKind.Presence,
          shortName: "v",
        },
      ],
      handler: (ctx) => {
        const inputs = ctx.readLeafInputs();
        const out = {
          readLeafInputs: inputs,
          durationMs: ctx.durationOpt("timeout"),
          tags: ctx.commaListOpt("tags"),
          on: ctx.dateOpt("on"),
        };
        if (ctx.hasFlag("verbose")) {
          Object.assign(out, { rawOpts: ctx.opts });
        }
        process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
      },
    },
  ],
} satisfies CliProgram;

await cliRun(cli);

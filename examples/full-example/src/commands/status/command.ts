/*
Status leaf — version with optional JSON stdout (no schemagen).
*/

import { type CliLeaf, CliOptionKind } from "argsbarg";

export const statusCommand = {
  key: "status",
  description: "Show app version.",
  options: [
    {
      name: "json",
      description: "Emit JSON.",
      kind: CliOptionKind.Presence,
    },
  ],
  handler: (ctx) => {
    const out = { version: ctx.program.version };
    if (ctx.hasFlag("json")) {
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    if (ctx.invocation === "cli") {
      console.log(`version=${out.version}`);
      return;
    }
    return out;
  },
} satisfies CliLeaf;

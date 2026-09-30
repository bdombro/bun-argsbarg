/*
Status leaf — version with optional JSON stdout (no schemas).
*/

import { command, OptionKind } from "argsbarg";

export const statusCommand = command({
  key: "status",
  description: "Show app version.",
  options: [
    {
      name: "json",
      description: "Emit JSON.",
      kind: OptionKind.Presence,
    },
  ],
  handler: (ctx) => {
    const out = { version: ctx.spec.version };
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
});

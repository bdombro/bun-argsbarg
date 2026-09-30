/*
Status leaf — demonstrates outputSchema.
*/

import { command, OptionKind } from "argsbarg";
import { StatusJsonOutput } from "./types.ts";

/** Prints the app version (JSON with `--json`). */
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
  outputSchema: StatusJsonOutput,
  handler: (ctx) => {
    const out: StatusJsonOutput = { version: ctx.spec.version };
    if (ctx.hasFlag("json")) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(`version=${out.version}`);
    }
  },
});

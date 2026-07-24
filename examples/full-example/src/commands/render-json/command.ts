/*
Render-json leaf — JSON body demo with schemagen inputSchema and ctx.inputsAs.
*/

import type { CliLeaf, CliProgram } from "argsbarg";
import { RenderJsonInputSchema } from "./__generated__";
import type { RenderJsonInput } from "./types.ts";

export const renderJsonCommand = {
  key: "render-json",
  description: "Echo a JSON message (schema-first JSON leaf demo).",
  kind: "json",
  inputSchema: RenderJsonInputSchema,
  handler: (ctx) => {
    const { message } = ctx.inputsAs<RenderJsonInput>();
    if (ctx.invocation === "cli") {
      console.log(message);
      return;
    }
    return { message };
  },
} satisfies CliLeaf;

/** Program stub for colocated tests. */
export function renderJsonTestProgram(base: CliProgram): CliProgram {
  return {
    ...base,
    commands: [renderJsonCommand],
  };
}

/*
Shape-area leaf — discriminated-union JSON body demo (MCP wraps non-object roots as `{ input }`).
*/

import type { CliLeaf, CliProgram } from "argsbarg";
import { ShapeAreaInputSchema } from "./__generated__";
import type { ShapeAreaInput } from "./types.ts";

export const shapeAreaCommand = {
  key: "shape-area",
  description: "Compute the area of a circle or rectangle (union-input JSON leaf demo).",
  kind: "json",
  inputSchema: ShapeAreaInputSchema,
  handler: (ctx) => {
    const shape = ctx.inputsAs<ShapeAreaInput>();
    const area = shape.kind === "circle" ? Math.PI * shape.radius ** 2 : shape.width * shape.height;
    if (ctx.invocation === "cli") {
      console.log(area);
      return;
    }
    return { area };
  },
} satisfies CliLeaf;

/** Program stub for colocated tests. */
export function shapeAreaTestProgram(base: CliProgram): CliProgram {
  return {
    ...base,
    commands: [shapeAreaCommand],
  };
}

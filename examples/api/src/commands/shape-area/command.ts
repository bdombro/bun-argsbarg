/*
Shape-area leaf — discriminated-union JSON body demo (MCP wraps non-object roots as `{ input }`).
*/

import { type AppSpec, command } from "argsbarg";
import { ShapeAreaInput } from "./types.ts";

/** Computes the area of a circle or rectangle from a discriminated-union body. */
export const shapeAreaCommand = command({
  key: "shape-area",
  description: "Compute the area of a circle or rectangle (union-input JSON leaf demo).",
  kind: "document",
  inputSchema: ShapeAreaInput,
  handler: (ctx) => {
    const shape = ctx.inputs;
    const area = shape.kind === "circle" ? Math.PI * shape.radius ** 2 : shape.width * shape.height;
    if (ctx.invocation === "cli") {
      console.log(area);
      return;
    }
    return { area };
  },
});

/** App spec stub for colocated tests. */
export function shapeAreaTestSpec(base: AppSpec): AppSpec {
  return {
    ...base,
    commands: [shapeAreaCommand],
  };
}

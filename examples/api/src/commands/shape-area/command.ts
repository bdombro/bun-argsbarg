/*
Shape-area leaf — discriminated-union JSON body demo (MCP wraps non-object roots as `{ input }`).
*/

import { type AppSpec, command } from "argsbarg";
import { z } from "zod";

/** A circle, measured by radius. */
export const Circle = z
  .strictObject({
    kind: z.literal("circle").describe("Shape discriminator."),
    radius: z.number().describe("Circle radius."),
  })
  .describe("A circle, measured by radius.");

/** A rectangle, measured by width and height. */
export const Rect = z
  .strictObject({
    kind: z.literal("rect").describe("Shape discriminator."),
    width: z.number().describe("Rectangle width."),
    height: z.number().describe("Rectangle height."),
  })
  .describe("A rectangle, measured by width and height.");

/** Shape to measure: a circle or a rectangle. */
export const ShapeAreaInput = z
  .discriminatedUnion("kind", [Circle, Rect])
  .describe("Shape to measure: a circle or a rectangle.");

/** Parsed `shape-area` body. */
export type ShapeAreaInput = z.infer<typeof ShapeAreaInput>;

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

/*
Input schema and types for the shape-area demo leaf (discriminated-union input).
The union root is not `type: "object"`, so MCP clients see it wrapped as `{ input: ... }`.
*/

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

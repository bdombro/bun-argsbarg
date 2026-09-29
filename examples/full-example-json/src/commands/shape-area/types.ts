/*
Input types for the shape-area demo leaf (discriminated-union input).
The union root is not `type: "object"`, so MCP clients see it wrapped as `{ input: ... }`.
*/

/** A circle, measured by radius. */
export interface Circle {
  /** Shape discriminator. */
  kind: "circle";
  /** Circle radius. */
  radius: number;
}

/** A rectangle, measured by width and height. */
export interface Rect {
  /** Shape discriminator. */
  kind: "rect";
  /** Rectangle width. */
  width: number;
  /** Rectangle height. */
  height: number;
}

/**
 * Shape to measure: a circle or a rectangle.
 * @sg
 */
export type ShapeAreaInput = Circle | Rect;

/*
Input schema and type for the render-json demo leaf.
*/

import { z } from "zod";

/** JSON body for `render-json`. */
export const RenderJsonInput = z.strictObject({
  message: z.string().describe("Message to echo back."),
});

/** Parsed `render-json` body. */
export type RenderJsonInput = z.infer<typeof RenderJsonInput>;

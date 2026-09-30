/*
Output schema and type for `status --json`.
*/

import { z } from "zod";

/** JSON stdout for `example-agent-plugin status --json`. */
export const StatusJsonOutput = z.strictObject({
  version: z.string().describe("App version from program root."),
});

/** `status --json` payload. */
export type StatusJsonOutput = z.infer<typeof StatusJsonOutput>;

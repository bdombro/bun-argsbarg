/** Shared terminal prompt helpers. */

import { readSync } from "node:fs";

/** Read one line from stdin (no masking). */
export function readPromptLine(): string {
  const buf = Buffer.alloc(4096);
  const n = readSync(0, buf, { length: 4096 });
  return buf.toString("utf8", 0, n).replace(/\r?\n$/, "");
}

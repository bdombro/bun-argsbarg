/* App-level schema checks: every input and config object rejects unknown keys (z.strictObject). */

import { describe, expect, test } from "bun:test";
import { schemaStrictnessWarnings } from "argsbarg";
import { app } from "./app.ts";

describe("mcpPlugin schemas", () => {
  test("input and config schemas are strict", () => {
    expect(schemaStrictnessWarnings(app.spec)).toEqual([]);
  });
});

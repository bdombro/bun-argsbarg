import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { statusCommand } from "./command.ts";

describe("status command", () => {
  test("exports json option without outputSchema", () => {
    assert.equal(statusCommand.key, "status");
    assert.equal("outputSchema" in statusCommand, false);
    assert.ok(statusCommand.options?.some((o) => o.name === "json"));
  });
});

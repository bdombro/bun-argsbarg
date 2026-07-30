import { describe, expect, test } from "bun:test";
import { statusCommand } from "./command.ts";

describe("status command", () => {
  test("exports json option without outputSchema", () => {
    expect(statusCommand.key).toBe("status");
    expect(statusCommand.outputSchema).toBeUndefined();
    expect(statusCommand.options?.some((o) => o.name === "json")).toBe(true);
  });
});

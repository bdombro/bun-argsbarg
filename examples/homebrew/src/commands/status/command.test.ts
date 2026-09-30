import { describe, expect, test } from "bun:test";
import { statusCommand } from "./command.ts";

describe("status command", () => {
  test("exports json option without outputSchema", () => {
    expect(statusCommand.key).toBe("status");
    expect("outputSchema" in statusCommand).toBe(false);
    expect(statusCommand.options?.some((o) => o.name === "json")).toBe(true);
  });
});

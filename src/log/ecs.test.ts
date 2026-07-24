/*
Unit tests for ECS log line formatting.
*/

import { describe, expect, test } from "bun:test";
import { formatEcsLine } from "./ecs.ts";

describe("formatEcsLine", () => {
  test("includes service fields and event action", () => {
    const line = formatEcsLine(
      { name: "myapp", version: "7.0.0" },
      {
        level: "info",
        message: "HTTP API listening",
        action: "http.server.start",
      },
    );
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed["service.name"]).toBe("myapp");
    expect(parsed["service.version"]).toBe("7.0.0");
    expect(parsed["event.action"]).toBe("http.server.start");
    expect(parsed.message).toBe("HTTP API listening");
    expect(parsed["log.level"]).toBe("info");
    expect(typeof parsed["@timestamp"]).toBe("string");
  });

  test("includes error stack fields", () => {
    const err = new Error("boom");
    const line = formatEcsLine(
      { name: "app", version: "1.0.0" },
      {
        level: "error",
        message: "invoke failed",
        action: "invoke.error",
        error: err,
      },
    );
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed["error.message"]).toBe("boom");
    expect(parsed["error.type"]).toBe("Error");
    expect(String(parsed["error.stack_trace"])).toContain("boom");
  });
});

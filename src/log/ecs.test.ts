/*
Unit tests for ECS log line formatting.
*/

import { describe, expect, test } from "bun:test";
import { ECS_VERSION, formatEcsLine, mergeEnrichFields, PROTECTED_ECS_KEYS } from "./ecs.ts";

describe("formatEcsLine", () => {
  test("includes ECS Logging baseline fields", () => {
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
    expect(parsed["ecs.version"]).toBe(ECS_VERSION);
    expect(typeof parsed["@timestamp"]).toBe("string");
  });

  test("nests labels object instead of flattening", () => {
    const line = formatEcsLine(
      { name: "app", version: "1.0.0" },
      {
        level: "info",
        message: "ok",
        labels: { request_id: "abc", team: "demo" },
      },
    );
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.labels).toEqual({ request_id: "abc", team: "demo" });
    expect(parsed["labels.request_id"]).toBeUndefined();
  });

  test("includes trace and canonical http fields", () => {
    const line = formatEcsLine(
      { name: "app", version: "1.0.0" },
      {
        level: "info",
        message: "GET /workspaces",
        action: "http.access",
        traceId: "0af7651916cd43dd8448eb211c80319c",
        spanId: "b7ad6b7169203331",
        fields: {
          "http.request.method": "GET",
          "url.path": "/workspaces",
          "http.response.status_code": 200,
          "event.duration": 45_000_000,
        },
      },
    );
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed["trace.id"]).toBe("0af7651916cd43dd8448eb211c80319c");
    expect(parsed["span.id"]).toBe("b7ad6b7169203331");
    expect(parsed["http.request.method"]).toBe("GET");
    expect(parsed["url.path"]).toBe("/workspaces");
    expect(parsed["event.duration"]).toBe(45_000_000);
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

  test("enrich merges additive fields but not protected keys", () => {
    const line = formatEcsLine({
      service: { name: "app", version: "1.0.0" },
      event: { level: "info", message: "hello" },
      enrich: () => ({
        "custom.field": "yes",
        message: "overridden",
      }),
    });
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.message).toBe("hello");
    expect(parsed["custom.field"]).toBe("yes");
  });
});

describe("mergeEnrichFields", () => {
  test("skips protected and existing keys", () => {
    const line: Record<string, unknown> = { message: "keep", "trace.id": "set" };
    mergeEnrichFields(line, { message: "nope", "ecs.version": "0.0.0", "trace.id": "bad", extra: 1 });
    expect(line.message).toBe("keep");
    expect(line["ecs.version"]).toBeUndefined();
    expect(line["trace.id"]).toBe("set");
    expect(line.extra).toBe(1);
    expect(PROTECTED_ECS_KEYS.has("message")).toBe(true);
  });
});

/*
Unit tests for ECS log line formatting.
*/

import assert from "node:assert/strict";
import { describe, test } from "node:test";
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
    assert.equal(parsed["service.name"], "myapp");
    assert.equal(parsed["service.version"], "7.0.0");
    assert.equal(parsed["event.action"], "http.server.start");
    assert.equal(parsed.message, "HTTP API listening");
    assert.equal(parsed["log.level"], "info");
    assert.equal(parsed["ecs.version"], ECS_VERSION);
    assert.equal(typeof parsed["@timestamp"], "string");
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
    assert.deepEqual(parsed.labels, { request_id: "abc", team: "demo" });
    assert.equal(parsed["labels.request_id"], undefined);
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
    assert.equal(parsed["trace.id"], "0af7651916cd43dd8448eb211c80319c");
    assert.equal(parsed["span.id"], "b7ad6b7169203331");
    assert.equal(parsed["http.request.method"], "GET");
    assert.equal(parsed["url.path"], "/workspaces");
    assert.equal(parsed["event.duration"], 45_000_000);
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
    assert.equal(parsed["error.message"], "boom");
    assert.equal(parsed["error.type"], "Error");
    assert.ok(String(parsed["error.stack_trace"]).includes("boom"));
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
    assert.equal(parsed.message, "hello");
    assert.equal(parsed["custom.field"], "yes");
  });
});

describe("mergeEnrichFields", () => {
  test("skips protected and existing keys", () => {
    const line: Record<string, unknown> = { message: "keep", "trace.id": "set" };
    mergeEnrichFields(line, { message: "nope", "ecs.version": "0.0.0", "trace.id": "bad", extra: 1 });
    assert.equal(line.message, "keep");
    assert.equal(line["ecs.version"], undefined);
    assert.equal(line["trace.id"], "set");
    assert.equal(line.extra, 1);
    assert.equal(PROTECTED_ECS_KEYS.has("message"), true);
  });
});

/*
Unit tests for W3C Trace Context parsing and formatting.
*/

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { extractTraceContext, formatTraceparent, parseTraceparent, randomSpanId } from "./trace.ts";

describe("parseTraceparent", () => {
  test("parses valid traceparent", () => {
    const parsed = parseTraceparent("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
    assert.deepEqual(parsed, {
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      sampled: true,
    });
  });

  test("returns undefined for invalid header", () => {
    assert.equal(parseTraceparent("not-a-traceparent"), undefined);
    assert.equal(parseTraceparent(""), undefined);
  });
});

describe("formatTraceparent", () => {
  test("formats traceparent with sampled flag", () => {
    assert.equal(
      formatTraceparent({
        traceId: "0af7651916cd43dd8448eb211c80319c",
        spanId: "b7ad6b7169203331",
        sampled: true,
      }),
      "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    );
  });
});

describe("extractTraceContext", () => {
  test("creates a new span id for the server hop", () => {
    const request = new Request("http://localhost/workspaces", {
      headers: {
        traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      },
    });
    const ctx = extractTraceContext(request);
    assert.equal(ctx?.traceId, "0af7651916cd43dd8448eb211c80319c");
    assert.equal(ctx?.parentSpanId, "b7ad6b7169203331");
    assert.equal((ctx?.spanId ?? "").length, 16);
    assert.notEqual(ctx?.spanId, "b7ad6b7169203331");
  });

  test("returns undefined when header is missing", () => {
    const request = new Request("http://localhost/workspaces");
    assert.equal(extractTraceContext(request), undefined);
  });
});

describe("randomSpanId", () => {
  test("returns 16 hex chars", () => {
    assert.match(randomSpanId(), /^[0-9a-f]{16}$/);
  });
});

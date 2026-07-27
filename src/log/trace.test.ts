/*
Unit tests for W3C Trace Context parsing and formatting.
*/

import { describe, expect, test } from "bun:test";
import { extractTraceContext, formatTraceparent, parseTraceparent, randomSpanId } from "./trace.ts";

describe("parseTraceparent", () => {
  test("parses valid traceparent", () => {
    const parsed = parseTraceparent("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
    expect(parsed).toEqual({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      sampled: true,
    });
  });

  test("returns undefined for invalid header", () => {
    expect(parseTraceparent("not-a-traceparent")).toBeUndefined();
    expect(parseTraceparent("")).toBeUndefined();
  });
});

describe("formatTraceparent", () => {
  test("formats traceparent with sampled flag", () => {
    expect(
      formatTraceparent({
        traceId: "0af7651916cd43dd8448eb211c80319c",
        spanId: "b7ad6b7169203331",
        sampled: true,
      }),
    ).toBe("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
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
    expect(ctx?.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    expect(ctx?.parentSpanId).toBe("b7ad6b7169203331");
    expect(ctx?.spanId).toHaveLength(16);
    expect(ctx?.spanId).not.toBe("b7ad6b7169203331");
  });

  test("returns undefined when header is missing", () => {
    const request = new Request("http://localhost/workspaces");
    expect(extractTraceContext(request)).toBeUndefined();
  });
});

describe("randomSpanId", () => {
  test("returns 16 hex chars", () => {
    expect(randomSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });
});

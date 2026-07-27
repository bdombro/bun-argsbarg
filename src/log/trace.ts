/*
W3C Trace Context (traceparent) parsing and formatting for HTTP request correlation.
*/

import { randomBytes } from "node:crypto";

/** Parsed trace context for one HTTP request hop. */
export interface IncomingTraceContext {
  /** 128-bit trace id (32 lowercase hex chars). */
  traceId: string;
  /** Parent span id from the incoming traceparent (caller's span). */
  parentSpanId: string;
  /** New span id for this server hop (16 lowercase hex chars). */
  spanId: string;
  /** Whether the trace is marked sampled in trace-flags. */
  sampled: boolean;
}

const TRACEPARENT_RE = /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i;

/** Generates a new 64-bit span id (16 hex chars). */
export function randomSpanId(): string {
  return randomBytes(8).toString("hex");
}

/** Parses a W3C `traceparent` header value, or returns undefined when invalid. */
export function parseTraceparent(header: string): { traceId: string; spanId: string; sampled: boolean } | undefined {
  const match = header.trim().match(TRACEPARENT_RE);
  if (!match) {
    return undefined;
  }
  const [, traceId, spanId, flags] = match;
  if (!traceId || !spanId || !flags) {
    return undefined;
  }
  const flagByte = Number.parseInt(flags, 16);
  return {
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    sampled: (flagByte & 0x01) === 0x01,
  };
}

/** Extracts trace context from an HTTP request, or undefined when no valid traceparent is present. */
export function extractTraceContext(request: Request): IncomingTraceContext | undefined {
  const parsed = parseTraceparent(request.headers.get("traceparent") ?? "");
  if (!parsed) {
    return undefined;
  }
  return {
    traceId: parsed.traceId,
    parentSpanId: parsed.spanId,
    spanId: randomSpanId(),
    sampled: parsed.sampled,
  };
}

/** Formats a W3C `traceparent` header value for the current hop. */
export function formatTraceparent(ctx: { traceId: string; spanId: string; sampled?: boolean }): string {
  const flags = ctx.sampled === false ? "00" : "01";
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

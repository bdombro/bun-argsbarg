/*
Unit tests for LogEmitter enrich and serialize hooks.
*/

import { describe, expect, test } from "bun:test";
import type { CliProgram } from "../core/types.ts";
import type { LogEnrichContext } from "./ecs.ts";
import { LogEmitter } from "./emitter.ts";

const program = {
  key: "testapp",
  version: "1.0.0",
  description: "test",
  handler: () => {},
} satisfies CliProgram;

function captureStderr(run: () => void): string {
  const chunks: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    run();
  } finally {
    process.stderr.write = original;
  }
  return chunks.join("");
}

describe("LogEmitter hooks", () => {
  test("serialize bypasses built-in ECS formatter", () => {
    const serialize = (ctx: LogEnrichContext) => JSON.stringify({ custom: true, msg: ctx.message });
    const emitter = new LogEmitter({
      program,
      resolved: { format: "json", access: true, errors: true, dev: false, serialize },
    });
    const out = captureStderr(() => emitter.emit({ level: "info", message: "hello" }));
    const parsed = JSON.parse(out.trim()) as Record<string, unknown>;
    expect(parsed.custom).toBe(true);
    expect(parsed.msg).toBe("hello");
    expect(parsed["ecs.version"]).toBeUndefined();
  });

  test("enrich adds fields to access logs", () => {
    const enrich = () => ({ "labels.team": "payments" });
    const emitter = new LogEmitter({
      program,
      resolved: { format: "json", access: true, errors: true, dev: false, enrich },
    });
    const out = captureStderr(() =>
      emitter.emitAccess({
        method: "GET",
        path: "/workspaces",
        status: 200,
        durationMs: 12,
        requestId: "req-1",
        clientIp: "127.0.0.1",
      }),
    );
    const parsed = JSON.parse(out.trim()) as Record<string, unknown>;
    expect(parsed["http.request.method"]).toBe("GET");
    expect(parsed["url.path"]).toBe("/workspaces");
    expect(parsed["labels.team"]).toBe("payments");
    expect(parsed["ecs.version"]).toBeDefined();
  });

  test("enrich receives http on access logs", () => {
    let seen: LogEnrichContext | undefined;
    const enrich = (ctx: LogEnrichContext) => {
      seen = ctx;
      return {};
    };
    const emitter = new LogEmitter({
      program,
      resolved: { format: "json", access: true, errors: true, dev: false, enrich },
    });
    captureStderr(() =>
      emitter.emitAccess({
        method: "GET",
        path: "/workspaces",
        status: 200,
        durationMs: 12,
      }),
    );
    expect(seen?.http).toEqual({
      method: "GET",
      path: "/workspaces",
      status: 200,
      durationMs: 12,
      clientIp: undefined,
    });
  });
});

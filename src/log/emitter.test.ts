/*
Unit tests for LogEmitter enrich and serialize hooks.
*/

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AppSpec } from "../core/types.ts";
import type { LogEnrichContext } from "./ecs.ts";
import { LogEmitter } from "./emitter.ts";

const program = {
  key: "testapp",
  version: "1.0.0",
  description: "test",
  handler: () => {},
} satisfies AppSpec;

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
      spec: program,
      resolved: { format: "json", access: true, errors: true, dev: false, serialize },
    });
    const out = captureStderr(() => emitter.emit({ level: "info", message: "hello" }));
    const parsed = JSON.parse(out.trim()) as Record<string, unknown>;
    assert.equal(parsed.custom, true);
    assert.equal(parsed.msg, "hello");
    assert.equal(parsed["ecs.version"], undefined);
  });

  test("enrich adds fields to access logs", () => {
    const enrich = () => ({ "labels.team": "payments" });
    const emitter = new LogEmitter({
      spec: program,
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
    assert.equal(parsed["http.request.method"], "GET");
    assert.equal(parsed["url.path"], "/workspaces");
    assert.equal(parsed["labels.team"], "payments");
    assert.notEqual(parsed["ecs.version"], undefined);
  });

  test("enrich receives http on access logs", () => {
    let seen: LogEnrichContext | undefined;
    const enrich = (ctx: LogEnrichContext) => {
      seen = ctx;
      return {};
    };
    const emitter = new LogEmitter({
      spec: program,
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
    assert.deepEqual(seen?.http, {
      method: "GET",
      path: "/workspaces",
      status: 200,
      durationMs: 12,
      clientIp: undefined,
    });
  });
});

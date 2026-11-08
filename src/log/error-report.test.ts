/*
Tests for log/error-report: DSN to envelope URL, stack parsing, env override and disabling,
the posted envelope, and that the runtime reports unexpected failures only.
*/

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { argsbarg } from "../runtime/cli.ts";
import { createErrorReporter, parseStackFrames, sentryEnvelopeUrl } from "./error-report.ts";

/** Real fetch, restored after each test. */
const realFetch = globalThis.fetch;

/** Replaces fetch with a recorder and returns the recorded bodies by URL. */
function recordFetch(): { url: string; body: string }[] {
  const calls: { url: string; body: string }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body) });
    return new Response("{}");
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TEST_ERROR_DSN;
});

describe("sentryEnvelopeUrl", () => {
  test("builds the envelope endpoint from a DSN", () => {
    assert.equal(
      sentryEnvelopeUrl("https://abc@bugsink.example.com/7"),
      "https://bugsink.example.com/api/7/envelope/?sentry_key=abc&sentry_version=7",
    );
  });
  test("is undefined for an empty DSN", () => {
    assert.equal(sentryEnvelopeUrl(""), undefined);
  });
});

describe("parseStackFrames", () => {
  test("parses named and bare frames, oldest first", () => {
    const frames = parseStackFrames("Error: x\n    at run (/a/b.js:1:2)\n    at /c/d.js:3:4");
    assert.deepEqual(frames, [
      { function: "?", filename: "/c/d.js", lineno: 3, colno: 4 },
      { function: "run", filename: "/a/b.js", lineno: 1, colno: 2 },
    ]);
  });
});

describe("createErrorReporter", () => {
  test("posts an envelope with the exception", async () => {
    const calls = recordFetch();
    await createErrorReporter({ dsn: "https://k@h.example/2" }).reportError(new Error("boom"), { step: "x" });
    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /^https:\/\/h\.example\/api\/2\/envelope\//);
    const event = JSON.parse(calls[0]?.body.split("\n")[2] ?? "{}");
    assert.equal(event.exception.values[0].value, "boom");
    assert.deepEqual(event.extra, { step: "x" });
  });
  test("an empty env override disables reporting", async () => {
    const calls = recordFetch();
    process.env.TEST_ERROR_DSN = "";
    await createErrorReporter({ dsn: "https://k@h.example/2", env: "TEST_ERROR_DSN" }).reportMessage("m");
    assert.equal(calls.length, 0);
  });
  test("the env override replaces the DSN", async () => {
    const calls = recordFetch();
    process.env.TEST_ERROR_DSN = "https://k@other.example/9";
    await createErrorReporter({ dsn: "https://k@h.example/2", env: "TEST_ERROR_DSN" }).reportMessage("m", "info");
    assert.match(calls[0]?.url ?? "", /other\.example\/api\/9\//);
    assert.equal(JSON.parse(calls[0]?.body.split("\n")[2] ?? "{}").level, "info");
  });
  test("never throws when the collector is unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    await createErrorReporter({ dsn: "https://k@h.example/2" }).reportError("x");
  });
});

describe("app errorReporter", () => {
  test("reports unexpected handler failures, not input errors", async () => {
    const reported: unknown[] = [];
    const app = argsbarg({
      key: "rep",
      description: "Reporter test.",
      version: "1.0.0",
      errorReporter: {
        reportError: async (error) => {
          reported.push(error);
        },
        reportMessage: async () => {},
      },
      commands: [
        {
          key: "fail",
          description: "Throws.",
          handler: () => {
            throw new Error("kaboom");
          },
        },
      ],
    });
    const failed = await app.invoke(["fail"]);
    assert.equal(failed.kind, "error");
    const unknown = await app.invoke(["nope"]);
    assert.equal(unknown.kind, "error");
    assert.equal(reported.length, 1);
    assert.equal((reported[0] as Error).message, "kaboom");
  });
});

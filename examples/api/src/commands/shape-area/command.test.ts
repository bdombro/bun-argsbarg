import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type AppSpec, argsbarg } from "argsbarg";
import { shapeAreaTestSpec } from "./command.ts";

const baseSpec: AppSpec = {
  key: "example-api",
  version: "1.0.0",
  description: "Demo.",
  httpServer: { enabled: true },
  commands: [],
};

describe("shape-area command", () => {
  const cli = argsbarg(shapeAreaTestSpec(baseSpec));

  test("computes the area for each union branch", async () => {
    const rect = await cli.invoke(["shape-area"], {
      invocation: "http",
      toolArgs: { kind: "rect", width: 2, height: 3 },
    });
    assert.deepEqual(rect.response?.body, { area: 6 });

    const circle = await cli.invoke(["shape-area"], { invocation: "http", toolArgs: { kind: "circle", radius: 1 } });
    assert.deepEqual(circle.response?.body, { area: Math.PI });
  });

  test("rejects fields from the wrong branch via inputSchema", async () => {
    const result = await cli.invoke(["shape-area"], {
      invocation: "http",
      toolArgs: { kind: "circle", radius: 1, width: 2 },
    });
    assert.equal(result.kind, "error");
  });
});

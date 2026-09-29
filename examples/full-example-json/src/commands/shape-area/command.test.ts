import { describe, expect, test } from "bun:test";
import { Cli, type CliProgram } from "argsbarg";
import { shapeAreaTestProgram } from "./command.ts";

const baseProgram = {
  key: "full-example",
  version: "1.0.0",
  description: "Demo.",
  httpServer: { enabled: true },
  commands: [],
} satisfies CliProgram;

describe("shape-area command", () => {
  const cli = new Cli(shapeAreaTestProgram(baseProgram));

  test("computes the area for each union branch", async () => {
    const rect = await cli.invoke(["shape-area"], {
      invocation: "http",
      toolArgs: { kind: "rect", width: 2, height: 3 },
    });
    expect(rect.response?.body).toEqual({ area: 6 });

    const circle = await cli.invoke(["shape-area"], { invocation: "http", toolArgs: { kind: "circle", radius: 1 } });
    expect(circle.response?.body).toEqual({ area: Math.PI });
  });

  test("rejects fields from the wrong branch via inputSchema", async () => {
    const result = await cli.invoke(["shape-area"], {
      invocation: "http",
      toolArgs: { kind: "circle", radius: 1, width: 2 },
    });
    expect(result.kind).toBe("error");
  });
});

import { describe, expect, test } from "bun:test";
import { Cli, type CliProgram } from "argsbarg";
import { renderJsonCommand, renderJsonTestProgram } from "./command.ts";

const baseProgram = {
  key: "full-example",
  version: "1.0.0",
  description: "Demo.",
  httpServer: { enabled: true },
  commands: [],
} satisfies CliProgram;

describe("render-json command", () => {
  const program = renderJsonTestProgram(baseProgram);
  const cli = new Cli(program);

  test("HTTP invoke returns echoed message", async () => {
    const result = await cli.invoke(["render-json"], {
      invocation: "http",
      toolArgs: { message: "hello" },
    });
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({ message: "hello" });
  });

  test("rejects invalid input before handler via inputSchema", async () => {
    let handlerCalled = false;
    const badProgram = renderJsonTestProgram({
      ...baseProgram,
      commands: [
        {
          ...renderJsonCommand,
          handler: () => {
            handlerCalled = true;
          },
        },
      ],
    });
    const result = await new Cli(badProgram).invoke(["render-json"], {
      invocation: "http",
      toolArgs: { message: 123 },
    });
    expect(result.kind).toBe("error");
    expect(handlerCalled).toBe(false);
  });
});

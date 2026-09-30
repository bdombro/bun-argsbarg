import { describe, expect, test } from "bun:test";
import { type AppSpec, argsbarg, command } from "argsbarg";
import { renderJsonCommand, renderJsonTestSpec } from "./command.ts";

const baseSpec: AppSpec = {
  key: "example-agent-plugin",
  version: "1.0.0",
  description: "Demo.",
  httpServer: { enabled: true },
  commands: [],
};

describe("render-json command", () => {
  const spec = renderJsonTestSpec(baseSpec);
  const cli = argsbarg(spec);

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
    const badProgram = renderJsonTestSpec({
      ...baseSpec,
      commands: [
        command({
          ...renderJsonCommand,
          handler: () => {
            handlerCalled = true;
          },
        }),
      ],
    });
    const result = await argsbarg(badProgram).invoke(["render-json"], {
      invocation: "http",
      toolArgs: { message: 123 },
    });
    expect(result.kind).toBe("error");
    expect(handlerCalled).toBe(false);
  });
});

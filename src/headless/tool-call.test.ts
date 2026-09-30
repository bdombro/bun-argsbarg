/* Unit tests for shared headless error text (MCP and HTTP) and wrapped MCP tool calls. */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { z } from "zod";
import { argsbarg, type CommandContext } from "../index.ts";
import { collectMcpTools } from "../mcp/tools.ts";
import { requireMcpTool, testProgram } from "../test/fixtures.ts";
import {
  executeHeadlessToolCall,
  type HeadlessToolCallFailure,
  headlessFailureMcpMessage,
  headlessFailureToHttpResponse,
} from "./tool-call.ts";

/** Builds a failed headless result with the given error message. */
function invokeFailure(
  /** Full error text from the leaf. */
  message: string,
): HeadlessToolCallFailure {
  return {
    exitCode: 1,
    kind: "invoke",
    message,
    ok: false,
    stderr: "",
    stdout: "",
  };
}

describe("headless error text", () => {
  const multiline =
    'cannot copy tab "Spec" losslessly (1 smart chip(s): "Ada"). Use force: true.\n' +
    '  • node h.x: contains 1 smart chip(s) ("Ada")\n\n' +
    "Google Docs REST API has no native tab duplication endpoint.";

  test("MCP and HTTP both keep the full multi-line error", async () => {
    assert.equal(headlessFailureMcpMessage(invokeFailure(multiline)), multiline);
    const body = (await headlessFailureToHttpResponse(invokeFailure(multiline)).json()) as { error: string };
    assert.equal(body.error, multiline);
  });
});

describe("wrapped MCP tools", () => {
  /** Union input leaf that echoes its inputs; output is an array so structuredContent gets wrapped too. */
  const program = testProgram({
    key: "wrapcall",
    description: "Wrapped call demo.",
    mcpServer: { enabled: true },
    commands: [
      {
        key: "edit",
        description: "Edit.",
        kind: "document",
        inputSchema: z.discriminatedUnion("kind", [
          z.strictObject({ kind: z.literal("append"), text: z.string() }),
          z.strictObject({ kind: z.literal("replace"), find: z.string(), text: z.string() }),
        ]),
        outputSchema: z.array(z.unknown()),
        handler: (ctx: CommandContext) => [ctx.inputs],
      },
    ],
  });
  const cli = argsbarg(program);
  const tool = requireMcpTool(collectMcpTools(program), "edit");

  test("unwraps input and wraps structuredContent under result", async () => {
    const result = await executeHeadlessToolCall(cli, tool, { input: { kind: "append", text: "hi" } }, "mcp");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.mcpResult.structuredContent, { result: [{ kind: "append", text: "hi" }] });
    }
  });

  test("still validates the exact union after unwrapping", async () => {
    const result = await executeHeadlessToolCall(
      cli,
      tool,
      { input: { kind: "append", text: "hi", find: "x" } },
      "mcp",
    );
    assert.equal(result.ok, false);
  });

  test("rejects arguments that are not wrapped", async () => {
    const result = await executeHeadlessToolCall(cli, tool, { kind: "append", text: "hi" }, "mcp");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "argv");
      assert.ok(result.message.includes('single "input" object property'));
    }
  });
});

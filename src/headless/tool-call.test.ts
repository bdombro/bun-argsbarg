/* Unit tests for shared headless error text (MCP and HTTP) and wrapped MCP tool calls. */

import { describe, expect, test } from "bun:test";
import { Cli, type CliContext } from "../index.ts";
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
    expect(headlessFailureMcpMessage(invokeFailure(multiline))).toBe(multiline);
    const body = (await headlessFailureToHttpResponse(invokeFailure(multiline)).json()) as { error: string };
    expect(body.error).toBe(multiline);
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
        inputSchema: {
          anyOf: [{ $ref: "#/definitions/Append" }, { $ref: "#/definitions/Replace" }],
          definitions: {
            Append: {
              type: "object",
              properties: { kind: { const: "append" }, text: { type: "string" } },
              required: ["kind", "text"],
              additionalProperties: false,
            },
            Replace: {
              type: "object",
              properties: { kind: { const: "replace" }, find: { type: "string" }, text: { type: "string" } },
              required: ["kind", "find", "text"],
              additionalProperties: false,
            },
          },
        },
        outputSchema: { type: "array" },
        handler: (ctx: CliContext) => [ctx.inputs],
      },
    ],
  });
  const cli = new Cli(program);
  const tool = requireMcpTool(collectMcpTools(program), "edit");

  test("unwraps input and wraps structuredContent under result", async () => {
    const result = await executeHeadlessToolCall(cli, tool, { input: { kind: "append", text: "hi" } }, "mcp");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mcpResult.structuredContent).toEqual({ result: [{ kind: "append", text: "hi" }] });
    }
  });

  test("still validates the exact union after unwrapping", async () => {
    const result = await executeHeadlessToolCall(
      cli,
      tool,
      { input: { kind: "append", text: "hi", find: "x" } },
      "mcp",
    );
    expect(result.ok).toBe(false);
  });

  test("rejects arguments that are not wrapped", async () => {
    const result = await executeHeadlessToolCall(cli, tool, { kind: "append", text: "hi" }, "mcp");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("argv");
      expect(result.message).toContain('single "input" object property');
    }
  });
});

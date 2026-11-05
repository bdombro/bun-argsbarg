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
  /** Union input leaf that echoes its inputs in a wrapped array. */
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

  test("unwraps input and wraps array structuredContent", async () => {
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

test("MCP validates raw JSON outputs without coercing or defaulting handler results", async () => {
  for (const [schema, value, valid] of [
    [z.string(), "hello", true],
    [z.number(), 42, true],
    [z.boolean(), false, true],
    [z.null(), null, true],
    [z.array(z.string()), ["hello"], true],
    [z.strictObject({ ok: z.boolean() }), { ok: true }, true],
    [z.string(), 42, false],
    [z.coerce.string(), 42, false],
    [z.object({ ok: z.boolean().default(true) }), {}, false],
  ] as const) {
    const program = testProgram({
      key: "output",
      description: "Output validation.",
      mcpServer: { enabled: true, validateOutputs: true },
      commands: [{ key: "run", description: "Run.", outputSchema: schema, handler: () => value }],
    });
    const tool = requireMcpTool(collectMcpTools(program), "run");
    const result = await executeHeadlessToolCall(argsbarg(program), tool, {}, "mcp");
    assert.equal(result.ok, valid, JSON.stringify(value));
    if (result.ok) {
      const expected = tool.outputWrapped ? { result: value } : value;
      assert.deepEqual(result.mcpResult.structuredContent, expected);
      assert.deepEqual(JSON.parse(result.mcpResult.content[0]?.text ?? ""), expected);
    }
  }
});

test("MCP preserves released output contracts unless validation is enabled", async () => {
  for (const body of ["hello", 42]) {
    const program = testProgram({
      commands: [{ description: "Return output.", handler: () => body, key: "run", outputSchema: z.string() }],
      description: "Existing outputs.",
      key: "output",
      mcpServer: { enabled: true },
    });
    const result = await executeHeadlessToolCall(
      argsbarg(program),
      requireMcpTool(collectMcpTools(program), "run"),
      {},
      "mcp",
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.mcpResult.structuredContent, {
        result: typeof body === "string" ? { content: body, contentType: "text/plain; charset=utf-8" } : body,
      });
    }
  }
});

test("MCP turns non-serializable handler output into a tool failure", async () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const program = testProgram({
    commands: [{ description: "Return invalid JSON.", handler: () => circular, key: "run" }],
    description: "Invalid output.",
    key: "output",
    mcpServer: { enabled: true },
  });
  const result = await executeHeadlessToolCall(
    argsbarg(program),
    requireMcpTool(collectMcpTools(program), "run"),
    {},
    "mcp",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /circular/i);
});

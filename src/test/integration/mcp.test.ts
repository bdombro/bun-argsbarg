/*
Domain-specific regression tests (split from index.test.ts).
*/

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { schemaExport } from "../../core/schema.ts";
import { cliValidateProgram } from "../../core/validate.ts";
import type { AppSpec } from "../../index.ts";
import { buildToolCallSuccessFromResponse } from "../../mcp/result.ts";
import {
  collectMcpTools,
  mcpToolCallToArgv,
  mcpToolDescription,
  mcpToolName,
  sanitizeToolSegment,
} from "../../mcp/tools.ts";
import { mcpRequest, nestedMcpFixture, requireMcpTool, runNode, testProgram } from "../fixtures.ts";

test("sanitizeToolSegment normalizes dotted app keys", () => {
  assert.equal(sanitizeToolSegment("minimal.ts"), "minimal_ts");
});

test("mcpToolDescription formats CLI path and root-leaf prefix", () => {
  assert.equal(
    mcpToolDescription(["stat", "owner", "lookup"], "nested.ts", "Resolve owner info."),
    "stat owner lookup — Resolve owner info.",
  );
  assert.equal(mcpToolDescription(["read"], "nested.ts", "Print files."), "read — Print files.");
  assert.equal(mcpToolDescription([], "helloapp", "Tiny demo."), "helloapp — Tiny demo.");
});

test("mcpToolName sanitizes path segments to underscores", () => {
  assert.equal(mcpToolName(nestedMcpFixture, ["stat", "owner", "lookup"]), "stat_owner_lookup");
  assert.equal(mcpToolName(nestedMcpFixture, ["render-invoice"]), "render_invoice");
});

test("collectMcpTools lists user commands with a handler only", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const names = tools.map((t) => t.name);
  assert.ok(names.includes("stat_owner_lookup"));
  const lookup = requireMcpTool(tools, "stat_owner_lookup");
  assert.equal(lookup.description, "stat owner lookup — Resolve owner info.");
  assert.ok(names.includes("read"));
  assert.ok(!names.includes("hidden"));
  assert.ok(!names.includes("configure"));
  assert.ok(!names.includes("mcp"));
  assert.ok(!names.includes("completion"));
});

/** Tests that collectMcpTools appends leaf notes to MCP tool description. */
test("collectMcpTools appends leaf notes to MCP tool description", () => {
  const root = testProgram({
    key: "app",
    version: "1.0.0",
    description: "Notes demo.",
    mcpServer: { enabled: true },
    commands: [
      {
        key: "run",
        description: "Run.",
        notes: "Use `--json` for structured output.",
        handler: () => {},
      },
    ],
  });
  const tools = collectMcpTools(root);
  assert.equal(tools[0]?.description, "run — Run.\n\nUse `--json` for structured output.");
});

/** Tests that collectMcpTools appends notes after mcpTool.description override. */
test("collectMcpTools appends notes after mcpTool.description override", () => {
  const root = testProgram({
    key: "app",
    version: "1.0.0",
    description: "Notes demo.",
    mcpServer: { enabled: true },
    commands: [
      {
        key: "run",
        description: "Run.",
        notes: "Operational hint.",
        mcpTool: { description: "Custom MCP text." },
        handler: () => {},
      },
    ],
  });
  const tools = collectMcpTools(root);
  assert.equal(tools[0]?.description, "Custom MCP text.\n\nOperational hint.");
});

/** Tests that collectMcpTools resolves {argsbarg:program} in appended notes. */
test("collectMcpTools resolves {argsbarg:program} in appended notes", () => {
  const root = testProgram({
    key: "myapp",
    version: "1.0.0",
    description: "Notes demo.",
    mcpServer: { enabled: true },
    commands: [
      {
        key: "run",
        description: "Run.",
        notes: "See `{argsbarg:program} docs cli`.",
        handler: () => {},
      },
    ],
  });
  const tools = collectMcpTools(root);
  assert.ok((tools[0]?.description ?? "").includes("See `myapp docs cli`."));
});

/** SchemaExport includes leaf outputSchema. */
test("schemaExport includes leaf outputSchema", () => {
  const root = testProgram({
    key: "app",
    version: "1.0.0",
    description: "Schema export demo.",
    mcpServer: { enabled: true },
    commands: [
      {
        key: "run",
        description: "Run.",
        outputSchema: z.object({ ok: z.boolean().optional() }),
        handler: () => {},
      },
    ],
  });
  const schema = schemaExport(root);
  assert.partialDeepStrictEqual(schema.commands?.[0]?.outputSchema, {
    type: "object",
    properties: { ok: { type: "boolean" } },
  });
});

/** Tests that outputSchema must be a Zod schema (argsbarg 8 migration error). */
test("outputSchema must be a Zod schema", () => {
  const root = testProgram({
    key: "app",
    version: "1.0.0",
    description: "Bad output schema.",
    commands: [
      {
        key: "run",
        description: "Run.",
        outputSchema: { type: "object" } as unknown as z.ZodType,
        handler: () => {},
      },
    ],
  });
  assert.throws(() => cliValidateProgram(root), /outputSchema on run must be a Zod schema/);
});

test("collectMcpTools uses leaf-local options in inputSchema", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const lookup = requireMcpTool(tools, "stat_owner_lookup");
  const schema = lookup.inputSchema as { properties: Record<string, unknown>; required?: string[] };
  assert.equal(schema.properties.json, undefined);
  assert.notEqual(schema.properties["user-name"], undefined);
  assert.ok((schema.required ?? []).includes("path"));
});

/** Tests that collectMcpTools includes outputSchema when set on leaf. */
test("collectMcpTools includes outputSchema when set on leaf", () => {
  const root = testProgram({
    key: "app",
    version: "1.0.0",
    description: "Output schema demo.",
    mcpServer: { enabled: true },
    commands: [
      {
        key: "run",
        description: "Run with JSON output.",
        outputSchema: z.object({ ok: z.boolean() }),
        handler: () => {},
      },
    ],
  });
  const tools = collectMcpTools(root);
  assert.equal(tools.length, 1);
  assert.partialDeepStrictEqual(tools[0]?.outputSchema, {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
  });
});

test("collectMcpTools omits outputSchema when leaf has none", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const lookup = requireMcpTool(tools, "stat_owner_lookup");
  assert.equal(lookup.outputSchema, undefined);
});

test("mcpToolCallToArgv builds nested lookup argv", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const lookup = requireMcpTool(tools, "stat_owner_lookup");
  const argv = mcpToolCallToArgv(nestedMcpFixture, lookup, {
    "user-name": "alice",
    path: "./x",
  });
  assert.deepEqual(argv, ["stat", "owner", "lookup", "--user-name", "alice", "./x"]);
});

test("mcpToolCallToArgv expands varargs positionals", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = requireMcpTool(tools, "read");
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: ["a", "b"] });
  assert.deepEqual(argv, ["read", "a", "b"]);
});

/** Tests that `configure` is an ordinary command name (no longer a built-in). */
test("command name configure is allowed", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "configure",
        description: "bad",
        handler: () => {},
      },
    ],
  });
  assert.doesNotThrow(() => cliValidateProgram(root));
});

/** Tests that top-level command name mcp is allowed without mcpServer. */
test("top-level command name mcp is allowed without mcpServer", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "mcp",
        description: "user command",
        handler: () => {},
      },
    ],
  });
  assert.doesNotThrow(() => cliValidateProgram(root));
});

/** Tests that top-level command name mcp is rejected when mcpServer is enabled. */
test("top-level command name mcp is rejected when mcpServer is enabled", () => {
  const root = testProgram({
    key: "app",
    description: "",
    mcpServer: { enabled: true },
    commands: [
      {
        key: "mcp",
        description: "user command",
        handler: () => {},
      },
    ],
  });
  assert.throws(() => cliValidateProgram(root), /Reserved command name: mcp/);
});

/** McpServer on non-root node is rejected. */
test("mcpServer on non-root node is rejected", () => {
  const root = {
    key: "app",
    version: "0.0.0",
    description: "",
    commands: [
      {
        key: "x",
        description: "cmd",
        mcpServer: { enabled: true },
        handler: () => {},
      },
    ],
  } as unknown as AppSpec;
  assert.throws(() => cliValidateProgram(root), /mcpServer is only supported on the app root/);
});

test("mcpTool on root is rejected", () => {
  const root = testProgram({
    key: "app",
    description: "",
    mcpTool: { enabled: false },
    handler: () => {},
  });
  assert.throws(() => cliValidateProgram(root), /mcpTool is only supported on commands with a handler/);
});

/** McpTool on routing node is rejected. */
test("mcpTool on routing node is rejected", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "group",
        description: "group",
        mcpTool: { enabled: false },
        commands: [
          {
            key: "leaf",
            description: "leaf",
            handler: () => {},
          },
        ],
      },
    ],
  });
  assert.throws(() => cliValidateProgram(root), /mcpTool is only supported on commands with a handler/);
});

test("buildToolCallSuccessFromResponse maps JSON object", () => {
  const result = buildToolCallSuccessFromResponse({ body: { a: 1 } });
  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent, { a: 1 });
  assert.equal(result.content[0]?.text, JSON.stringify({ a: 1 }, null, 2));
});

test("buildToolCallSuccessFromResponse maps string body", () => {
  const result = buildToolCallSuccessFromResponse({
    body: "lookup user=x",
    contentType: "text/plain; charset=utf-8",
  });
  assert.deepEqual(result.structuredContent, {
    content: "lookup user=x",
    contentType: "text/plain; charset=utf-8",
  });
  assert.equal(result.content[0]?.text, "lookup user=x");
});

test("buildToolCallSuccessFromResponse maps binary body as base64", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const result = buildToolCallSuccessFromResponse({
    body: bytes,
    contentType: "application/pdf",
  });
  assert.deepEqual(result.structuredContent, {
    data: "JVBERg==",
    contentType: "application/pdf",
    encoding: "base64",
  });
});

test("MCP initialize returns tools and resources capabilities", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }]);
  const res = responses.get(1) as { result: { capabilities: Record<string, unknown> } };
  assert.notEqual(res.result.capabilities.tools, undefined);
  assert.notEqual(res.result.capabilities.resources, undefined);
});

test("MCP initialize echoes a supported protocol version", async () => {
  for (const version of ["2024-11-05", "2025-06-18"]) {
    const responses = await mcpRequest([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: version } },
    ]);
    const res = responses.get(1) as { result: { protocolVersion: string } };
    assert.equal(res.result.protocolVersion, version);
  }
});

test("MCP initialize answers unsupported or missing versions with the newest", async () => {
  for (const params of [{ protocolVersion: "2099-01-01" }, {}]) {
    const responses = await mcpRequest([{ jsonrpc: "2.0", id: 1, method: "initialize", params }]);
    const res = responses.get(1) as { result: { protocolVersion: string } };
    assert.equal(res.result.protocolVersion, "2025-06-18");
  }
});

test("2024-11-05 sessions omit outputSchema and structuredContent", async () => {
  const readme = join(import.meta.dirname, "..", "..", "..", "README.md");
  const responses = await mcpRequest([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "stat_owner_lookup", arguments: { path: readme, "user-name": "test" } },
    },
  ]);
  const listRes = responses.get(2) as { result: { tools: { name: string; outputSchema?: unknown }[] } };
  const lookup = listRes.result.tools.find((t) => t.name === "stat_owner_lookup");
  assert.notEqual(lookup, undefined);
  assert.equal(lookup?.outputSchema, undefined);

  const callRes = responses.get(3) as { result: { structuredContent?: unknown; isError: boolean } };
  assert.equal(callRes.result.isError, false);
  assert.equal(callRes.result.structuredContent, undefined);
});

test("MCP initialize includes configured instructions", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }], {
    script: "src/test/mcp-integration-fixture.ts",
  });
  const res = responses.get(1) as { result: { instructions?: string } };
  assert.equal(res.result.instructions, "Read the fixture skill.");
});

test("MCP startup warns about oversized tools on stderr", async () => {
  const { stdout, stderr } = runNode(["src/test/mcp-size-fixture.ts", "mcp"], {
    input: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`,
  });

  assert.ok(stderr.includes("description is 3,"));

  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line));
  }
});

test("MCP tools/list includes stat_owner_lookup", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }]);
  const res = responses.get(2) as {
    result: { tools: { name: string; inputSchema: { required?: string[] } }[] };
  };
  const lookup = res.result.tools.find((t) => t.name === "stat_owner_lookup");
  assert.notEqual(lookup, undefined);
  assert.ok((lookup?.inputSchema.required ?? []).includes("path"));
});

/** MCP tools/call runs stat_owner_lookup. */
test("MCP tools/call runs stat_owner_lookup", async () => {
  const readme = join(import.meta.dirname, "..", "..", "..", "README.md");
  const responses = await mcpRequest([
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "stat_owner_lookup",
        arguments: { path: readme, "user-name": "test" },
      },
    },
  ]);
  const res = responses.get(4) as {
    result: { content: { text: string }[]; structuredContent?: { user: string; path: string }; isError: boolean };
  };
  assert.equal(res.result.isError, false);
  assert.deepEqual(res.result.structuredContent, { user: "test", path: readme });
});

/** MCP tools/call returns structuredContent for JSON stdout. */
test("MCP tools/call returns structuredContent for JSON stdout", async () => {
  const readme = join(import.meta.dirname, "..", "..", "..", "README.md");
  const responses = await mcpRequest([
    {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "stat_owner_lookup",
        arguments: { path: readme, "user-name": "test", json: true },
      },
    },
  ]);
  const res = responses.get(6) as {
    result: {
      content: { text: string }[];
      structuredContent?: { user: string; path: string };
      isError: boolean;
    };
  };
  assert.equal(res.result.isError, false);
  assert.deepEqual(res.result.structuredContent, { user: "test", path: readme });
});

/** MCP tools/call errors on missing required positional. */
test("MCP tools/call errors on missing required positional", async () => {
  const responses = await mcpRequest([
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "stat_owner_lookup", arguments: { "user-name": "test" } },
    },
  ]);
  const res = responses.get(5) as { result: { isError: boolean; content: { text: string }[] } };
  assert.equal(res.result.isError, true);
  assert.ok((res.result.content[0]?.text ?? "").includes("Missing argument: path"));
});

test("MCP ping returns empty result", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 99, method: "ping", params: {} }]);
  const res = responses.get(99) as { result: Record<string, never> };
  assert.deepEqual(res.result, {});
});

test("minimal.ts mcp without opt-in fails", async () => {
  const { stderr, exitCode } = runNode(["examples/minimal.ts", "mcp"]);
  assert.equal(exitCode, 1);
  assert.ok(stderr.toString().includes("MCP is not available"));
});

test("MCP resources/list includes custom resource", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 10, method: "resources/list", params: {} }], {
    script: "src/test/mcp-integration-fixture.ts",
  });
  const res = responses.get(10) as { result: { resources: { uri: string }[] } };
  const uris = res.result.resources.map((r) => r.uri);
  assert.deepEqual(uris, ["test://hello"]);
});

test("MCP resources/read returns custom resource body", async () => {
  const responses = await mcpRequest(
    [{ jsonrpc: "2.0", id: 11, method: "resources/read", params: { uri: "test://hello" } }],
    { script: "src/test/mcp-integration-fixture.ts" },
  );
  const res = responses.get(11) as { result: { contents: { text: string }[] } };
  assert.equal(res.result.contents[0]?.text, "hello resource");
});

test("MCP resources/read unknown URI returns error", async () => {
  const responses = await mcpRequest(
    [{ jsonrpc: "2.0", id: 12, method: "resources/read", params: { uri: "missing://nope" } }],
    { script: "src/test/mcp-integration-fixture.ts" },
  );
  const res = responses.get(12) as { error: { code: number } };
  assert.equal(res.error.code, -32602);
});

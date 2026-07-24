/*
Domain-specific regression tests (split from index.test.ts).
*/

import { expect, test } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";
import { cliSchemaExport } from "~/core/schema.ts";
import { cliValidateProgram } from "~/core/validate.ts";
import type { CliProgram } from "~/index";
import { buildToolCallSuccessFromResponse } from "~/mcp/result.ts";
import {
  collectMcpTools,
  mcpToolCallToArgv,
  mcpToolDescription,
  mcpToolName,
  sanitizeToolSegment,
} from "~/mcp/tools.ts";
import { mcpRequest, nestedMcpFixture, testProgram } from "~/test/fixtures.ts";

test("sanitizeToolSegment normalizes dotted app keys", () => {
  expect(sanitizeToolSegment("minimal.ts")).toBe("minimal_ts");
});

test("mcpToolDescription formats CLI path and root-leaf prefix", () => {
  expect(mcpToolDescription(["stat", "owner", "lookup"], "nested.ts", "Resolve owner info.")).toBe(
    "stat owner lookup — Resolve owner info.",
  );
  expect(mcpToolDescription(["read"], "nested.ts", "Print files.")).toBe("read — Print files.");
  expect(mcpToolDescription([], "helloapp", "Tiny demo.")).toBe("helloapp — Tiny demo.");
});

test("mcpToolName sanitizes path segments to underscores", () => {
  expect(mcpToolName(nestedMcpFixture, ["stat", "owner", "lookup"])).toBe("stat_owner_lookup");
  expect(mcpToolName(nestedMcpFixture, ["render-invoice"])).toBe("render_invoice");
});

test("collectMcpTools lists user leaf commands only", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const names = tools.map((t) => t.name);
  expect(names).toContain("stat_owner_lookup");
  const lookup = tools.find((t) => t.name === "stat_owner_lookup")!;
  expect(lookup.description).toBe("stat owner lookup — Resolve owner info.");
  expect(names).toContain("read");
  expect(names).not.toContain("hidden");
  expect(names).not.toContain("configure");
  expect(names).not.toContain("mcp");
  expect(names).not.toContain("completion");
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
  expect(tools[0]?.description).toBe("run — Run.\n\nUse `--json` for structured output.");
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
  expect(tools[0]?.description).toBe("Custom MCP text.\n\nOperational hint.");
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
  expect(tools[0]?.description).toContain("See `myapp docs cli`.");
});

/** CliSchemaExport includes leaf outputSchema. */
test("cliSchemaExport includes leaf outputSchema", () => {
  const root = testProgram({
    key: "app",
    version: "1.0.0",
    description: "Schema export demo.",
    mcpServer: { enabled: true },
    commands: [
      {
        key: "run",
        description: "Run.",
        outputSchema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
        },
        handler: () => {},
      },
    ],
  });
  const schema = cliSchemaExport(root);
  expect(schema.commands?.[0]?.outputSchema).toEqual({
    type: "object",
    properties: { ok: { type: "boolean" } },
  });
});

/** Tests that outputSchema must be a JSON Schema object. */
test("outputSchema must be a JSON Schema object", () => {
  const root = testProgram({
    key: "app",
    version: "1.0.0",
    description: "Bad output schema.",
    commands: [
      {
        key: "run",
        description: "Run.",
        outputSchema: [] as unknown as Record<string, unknown>,
        handler: () => {},
      },
    ],
  });
  expect(() => cliValidateProgram(root)).toThrow(/outputSchema must be a JSON Schema object/);
});

test("collectMcpTools merges parent options into inputSchema", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const lookup = tools.find((t) => t.name === "stat_owner_lookup")!;
  const schema = lookup.inputSchema as { properties: Record<string, unknown>; required?: string[] };
  expect(schema.properties.json).toBeDefined();
  expect(schema.required).toContain("path");
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
        outputSchema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
        handler: () => {},
      },
    ],
  });
  const tools = collectMcpTools(root);
  expect(tools).toHaveLength(1);
  expect(tools[0]?.outputSchema).toEqual({
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
  });
});

test("collectMcpTools omits outputSchema when leaf has none", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const lookup = tools.find((t) => t.name === "stat_owner_lookup")!;
  expect(lookup.outputSchema).toBeUndefined();
});

test("mcpToolCallToArgv builds nested lookup argv", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const lookup = tools.find((t) => t.name === "stat_owner_lookup")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, lookup, {
    "user-name": "alice",
    path: "./x",
    json: true,
  });
  expect(argv).toEqual(["stat", "owner", "lookup", "--json", "--user-name", "alice", "./x"]);
});

test("mcpToolCallToArgv expands varargs positionals", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = tools.find((t) => t.name === "read")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: ["a", "b"] });
  expect(argv).toEqual(["read", "a", "b"]);
});

/** Tests that reserved command name configure is rejected. */
test("reserved command name configure is rejected", () => {
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
  expect(() => cliValidateProgram(root)).toThrow(/Reserved command name: configure/);
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
  expect(() => cliValidateProgram(root)).not.toThrow();
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
  expect(() => cliValidateProgram(root)).toThrow(/Reserved command name: mcp/);
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
  } as unknown as CliProgram;
  expect(() => cliValidateProgram(root)).toThrow(/mcpServer is only supported on the program root/);
});

test("mcpTool on root is rejected", () => {
  const root = testProgram({
    key: "app",
    description: "",
    mcpTool: { enabled: false },
    handler: () => {},
  });
  expect(() => cliValidateProgram(root)).toThrow(/mcpTool is only supported on leaf commands/);
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
  expect(() => cliValidateProgram(root)).toThrow(/mcpTool is only supported on leaf commands/);
});

test("buildToolCallSuccessFromResponse maps JSON object", () => {
  const result = buildToolCallSuccessFromResponse({ body: { a: 1 } });
  expect(result.isError).toBe(false);
  expect(result.structuredContent).toEqual({ a: 1 });
  expect(result.content[0]?.text).toBe("");
});

test("buildToolCallSuccessFromResponse maps string body", () => {
  const result = buildToolCallSuccessFromResponse({
    body: "lookup user=x",
    contentType: "text/plain; charset=utf-8",
  });
  expect(result.structuredContent).toEqual({
    content: "lookup user=x",
    contentType: "text/plain; charset=utf-8",
  });
});

test("buildToolCallSuccessFromResponse maps binary body as base64", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const result = buildToolCallSuccessFromResponse({
    body: bytes,
    contentType: "application/pdf",
  });
  expect(result.structuredContent).toEqual({
    data: "JVBERg==",
    contentType: "application/pdf",
    encoding: "base64",
  });
});

test("MCP initialize returns tools and resources capabilities", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }]);
  const res = responses.get(1) as { result: { capabilities: Record<string, unknown> } };
  expect(res.result.capabilities.tools).toBeDefined();
  expect(res.result.capabilities.resources).toBeDefined();
});

test("MCP tools/list includes stat_owner_lookup", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }]);
  const res = responses.get(2) as {
    result: { tools: { name: string; inputSchema: { required?: string[] } }[] };
  };
  const lookup = res.result.tools.find((t) => t.name === "stat_owner_lookup");
  expect(lookup).toBeDefined();
  expect(lookup?.inputSchema.required).toContain("path");
});

test("MCP resources/read returns schema JSON", async () => {
  const responses = await mcpRequest([
    { jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "nested_ts://schema" } },
  ]);
  const res = responses.get(3) as { result: { contents: { text: string }[] } };
  const schema = JSON.parse(res.result.contents[0]?.text);
  expect(schema.key).toBe("nested.ts");
});

/** MCP tools/call runs stat_owner_lookup. */
test("MCP tools/call runs stat_owner_lookup", async () => {
  const readme = join(import.meta.dir, "..", "..", "..", "README.md");
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
    result: { content: { text: string }[]; structuredContent?: { content: string }; isError: boolean };
  };
  expect(res.result.isError).toBe(false);
  expect(res.result.structuredContent?.content).toContain("lookup user=test");
});

/** MCP tools/call returns structuredContent for JSON stdout. */
test("MCP tools/call returns structuredContent for JSON stdout", async () => {
  const readme = join(import.meta.dir, "..", "..", "..", "README.md");
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
  expect(res.result.isError).toBe(false);
  expect(res.result.structuredContent).toEqual({ user: "test", path: readme });
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
  expect(res.result.isError).toBe(true);
  expect(res.result.content[0]?.text).toContain("Missing argument: path");
});

test("MCP ping returns empty result", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 99, method: "ping", params: {} }]);
  const res = responses.get(99) as { result: Record<string, never> };
  expect(res.result).toEqual({});
});

test("minimal.ts mcp without opt-in fails", async () => {
  const { stderr, exitCode } = await $`bun run examples/minimal.ts mcp`.nothrow().quiet();
  expect(exitCode).toBe(1);
  expect(stderr.toString()).toContain("MCP is not available");
});

test("MCP resources/list includes custom resource", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 10, method: "resources/list", params: {} }], {
    script: "examples/mcp-test.ts",
  });
  const res = responses.get(10) as { result: { resources: { uri: string }[] } };
  const uris = res.result.resources.map((r) => r.uri);
  expect(uris).toContain("mcp_test://schema");
  expect(uris).toContain("mcp_test://docs/readme");
  expect(uris).toContain("test://hello");
});

/** MCP resources/read returns docs topic resource body. */
test("MCP resources/read returns docs topic resource body", async () => {
  const responses = await mcpRequest(
    [
      {
        jsonrpc: "2.0",
        id: 13,
        method: "resources/read",
        params: { uri: "mcp_test://docs/readme" },
      },
    ],
    { script: "examples/mcp-test.ts" },
  );
  const res = responses.get(13) as { result: { contents: { text: string }[] } };
  expect(res.result.contents[0]?.text).toBe("# MCP test readme\n");
});

test("MCP resources/read returns custom resource body", async () => {
  const responses = await mcpRequest(
    [{ jsonrpc: "2.0", id: 11, method: "resources/read", params: { uri: "test://hello" } }],
    { script: "examples/mcp-test.ts" },
  );
  const res = responses.get(11) as { result: { contents: { text: string }[] } };
  expect(res.result.contents[0]?.text).toBe("hello resource");
});

test("MCP resources/read unknown URI returns error", async () => {
  const responses = await mcpRequest(
    [{ jsonrpc: "2.0", id: 12, method: "resources/read", params: { uri: "missing://nope" } }],
    { script: "examples/mcp-test.ts" },
  );
  const res = responses.get(12) as { error: { code: number } };
  expect(res.error.code).toBe(-32602);
});

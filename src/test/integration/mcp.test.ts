/*
Domain-specific regression tests (split from index.test.ts).
*/

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { type TestContext, test } from "node:test";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { schemaExport } from "../../core/schema.ts";
import { cliValidateProgram } from "../../core/validate.ts";
import type { AppSpec } from "../../index.ts";
import { buildToolCallSuccessFromResponse } from "../../mcp/result.ts";
import {
  collectMcpTools,
  MCP_RESOURCE_READ_HINT,
  MCP_RESOURCE_READ_TOOL,
  mcpResourceReadTool,
  mcpToolCallToArgv,
  mcpToolDescription,
  mcpToolName,
  sanitizeToolSegment,
} from "../../mcp/tools.ts";
import { mcpRequest, nestedMcpFixture, requireMcpTool, runNode, testProgram } from "../fixtures.ts";

/** Starts an interactive MCP fixture outside its workspace and cleans up its process and files. */
function workspaceClient(
  /** Owns cleanup for the subprocess and temporary directories. */
  context: TestContext,
  /** Whether the application hook should override workspace cwd with launch cwd. */
  override = false,
) {
  const launch = realpathSync(mkdtempSync(join(tmpdir(), "argsbarg-mcp-")));
  const workspace = join(launch, "workspace with spaces");
  mkdirSync(workspace);
  const child = spawn(process.execPath, [join(import.meta.dirname, "..", "mcp-integration-fixture.ts"), "mcp"], {
    cwd: launch,
    env: { ...process.env, MCP_TEST_CWD: override ? launch : "" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  void closed.catch(() => {});
  context.after(() => {
    child.kill("SIGKILL");
    rmSync(launch, { force: true, recursive: true });
  });
  return {
    child,
    closed,
    launch,
    /** Reads one complete wire message without treating server requests as responses. */
    read: async (): Promise<Record<string, unknown>> => {
      const line = await lines.next();
      assert.equal(line.done, false, stderr);
      return JSON.parse(line.value as string) as Record<string, unknown>;
    },
    /** Collected framework stderr for lifecycle assertions. */
    stderr: () => stderr,
    workspace,
    /** Writes a client request, notification, or response. */
    write: (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`),
  };
}

test("MCP cancels active children and queued calls without overlapping tools", { timeout: 4_000 }, async (context) => {
  const client = workspaceClient(context);
  const metadata = {
    progressToken: "active-progress",
  };
  client.write({ id: 7, jsonrpc: "2.0", method: "tools/call", params: { _meta: metadata, name: "wait_child" } });
  const progress = await client.read();
  assert.equal(progress.method, "notifications/progress");
  const params = progress.params as { message: string; progressToken: string };
  assert.equal(params.progressToken, "active-progress");
  const pid = Number(params.message);
  assert.ok(pid > 0);
  client.write({ id: "queued", jsonrpc: "2.0", method: "tools/call", params: { _meta: metadata, name: "wait_child" } });
  client.write({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: "queued" } });
  client.write({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: "7" } });
  client.write({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7 } });
  client.write({
    id: "after",
    jsonrpc: "2.0",
    method: "tools/call",
    params: { _meta: metadata, name: "workspace_cwd" },
  });
  const response = await client.read();
  assert.equal(response.id, "after");
  assert.equal((response.result as { structuredContent: { overlap: boolean } }).structuredContent.overlap, false);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  client.child.stdin.end();
  assert.equal(await client.closed, 0, client.stderr());
});

test("MCP minor negotiates current and previously supported protocol versions", { timeout: 4_000 }, async (context) => {
  const client = workspaceClient(context);
  for (const version of ["2025-11-25", "2025-06-18", "2024-11-05", "2026-07-28"]) {
    client.write({
      id: version,
      jsonrpc: "2.0",
      method: "initialize",
      params: { capabilities: {}, protocolVersion: version },
    });
    const response = await client.read();
    assert.equal(response.error, undefined);
    const result = response.result as Record<string, unknown>;
    assert.equal(result.protocolVersion, version === "2026-07-28" ? "2025-11-25" : version);
    assert.deepEqual(result.capabilities, { resources: {}, tools: {} });
  }
  client.child.stdin.end();
  assert.equal(await client.closed, 0, client.stderr());
});

test("MCP preserves older clients' text-only results", { timeout: 4_000 }, async (context) => {
  const client = workspaceClient(context);
  for (const protocolVersion of ["2024-11-05", "2025-06-18", "2025-11-25"]) {
    client.write({ id: 1, jsonrpc: "2.0", method: "initialize", params: { protocolVersion } });
    assert.equal(((await client.read()).result as { protocolVersion: string }).protocolVersion, protocolVersion);
    client.write({ id: 2, jsonrpc: "2.0", method: "tools/list" });
    const listed = (await client.read()).result as { tools: { name: string; outputSchema?: unknown }[] };
    assert.equal(
      listed.tools.find((tool) => tool.name === "typed_output")?.outputSchema !== undefined,
      protocolVersion !== "2024-11-05",
    );
    client.write({ id: 3, jsonrpc: "2.0", method: "tools/call", params: { name: "typed_output" } });
    const result = (await client.read()).result as { structuredContent?: unknown };
    assert.deepEqual(result.structuredContent, protocolVersion === "2024-11-05" ? undefined : { result: "hello" });
  }
  client.child.stdin.end();
  assert.equal(await client.closed, 0, client.stderr());
});

test("MCP session roots select cwd once before hooks and child calls", { timeout: 4_000 }, async (context) => {
  for (const override of [false, true]) {
    const client = workspaceClient(context, override);
    client.write({
      id: "init",
      jsonrpc: "2.0",
      method: "initialize",
      params: { capabilities: { roots: {} }, protocolVersion: "2025-11-25" },
    });
    assert.equal((await client.read()).id, "init");
    client.write({ jsonrpc: "2.0", method: "notifications/initialized" });
    client.write({ id: 1, jsonrpc: "2.0", method: "tools/call", params: { name: "workspace_cwd" } });
    const rootsRequest = await client.read();
    assert.equal(rootsRequest.method, "roots/list");
    client.write({
      id: rootsRequest.id,
      jsonrpc: "2.0",
      result: { roots: [{ uri: pathToFileURL(client.workspace).href }] },
    });
    const selected = (await client.read()).result as { structuredContent: Record<string, unknown> };
    assert.deepEqual(selected.structuredContent, {
      childCwd: override ? client.launch : client.workspace,
      cwd: override ? client.launch : client.workspace,
      hookCwd: client.workspace,
      overlap: false,
    });
    client.write({ jsonrpc: "2.0", method: "notifications/roots/list_changed" });
    client.write({ jsonrpc: "2.0", method: "notifications/initialized" });
    for (const id of [3, 4]) {
      client.write({
        id,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "workspace_cwd" },
      });
    }
    for (const id of [3, 4]) {
      const response = await client.read();
      assert.equal(response.id, id);
      const result = response.result as { structuredContent: Record<string, unknown> };
      assert.equal(result.structuredContent.cwd, override ? client.launch : client.workspace);
      assert.equal(result.structuredContent.childCwd, override ? client.launch : client.workspace);
      assert.equal(result.structuredContent.overlap, false);
    }
    client.child.stdin.end();
    assert.equal(await client.closed, 0, client.stderr());
  }
});

test("MCP session roots fall back for unsupported or unusable roots", {
  timeout: 4_000,
}, async (context) => {
  for (const kind of ["unsupported", "empty", "multiple", "remote", "missing", "invalid", "malformed", "error"]) {
    const client = workspaceClient(context);
    const root = { uri: pathToFileURL(client.workspace).href };
    client.write({
      id: "init",
      jsonrpc: "2.0",
      method: "initialize",
      params: { capabilities: kind === "unsupported" ? {} : { roots: {} } },
    });
    assert.equal((await client.read()).id, "init");
    client.write({ jsonrpc: "2.0", method: "notifications/initialized" });
    client.write({ id: "fallback", jsonrpc: "2.0", method: "tools/call", params: { name: "workspace_cwd" } });
    if (kind !== "unsupported") {
      const request = await client.read();
      assert.equal(request.method, "roots/list");
      const roots =
        kind === "empty"
          ? []
          : kind === "multiple"
            ? [root, root]
            : kind === "remote"
              ? [{ uri: "https://example.com/workspace" }]
              : kind === "missing"
                ? [{ uri: pathToFileURL(join(client.launch, "missing")).href }]
                : kind === "invalid"
                  ? [{ uri: 1 }]
                  : "invalid";
      client.write({
        id: request.id,
        jsonrpc: "2.0",
        ...(kind === "error" ? { error: { code: -32603, message: "Roots unavailable" } } : { result: { roots } }),
      });
    }
    const result = (await client.read()).result as { structuredContent: { cwd: string; hookCwd: string } };
    assert.equal(result.structuredContent.cwd, client.launch);
    assert.equal(result.structuredContent.hookCwd, client.launch);
    client.child.stdin.end();
    assert.equal(await client.closed, 0, client.stderr());
  }
});

test("MCP session roots time out or disconnect without blocking queued calls", { timeout: 7_000 }, async (context) => {
  for (const disconnect of [false, true]) {
    const client = workspaceClient(context);
    client.write({ id: "init", jsonrpc: "2.0", method: "initialize", params: { capabilities: { roots: {} } } });
    assert.equal((await client.read()).id, "init");
    client.write({ jsonrpc: "2.0", method: "notifications/initialized" });
    client.write({ id: "fallback", jsonrpc: "2.0", method: "tools/call", params: { name: "workspace_cwd" } });
    assert.equal((await client.read()).method, "roots/list");
    if (disconnect) client.child.stdin.end();
    const response = await client.read();
    assert.equal(response.id, "fallback");
    assert.equal((response.result as { structuredContent: { cwd: string } }).structuredContent.cwd, client.launch);
    if (!disconnect) client.child.stdin.end();
    assert.equal(await client.closed, 0, client.stderr());
  }
});

test("MCP progress requires opt-in and stops after the final result", async () => {
  for (const progressToken of [undefined, 0]) {
    const result = runNode(["src/test/mcp-integration-fixture.ts", "mcp"], {
      input: `${JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          _meta: {
            progressToken,
          },
          name: "typed_output",
        },
      })}\n`,
    });
    assert.equal(result.exitCode, 0, result.stderr);
    const messages = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(messages.length, progressToken === undefined ? 1 : 3);
    assert.equal(messages.at(-1)?.id, 1);
    if (progressToken !== undefined) {
      for (const [index, message] of messages.slice(0, -1).entries()) {
        assert.equal(message.method, "notifications/progress");
        assert.deepEqual(message.params, { progress: index, progressToken, total: 1 });
      }
    }
  }
});

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
  assert.deepEqual(result.structuredContent, { content: "lookup user=x", contentType: "text/plain; charset=utf-8" });
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

test("MCP validates optional metadata and recovers after method errors", { timeout: 4_000 }, async (context) => {
  const client = workspaceClient(context);
  for (const [index, entry] of [
    { code: -32601, method: "server/discover", params: {} },
    { code: -32602, method: "tools/list", params: { _meta: [] } },
    { code: -32602, method: "tools/list", params: { _meta: { progressToken: false } } },
    { code: -32602, method: "tools/list", params: { cursor: "unknown" } },
  ].entries()) {
    client.write({ id: index, jsonrpc: "2.0", method: entry.method, params: entry.params });
    const response = await client.read();
    assert.equal(response.id, index);
    const error = response.error as { code: number; data?: unknown; message: string };
    assert.equal(error.code, entry.code);
    client.write({ id: "recovery", jsonrpc: "2.0", method: "tools/list" });
    assert.equal((await client.read()).id, "recovery");
  }
  client.write({ jsonrpc: "2.0", method: "notifications/initialized" });
  client.write({ jsonrpc: "2.0", method: "tools/call", params: { name: "workspace_cwd" } });
  client.write({ id: "barrier", jsonrpc: "2.0", method: "ping" });
  assert.equal((await client.read()).id, "barrier");
  client.child.stdin.end();
  assert.equal(await client.closed, 0, client.stderr());
});

test("MCP reports malformed envelopes and continues serving", () => {
  const messages = [
    "{",
    "null",
    "[]",
    "false",
    '{"jsonrpc":"2.0","method":3,"id":1}',
    '{"jsonrpc":"2.0","method":"tools/list","id":null}',
    '{"jsonrpc":"2.0","method":"tools/list","id":true}',
    '{"jsonrpc":"2.0","method":"tools/list","id":2,"result":{}}',
    '{"jsonrpc":"2.0","method":"tools/list","id":3,"params":[]}',
  ];
  const good = {
    id: "ok",
    jsonrpc: "2.0",
    method: "ping",
  };
  const result = runNode(["src/test/mcp-integration-fixture.ts", "mcp"], {
    input: `${messages.join("\n")}\n${JSON.stringify(good)}`,
  });
  assert.equal(result.exitCode, 0, result.stderr);
  const responses = result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    responses.slice(0, -1).map((response) => response.error.code),
    [-32700, -32600, -32600, -32600, -32600, -32600, -32600, -32600, -32602],
  );
  assert.equal(responses.at(-1).id, "ok");
  assert.deepEqual(responses.at(-1).result, {});
});

test("MCP initialization includes configured instructions plus the resource-read hint", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }], {
    script: "src/test/mcp-integration-fixture.ts",
  });
  const res = responses.get(1) as { result: { instructions?: string } };
  assert.equal(res.result.instructions, `Read the fixture skill.\n\n${MCP_RESOURCE_READ_HINT}`);
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

test("MCP responds to ping", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 99, method: "ping", params: {} }]);
  const res = responses.get(99) as { result: object };
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
  const res = responses.get(11) as {
    result: { contents: { text: string }[] };
  };
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

test("MCP tools/list adds mcp_resource_read with resource URIs only when resources exist", async () => {
  const withResources = await mcpRequest([{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }], {
    script: "src/test/mcp-integration-fixture.ts",
  });
  const tools = (
    withResources.get(1) as { result: { tools: { name: string; inputSchema: Record<string, unknown> }[] } }
  ).result.tools;
  const tool = tools.find((t) => t.name === MCP_RESOURCE_READ_TOOL);
  assert.ok(tool);
  assert.deepEqual((tool.inputSchema.properties as { uri: { enum: string[] } }).uri.enum, ["test://hello"]);

  const without = await mcpRequest([{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }]);
  const names = (without.get(1) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
  assert.ok(!names.includes(MCP_RESOURCE_READ_TOOL));
});

test("a command mapping to mcp_resource_read wins over the built-in tool", () => {
  const root = testProgram({
    key: "app",
    description: "",
    mcpServer: { enabled: true, resources: [{ uri: "test://x", name: "x", load: () => "body" }] },
    commands: [{ key: "mcp-resource-read", description: "user command", handler: () => {} }],
  });
  assert.equal(mcpResourceReadTool(root), undefined);
  assert.ok(collectMcpTools(root).some((t) => t.name === MCP_RESOURCE_READ_TOOL));
});

test("MCP lists explicit hints and validates actual structured wire results", async () => {
  const responses = await mcpRequest(
    [
      { id: 1, jsonrpc: "2.0", method: "tools/list" },
      { id: 2, jsonrpc: "2.0", method: "tools/call", params: { name: "typed_output" } },
      { id: 3, jsonrpc: "2.0", method: "tools/call", params: { name: "broken_output" } },
    ],
    { script: "src/test/mcp-integration-fixture.ts" },
  );
  const listed = (
    responses.get(1) as {
      result: { tools: { annotations?: unknown; name: string; outputSchema?: Record<string, unknown> }[] };
    }
  ).result;
  assert.deepEqual(listed.tools.find((tool) => tool.name === "workspace_cwd")?.annotations, {
    openWorldHint: false,
    readOnlyHint: true,
    title: "Inspect workspace",
  });
  assert.deepEqual(listed.tools.find((tool) => tool.name === "mcp_resource_read")?.annotations, {
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  });
  assert.equal(listed.tools.find((tool) => tool.name === "echo_env")?.annotations, undefined);
  assert.partialDeepStrictEqual(listed.tools.find((tool) => tool.name === "typed_output")?.outputSchema, {
    type: "object",
    properties: { result: { type: "string" } },
  });
  const typed = (responses.get(2) as { result: { content: { text: string }[]; structuredContent: unknown } }).result;
  assert.deepEqual(typed.structuredContent, { result: "hello" });
  assert.deepEqual(JSON.parse(typed.content[0]?.text ?? ""), { result: "hello" });
  const broken = responses.get(3) as {
    error?: unknown;
    result: { isError: boolean; content: { text: string }[]; structuredContent?: unknown };
  };
  assert.equal(broken.error, undefined);
  assert.equal(broken.result.isError, true);
  assert.match(broken.result.content[0]?.text ?? "", /outputSchema/);
  assert.equal(broken.result.structuredContent, undefined);
});

test("MCP mcp_resource_read tool returns the resource body or an isError result", async () => {
  const responses = await mcpRequest(
    [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: MCP_RESOURCE_READ_TOOL, arguments: { uri: "test://hello" } },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: MCP_RESOURCE_READ_TOOL, arguments: { uri: "missing://nope" } },
      },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: MCP_RESOURCE_READ_TOOL, arguments: {} } },
    ],
    { script: "src/test/mcp-integration-fixture.ts" },
  );
  type CallRes = { result: { isError: boolean; content: { text: string }[] } };
  const ok = responses.get(1) as CallRes;
  assert.equal(ok.result.isError, false);
  assert.equal(ok.result.content[0]?.text, "hello resource");
  const unknown = responses.get(2) as CallRes;
  assert.equal(unknown.result.isError, true);
  assert.equal(unknown.result.content[0]?.text, "Unknown resource: missing://nope");
  const missing = responses.get(3) as CallRes;
  assert.equal(missing.result.isError, true);
  assert.equal(missing.result.content[0]?.text, "Missing argument: uri");
});

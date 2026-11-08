/*
Tests for mcp/gateway: bundles register through app.run(), tools are prefixed and routed,
instructions and resources merge, and the shared mcp_resource_read tool reads any app's resource.
*/

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { createGatewayHandler, loadGatewayApps, parseGatewayEntries } from "./gateway.ts";
import type { JsonRpcRequest } from "./server.ts";

/** argsbarg's entry point, imported by the fake bundles. */
const ARGSBARG = pathToFileURL(join(import.meta.dirname, "../index.ts")).href;

/** Writes a fake plugin bundle whose top level runs `await app.run()`, like a real one. */
function writeBundle(
  /** Folder for the file. */
  dir: string,
  /** App key. */
  key: string,
  /** Optional resource URI. */
  resourceUri?: string,
): string {
  const file = join(dir, `${key}.mjs`);
  const resources = resourceUri
    ? `resources: [{ uri: "${resourceUri}", name: "guide", description: "${key} guide", mimeType: "text/markdown", load: () => "# ${key} guide" }],`
    : "";
  writeFileSync(
    file,
    `import { argsbarg } from "${ARGSBARG}";
const app = argsbarg({
  key: "${key}",
  description: "${key} plugin",
  version: "1.2.3",
  mcpServer: { enabled: true, shellEnv: false, instructions: "Use ${key} for ${key} things.", ${resources} },
  commands: [{ key: "hello", description: "Say hello.", handler: (ctx) => { ctx.respond({ body: { from: "${key}" } }); } }],
});
await app.run();
`,
  );
  return file;
}

/** Sends one request through the handler and returns the written response. */
async function call(
  /** Gateway handler. */
  handle: ReturnType<typeof createGatewayHandler>,
  /** JSON-RPC method. */
  method: string,
  /** Params. */
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  let reply: Record<string, unknown> | undefined;
  await handle(
    { jsonrpc: "2.0", id: 1, method, params } as JsonRpcRequest,
    (message) => {
      reply = message;
    },
    { signal: new AbortController().signal, reportProgress: () => {} },
  );
  assert.ok(reply, `no reply to ${method}`);
  return reply;
}

describe("parseGatewayEntries", () => {
  test("splits alias=path and keeps plain paths", () => {
    assert.deepEqual(parseGatewayEntries(["notes=/a/b.mjs", "/c/d.mjs", "./x=y/z.mjs"]), [
      { alias: "notes", path: "/a/b.mjs" },
      { path: "/c/d.mjs" },
      { path: "./x=y/z.mjs" },
    ]);
  });
});

describe("gateway", async () => {
  const dir = mkdtempSync(join(tmpdir(), "argsbarg-gateway-"));
  const mounted = await loadGatewayApps([
    { alias: "a", path: writeBundle(dir, "alpha", "alpha://guide") },
    { path: writeBundle(dir, "beta") },
  ]);
  const handle = createGatewayHandler(mounted, { name: "gw", version: "9.9.9" });

  test("mounts apps under their alias or key", () => {
    assert.deepEqual(
      mounted.map((m) => m.alias),
      ["a", "beta"],
    );
  });

  test("initialize merges instructions with a section per app", async () => {
    const result = (await call(handle, "initialize", { protocolVersion: "2025-06-18", capabilities: {} }))
      .result as Record<string, unknown>;
    assert.equal(result.protocolVersion, "2025-06-18");
    assert.deepEqual(result.serverInfo, { name: "gw", version: "9.9.9" });
    const text = String(result.instructions);
    assert.match(text, /## a\n\nUse alpha for alpha things\./);
    assert.match(text, /## beta\n\nUse beta for beta things\./);
    assert.equal(text.match(/mcp_resource_read/g)?.length, 1);
  });

  test("tools/list prefixes tools and serves one resource-read tool", async () => {
    const tools = ((await call(handle, "tools/list")).result as { tools: { name: string }[] }).tools;
    assert.deepEqual(tools.map((t) => t.name).sort(), ["a_hello", "beta_hello", "mcp_resource_read"]);
  });

  test("tools/call routes by prefix", async () => {
    const result = (await call(handle, "tools/call", { name: "beta_hello", arguments: {} })).result as {
      structuredContent?: unknown;
      content: { text: string }[];
    };
    assert.match(JSON.stringify(result), /"from\\?":\\?"beta/);
  });

  test("unknown tools are rejected", async () => {
    const reply = await call(handle, "tools/call", { name: "gamma_hello", arguments: {} });
    assert.equal((reply.error as { code: number }).code, -32602);
  });

  test("resources merge and read through either path", async () => {
    const listed = ((await call(handle, "resources/list")).result as { resources: { uri: string }[] }).resources;
    assert.deepEqual(
      listed.map((r) => r.uri),
      ["alpha://guide"],
    );
    const read = (await call(handle, "resources/read", { uri: "alpha://guide" })).result as {
      contents: { text: string }[];
    };
    assert.equal(read.contents[0]?.text, "# alpha guide");
    const viaTool = (
      await call(handle, "tools/call", { name: "mcp_resource_read", arguments: { uri: "alpha://guide" } })
    ).result as { content: { text: string }[] };
    assert.equal(viaTool.content[0]?.text, "# alpha guide");
  });

  test("a bundle without an MCP app fails clearly", async () => {
    const file = join(dir, "plain.mjs");
    writeFileSync(file, "export const x = 1;\n");
    await assert.rejects(loadGatewayApps([{ path: file }]), /did not register an MCP app/);
  });
});

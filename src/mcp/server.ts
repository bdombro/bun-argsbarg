/*
This module implements the MCP JSON-RPC server over stdio: initialize, tools,
resources, ping, and automatic workspace cwd selection from client roots.
Responses are newline-delimited JSON on stdout only.
*/

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { AppSpec } from "../core/types.ts";
import { executeHeadlessToolCall, headlessFailureMcpMessage, lookupHeadlessTool } from "../headless/tool-call.ts";
import type { App } from "../runtime/cli.ts";
import {
  allMcpResources,
  collectMcpTools,
  MCP_RESOURCE_READ_HINT,
  MCP_RESOURCE_READ_TOOL,
  mcpResourceReadTool,
  resolveMcpServerInfo,
} from "./tools.ts";

/** Protocol versions this server understands, newest first. `initialize` echoes a match or answers the first. */
export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2024-11-05"] as const;

/** The first protocol version to define `outputSchema` (tools/list) and `structuredContent` (tools/call). */
const MCP_STRUCTURED_OUTPUT_SINCE = "2025-06-18";

/** Maximum wait for the client's initial workspace roots response. */
const MCP_ROOTS_TIMEOUT_MS = 5_000;

/** JSON-RPC request or response from stdin. */
interface JsonRpcRequest {
  /** JSON-RPC version declared by the sender. */
  jsonrpc?: string;
  /** Request identity, scoped to the direction of the request. */
  id?: string | number | null;
  /** Request or notification method; absent on responses. */
  method?: string;
  /** Arguments supplied by the client. */
  params?: unknown;
  /** Successful response to a server request. */
  result?: unknown;
  /** Failed response to a server request. */
  error?: unknown;
}

/** True when `version` is at or after {@link MCP_STRUCTURED_OUTPUT_SINCE} in {@link MCP_PROTOCOL_VERSIONS}. */
function supportsStructuredOutput(version: string | undefined): boolean {
  const idx = version ? (MCP_PROTOCOL_VERSIONS as readonly string[]).indexOf(version) : -1;
  const sinceIdx = (MCP_PROTOCOL_VERSIONS as readonly string[]).indexOf(MCP_STRUCTURED_OUTPUT_SINCE);
  return idx !== -1 && idx <= sinceIdx;
}

/** Outcome of reading one `mcpServer.resources` entry by URI. */
type ResourceReadResult =
  | { ok: true; uri: string; mimeType: string; text: string }
  | { ok: false; failureKind: "unexpected" | "unknown_route" | "validation"; message: string; error: unknown };

/** Looks up a resource by URI and runs its `load()`; shared by `resources/read` and the resource-read tool. */
function readMcpResource(
  /** App root. */
  root: AppSpec,
  /** Requested resource URI. */
  uri: string,
): ResourceReadResult {
  const found = allMcpResources(root).find((r) => r.uri === uri);
  if (!found) {
    const message = `Unknown resource: ${uri}`;
    return { ok: false, failureKind: "unknown_route", message, error: new Error(message) };
  }
  try {
    return { ok: true, uri: found.uri, mimeType: found.mimeType, text: found.load() };
  } catch (err) {
    const message = `Resource load failed: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, failureKind: "unexpected", message, error: err };
  }
}

/** Handles one request on the serialized application queue. */
async function handleRequestLine(
  /** App serving this connection. */
  cli: App,
  /** Parsed client request or notification. */
  req: JsonRpcRequest,
  /** Connection writer that bypasses tool output capture. */
  writeResponse: (message: Record<string, unknown>) => void,
): Promise<void> {
  const root = cli.spec;
  const requestId = randomUUID();
  const started = performance.now();
  const hooks = cli.server?.mcpHooks ?? root.mcpServer?.hooks;
  const emitter = cli.server?.emitter;
  const obscureUnexpected = cli.server?.mcp?.obscureUnexpected ?? root.mcpServer?.errors?.obscureUnexpected ?? false;

  /** Writes an error only when the incoming message expects a response. */
  function writeError(id: string | number | null | undefined, code: number, message: string): void {
    if (id !== undefined) {
      writeResponse({ error: { code, message }, id, jsonrpc: "2.0" });
    }
  }

  const id = req.id;
  const hasId = id !== undefined;
  const method = req.method ?? "";
  const params = (req.params ?? {}) as Record<string, unknown>;
  const wireCtx = { rpcMethod: method, requestId };

  await hooks?.onRequest?.(wireCtx);

  const finish = async (failureKind?: string, error?: unknown): Promise<void> => {
    const durationMs = Math.round(performance.now() - started);
    if (failureKind && error !== undefined) {
      await hooks?.onError?.({
        ...wireCtx,
        failureKind: failureKind as import("../core/types.ts").InvokeFailureKind,
        error,
      });
    } else {
      await hooks?.onResponse?.({ ...wireCtx, durationMs });
    }
    emitter?.emitAccess({
      method: "MCP",
      path: method,
      status: failureKind ? 500 : 200,
      durationMs,
      requestId,
    });
  };

  if (req.jsonrpc !== "2.0") {
    if (hasId) {
      writeError(id, -32600, "Invalid Request");
    }
    await finish("validation", new Error("Invalid Request"));
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (!hasId) {
    return;
  }

  try {
    if (method === "initialize") {
      const info = resolveMcpServerInfo(root);
      const requested = params.protocolVersion;
      const negotiated =
        typeof requested === "string" && (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
          ? requested
          : MCP_PROTOCOL_VERSIONS[0];
      if (cli.server) {
        cli.server.mcpProtocolVersion = negotiated;
      }
      const baseInstructions = root.mcpServer?.instructions;
      const instructions =
        baseInstructions && mcpResourceReadTool(root)
          ? `${baseInstructions}\n\n${MCP_RESOURCE_READ_HINT}`
          : baseInstructions;
      writeResponse({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiated,
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: info.name, version: info.version },
          ...(instructions ? { instructions } : {}),
        },
      });
      await finish();
      return;
    }

    if (method === "ping") {
      writeResponse({ jsonrpc: "2.0", id, result: {} });
      await finish();
      return;
    }

    if (method === "tools/list") {
      const structured = supportsStructuredOutput(cli.server?.mcpProtocolVersion);
      const tools = collectMcpTools(root).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(structured && t.outputSchema !== undefined ? { outputSchema: t.outputSchema } : {}),
      }));
      const resourceTool = mcpResourceReadTool(root);
      if (resourceTool) {
        tools.push(resourceTool);
      }
      writeResponse({ jsonrpc: "2.0", id, result: { tools } });
      await finish();
      return;
    }

    if (method === "tools/call") {
      const name = params.name;
      if (typeof name !== "string") {
        writeError(id, -32602, "Invalid params: name required");
        await finish("validation", new Error("Invalid params: name required"));
        return;
      }
      const rawArgs = params.arguments;
      if (rawArgs !== undefined && (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs))) {
        writeError(id, -32602, "Invalid params: arguments must be an object");
        await finish("validation", new Error("Invalid params: arguments must be an object"));
        return;
      }
      if (name === MCP_RESOURCE_READ_TOOL && mcpResourceReadTool(root)) {
        const uri = (rawArgs as Record<string, unknown> | undefined)?.uri;
        const read: ResourceReadResult =
          typeof uri === "string"
            ? readMcpResource(root, uri)
            : {
                ok: false,
                failureKind: "validation",
                message: "Missing argument: uri",
                error: new Error("Missing argument: uri"),
              };
        if (read.ok) {
          writeResponse({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: read.text }], isError: false },
          });
          await finish();
        } else {
          writeResponse({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: read.message }], isError: true },
          });
          await finish(read.failureKind, read.error);
        }
        return;
      }
      const lookup = lookupHeadlessTool(root, name);
      if (!lookup.ok) {
        if (lookup.kind === "unknown") {
          writeError(id, -32602, lookup.message);
          await finish("unknown_route", new Error(lookup.message));
          return;
        }
        writeResponse({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: lookup.message }],
            isError: true,
          },
        });
        await finish("missing_config", new Error(lookup.message));
        return;
      }
      const invokeResult = await executeHeadlessToolCall(
        cli,
        lookup.tool,
        (rawArgs ?? {}) as Record<string, unknown>,
        "mcp",
        { rpcMethod: method, toolName: name, requestId },
      );
      if (invokeResult.ok) {
        const structured = supportsStructuredOutput(cli.server?.mcpProtocolVersion);
        const { structuredContent: _structuredContent, ...rest } = invokeResult.mcpResult;
        writeResponse({
          jsonrpc: "2.0",
          id,
          result: structured ? invokeResult.mcpResult : rest,
        });
        await finish();
        return;
      }
      const text = headlessFailureMcpMessage(invokeResult, obscureUnexpected);
      writeResponse({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text }],
          isError: true,
        },
      });
      await finish(invokeResult.failureKind ?? "invoke", new Error(invokeResult.message));
      return;
    }

    if (method === "resources/list") {
      const resources = allMcpResources(root).map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      }));
      writeResponse({ jsonrpc: "2.0", id, result: { resources } });
      await finish();
      return;
    }

    if (method === "resources/read") {
      const uri = params.uri;
      if (typeof uri !== "string") {
        writeError(id, -32602, "Invalid params: uri required");
        await finish("validation", new Error("Invalid params: uri required"));
        return;
      }
      const read = readMcpResource(root, uri);
      if (!read.ok) {
        writeError(id, read.failureKind === "unknown_route" ? -32602 : -32603, read.message);
        await finish(read.failureKind, read.error);
        return;
      }
      writeResponse({
        jsonrpc: "2.0",
        id,
        result: { contents: [{ uri: read.uri, mimeType: read.mimeType, text: read.text }] },
      });
      await finish();
      return;
    }

    writeError(id, -32601, "Method not found");
    await finish("unknown_route", new Error("Method not found"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    writeError(id, -32603, message);
    await finish("unexpected", err);
  }
}

/** Runs the MCP NDJSON read loop on stdin until EOF. */
export async function mcpServeStdioLoop(cli: App): Promise<void> {
  let buffer = "";
  const decoder = new TextDecoder();
  const writeStdout = process.stdout.write.bind(process.stdout);
  let execution = Promise.resolve();
  const rootsRequestId = `argsbarg:roots:${randomUUID()}`;
  let rootsSupported: boolean | undefined;
  let workspaceSelected = false;
  let inputClosed = false;
  let settleRoots: ((response: JsonRpcRequest | Error) => void) | undefined;

  /** Stops reading when the connection or application queue cannot continue. */
  function stopInput(error: unknown): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    settleRoots?.(failure);
    process.stdin.destroy(failure);
  }

  process.stdout.on("error", stopInput);

  /** Writes protocol messages independently of App.invoke's stdout capture. */
  function writeResponse(message: Record<string, unknown>): void {
    writeStdout(`${JSON.stringify(message)}\n`);
  }

  /** Selects one local workspace once, falling back to launch cwd on discovery failure. */
  async function selectWorkspace(): Promise<void> {
    let reason = "Client does not support roots";
    try {
      if (rootsSupported) {
        if (inputClosed) {
          throw new Error("MCP input disconnected");
        }
        const response = await new Promise<JsonRpcRequest>((resolve, reject) => {
          const timeout = setTimeout(() => {
            settleRoots?.(new Error("Client roots/list response timed out after 5 seconds"));
          }, MCP_ROOTS_TIMEOUT_MS);
          settleRoots = (reply) => {
            clearTimeout(timeout);
            settleRoots = undefined;
            if (reply instanceof Error) {
              reject(reply);
            } else {
              resolve(reply);
            }
          };
          try {
            writeResponse({ id: rootsRequestId, jsonrpc: "2.0", method: "roots/list" });
          } catch (error) {
            settleRoots?.(error instanceof Error ? error : new Error(String(error)));
          }
        });
        if ("error" in response) {
          throw new Error("Client roots/list request failed");
        }
        const result = response.result as { roots?: unknown } | null;
        if (!result || !Array.isArray(result.roots)) {
          throw new Error("Invalid roots/list response");
        }
        if (result.roots.length !== 1) {
          throw new Error(`Client returned ${result.roots.length} workspace roots; expected exactly one`);
        }
        const root = result.roots[0] as { uri?: unknown } | null;
        if (!root || typeof root.uri !== "string") {
          throw new Error("Invalid workspace root URI");
        }
        process.chdir(fileURLToPath(root.uri));
        cli.server?.emitter.emitLifecycle(`MCP workspace cwd: ${process.cwd()}`, "mcp.workspace.selected");
        return;
      }
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    cli.server?.emitter.emitLifecycle(`MCP workspace cwd unchanged: ${reason}`, "mcp.workspace.fallback");
  }

  /** Routes responses immediately and queues application requests in arrival order. */
  function routeLine(line: string): void {
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch {
      return;
    }
    if (typeof request !== "object" || request === null || Array.isArray(request)) {
      return;
    }
    if (request.method === undefined && ("result" in request || "error" in request)) {
      if (request.jsonrpc === "2.0" && request.id === rootsRequestId) {
        settleRoots?.(request);
      }
      return;
    }
    execution = execution.then(async () => {
      if (
        request.jsonrpc === "2.0" &&
        request.method === "notifications/initialized" &&
        request.id === undefined &&
        rootsSupported !== undefined &&
        !workspaceSelected
      ) {
        workspaceSelected = true;
        await selectWorkspace();
      }
      await handleRequestLine(cli, request, writeResponse);
      if (
        request.jsonrpc === "2.0" &&
        request.method === "initialize" &&
        request.id !== undefined &&
        !workspaceSelected
      ) {
        const params = request.params as { capabilities?: { roots?: unknown } } | undefined;
        const roots = params?.capabilities?.roots;
        rootsSupported = typeof roots === "object" && roots !== null && !Array.isArray(roots);
      }
    });
    void execution.catch(stopInput);
  }

  try {
    for await (const chunk of process.stdin) {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.length > 0) routeLine(line);
        nl = buffer.indexOf("\n");
      }
    }
    const trailing = `${buffer}${decoder.decode()}`.trim();
    if (trailing.length > 0) routeLine(trailing);
  } finally {
    inputClosed = true;
    settleRoots?.(new Error("MCP input disconnected"));
    try {
      await execution;
    } finally {
      process.stdout.off("error", stopInput);
    }
  }
}

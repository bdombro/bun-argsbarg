/*
This module serves session-based MCP tools and resources over stdio.
Initialization negotiates capabilities; application calls remain serialized.
Responses are newline-delimited JSON on stdout only, independent of tool output capture.
*/

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { AppSpec, McpWireContext } from "../core/types.ts";
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

/** Supported session-based protocol revisions, newest first. */
export const MCP_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2024-11-05"] as const;

/** Maximum wait for the client's initial workspace roots response. */
const MCP_ROOTS_TIMEOUT_MS = 5_000;

/** Validated JSON-RPC request or notification from stdin. */
interface JsonRpcRequest {
  /** JSON-RPC version declared by the sender. */
  jsonrpc: "2.0";
  /** Request identity, scoped to the direction of the request. */
  id?: string | number;
  /** Request or notification method. */
  method: string;
  /** Arguments supplied by the client. */
  params?: Record<string, unknown>;
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
  /** Cancellation and progress for this request only. */
  controls: Required<Pick<McpWireContext, "signal" | "reportProgress">>,
): Promise<void> {
  const root = cli.spec;
  const requestId = randomUUID();
  const started = performance.now();
  const hooks = cli.server?.mcpHooks ?? root.mcpServer?.hooks;
  const emitter = cli.server?.emitter;
  const obscureUnexpected = cli.server?.mcp?.obscureUnexpected ?? root.mcpServer?.errors?.obscureUnexpected ?? false;

  /** Writes an error only when the incoming message expects a response. */
  function writeError(id: string | number | undefined, code: number, message: string, data?: unknown): void {
    if (id !== undefined) {
      writeResponse({ error: { code, message, ...(data === undefined ? {} : { data }) }, id, jsonrpc: "2.0" });
    }
  }

  const id = req.id;
  const hasId = id !== undefined;
  const method = req.method;
  const params = req.params ?? {};
  const wireCtx = { ...controls, rpcMethod: method, requestId };

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
      if (cli.server) cli.server.mcpProtocolVersion = negotiated;
      const baseInstructions = root.mcpServer?.instructions;
      const instructions =
        baseInstructions && mcpResourceReadTool(root)
          ? `${baseInstructions}\n\n${MCP_RESOURCE_READ_HINT}`
          : baseInstructions;
      writeResponse({
        id,
        jsonrpc: "2.0",
        result: {
          capabilities: { resources: {}, tools: {} },
          protocolVersion: negotiated,
          serverInfo: { name: info.name, version: info.version },
          ...(instructions ? { instructions } : {}),
        },
      });
      await finish();
      return;
    }
    const meta = params._meta;
    if (meta !== undefined && (typeof meta !== "object" || meta === null || Array.isArray(meta))) {
      writeError(id, -32602, "Invalid params: _meta must be an object");
      await finish("validation", new Error("Malformed request metadata"));
      return;
    }
    const progressToken = (meta as Record<string, unknown> | undefined)?.progressToken;
    if (
      progressToken !== undefined &&
      typeof progressToken !== "string" &&
      (typeof progressToken !== "number" || !Number.isFinite(progressToken))
    ) {
      writeError(id, -32602, "Invalid params: malformed request metadata");
      await finish("validation", new Error("Malformed request metadata"));
      return;
    }
    if (params.cursor !== undefined) {
      writeError(id, -32602, "Invalid params: this server does not issue pagination cursors");
      await finish("validation", new Error("Unknown pagination cursor"));
      return;
    }
    if (method === "ping") {
      writeResponse({ id, jsonrpc: "2.0", result: {} });
      await finish();
      return;
    }

    if (method === "tools/list") {
      const tools = collectMcpTools(root).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(cli.server?.mcpProtocolVersion !== "2024-11-05" && t.outputSchema !== undefined
          ? { outputSchema: t.outputSchema }
          : {}),
        ...(t.annotations === undefined ? {} : { annotations: t.annotations }),
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
        writeError(id, -32602, lookup.message);
        await finish("unknown_route", new Error(lookup.message));
        return;
      }
      const invokeResult = await executeHeadlessToolCall(
        cli,
        lookup.tool,
        (rawArgs ?? {}) as Record<string, unknown>,
        "mcp",
        { ...wireCtx, toolName: name },
      );
      if (invokeResult.ok) {
        writeResponse({
          jsonrpc: "2.0",
          id,
          result:
            cli.server?.mcpProtocolVersion === "2024-11-05"
              ? { content: invokeResult.mcpResult.content, isError: false }
              : invokeResult.mcpResult,
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
      await finish(invokeResult.failureKind ?? "unexpected", new Error(invokeResult.message));
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
        result: {
          contents: [{ uri: read.uri, mimeType: read.mimeType, text: read.text }],
        },
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
  const pending = new Map<string | number, AbortController>();
  const rootsRequestId = `argsbarg:roots:${randomUUID()}`;
  let rootsSupported: boolean | undefined;
  let workspaceSelected = false;
  let inputClosed = false;
  let settleRoots: ((reply: Record<string, unknown> | Error) => void) | undefined;

  /** Stops reading when the connection or application queue cannot continue. */
  function stopInput(error: unknown): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    settleRoots?.(failure);
    for (const controller of pending.values()) controller.abort(failure);
    process.stdin.destroy(failure);
  }

  process.stdout.on("error", stopInput);

  /** Writes protocol messages independently of App.invoke's stdout capture. */
  function writeResponse(message: Record<string, unknown>): void {
    writeStdout(`${JSON.stringify(message)}\n`);
  }

  /** Selects one local workspace once; failures retain the server's launch cwd. */
  async function selectWorkspace(): Promise<void> {
    let reason = "Client does not support roots";
    try {
      if (rootsSupported) {
        if (inputClosed) throw new Error("MCP input disconnected");
        const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const timeout = setTimeout(() => {
            settleRoots?.(new Error("Client roots/list response timed out after 5 seconds"));
          }, MCP_ROOTS_TIMEOUT_MS);
          settleRoots = (reply) => {
            clearTimeout(timeout);
            settleRoots = undefined;
            if (reply instanceof Error) reject(reply);
            else resolve(reply);
          };
          try {
            writeResponse({ id: rootsRequestId, jsonrpc: "2.0", method: "roots/list" });
          } catch (error) {
            settleRoots?.(error instanceof Error ? error : new Error(String(error)));
          }
        });
        if ("error" in response) throw new Error("Client roots/list request failed");
        const result = response.result as { roots?: unknown } | null;
        if (!result || !Array.isArray(result.roots)) throw new Error("Invalid roots/list response");
        if (result.roots.length !== 1)
          throw new Error(`Client returned ${result.roots.length} workspace roots; expected exactly one`);
        const root = result.roots[0] as { uri?: unknown } | null;
        if (!root || typeof root.uri !== "string") throw new Error("Invalid workspace root URI");
        process.chdir(fileURLToPath(root.uri));
        cli.server?.emitter.emitLifecycle(`MCP workspace cwd: ${process.cwd()}`, "mcp.workspace.selected");
        return;
      }
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    cli.server?.emitter.emitLifecycle(`MCP workspace cwd unchanged: ${reason}`, "mcp.workspace.fallback");
  }

  /** Validates envelopes before queuing application requests in arrival order. */
  function routeLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      writeResponse({ error: { code: -32700, message: "Parse error" }, id: null, jsonrpc: "2.0" });
      return;
    }
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      writeResponse({ error: { code: -32600, message: "Invalid Request" }, id: null, jsonrpc: "2.0" });
      return;
    }
    const request = message as Record<string, unknown>;
    const validId = typeof request.id === "string" || (typeof request.id === "number" && Number.isFinite(request.id));
    if (
      request.jsonrpc === "2.0" &&
      validId &&
      request.method === undefined &&
      "result" in request !== "error" in request
    ) {
      if (request.id === rootsRequestId) settleRoots?.(request);
      return;
    }
    if (
      request.jsonrpc !== "2.0" ||
      typeof request.method !== "string" ||
      ("id" in request && !validId) ||
      "result" in request ||
      "error" in request
    ) {
      writeResponse({
        error: { code: -32600, message: "Invalid Request" },
        id: validId ? request.id : null,
        jsonrpc: "2.0",
      });
      return;
    }
    if (
      request.params !== undefined &&
      (typeof request.params !== "object" || request.params === null || Array.isArray(request.params))
    ) {
      if (validId)
        writeResponse({ error: { code: -32602, message: "Invalid params" }, id: request.id, jsonrpc: "2.0" });
      return;
    }
    if (!validId) {
      if (request.method === "notifications/initialized") {
        execution = execution.then(async () => {
          if (rootsSupported !== undefined && !workspaceSelected) {
            workspaceSelected = true;
            await selectWorkspace();
          }
        });
        void execution.catch(stopInput);
      }
      if (request.method === "notifications/cancelled") {
        const params = request.params as Record<string, unknown> | undefined;
        if (typeof params?.requestId === "string" || typeof params?.requestId === "number") {
          pending.get(params.requestId)?.abort(typeof params.reason === "string" ? params.reason : undefined);
        }
      }
      return;
    }
    const id = request.id as string | number;
    if (pending.has(id)) {
      writeResponse({ error: { code: -32600, message: "Request ID is already in flight" }, id, jsonrpc: "2.0" });
      return;
    }
    const controller = new AbortController();
    pending.set(id, controller);
    execution = execution.then(async () => {
      if (controller.signal.aborted) {
        pending.delete(id);
        return;
      }
      let completed = false;
      let previousProgress = -1;
      try {
        await handleRequestLine(
          cli,
          request as unknown as JsonRpcRequest,
          (message) => {
            completed = true;
            if (!controller.signal.aborted) writeResponse(message);
          },
          {
            signal: controller.signal,
            /** Emits opted-in progress independently of application output capture. */
            reportProgress: (progress, total, message) => {
              const meta = (request.params as Record<string, unknown> | undefined)?._meta as
                | Record<string, unknown>
                | undefined;
              const progressToken = meta?.progressToken;
              if (completed || controller.signal.aborted || progressToken === undefined) return;
              if (
                !Number.isFinite(progress) ||
                progress < 0 ||
                progress <= previousProgress ||
                (total !== undefined && (!Number.isFinite(total) || total < progress))
              ) {
                throw new RangeError("Progress must increase and must not exceed its finite total");
              }
              previousProgress = progress;
              writeResponse({
                jsonrpc: "2.0",
                method: "notifications/progress",
                params: {
                  progress,
                  progressToken,
                  ...(total === undefined ? {} : { total }),
                  ...(message === undefined ? {} : { message }),
                },
              });
            },
          },
        );
        if (request.method === "initialize" && !workspaceSelected) {
          const roots = (request.params as { capabilities?: { roots?: unknown } } | undefined)?.capabilities?.roots;
          rootsSupported = typeof roots === "object" && roots !== null && !Array.isArray(roots);
        }
      } finally {
        completed = true;
        pending.delete(id);
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

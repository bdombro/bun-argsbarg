/*
This module implements the MCP JSON-RPC server over stdio: initialize, tools,
resources, and ping. Responses are newline-delimited JSON on stdout only.
*/

import { randomUUID } from "node:crypto";
import { executeHeadlessToolCall, headlessFailureMcpMessage, lookupHeadlessTool } from "../headless/tool-call.ts";
import type { Cli } from "../runtime/cli.ts";
import { allMcpResources, collectMcpTools, resolveMcpServerInfo } from "./tools.ts";

/** Protocol versions this server understands, newest first. `initialize` echoes a match or answers the first. */
export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2024-11-05"] as const;

/** The first protocol version to define `outputSchema` (tools/list) and `structuredContent` (tools/call). */
const MCP_STRUCTURED_OUTPUT_SINCE = "2025-06-18";

/** JSON-RPC request shape from stdin. */
interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

/** Writes a JSON-RPC response line to stdout. */
function writeResponse(msg: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

/** Writes a JSON-RPC error response. */
function writeError(id: string | number | null | undefined, code: number, message: string): void {
  if (id === undefined) {
    return;
  }
  writeResponse({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

/** True when `version` is at or after {@link MCP_STRUCTURED_OUTPUT_SINCE} in {@link MCP_PROTOCOL_VERSIONS}. */
function supportsStructuredOutput(version: string | undefined): boolean {
  const idx = version ? (MCP_PROTOCOL_VERSIONS as readonly string[]).indexOf(version) : -1;
  const sinceIdx = (MCP_PROTOCOL_VERSIONS as readonly string[]).indexOf(MCP_STRUCTURED_OUTPUT_SINCE);
  return idx !== -1 && idx <= sinceIdx;
}

/** Handles one NDJSON request line. */
async function handleRequestLine(cli: Cli, line: string): Promise<void> {
  const root = cli.program;
  const requestId = randomUUID();
  const started = performance.now();
  const hooks = cli.server?.mcpHooks ?? root.mcpServer?.hooks;
  const emitter = cli.server?.emitter;
  const obscureUnexpected = cli.server?.mcp?.obscureUnexpected ?? root.mcpServer?.errors?.obscureUnexpected ?? false;

  let req: JsonRpcRequest;
  try {
    req = JSON.parse(line) as JsonRpcRequest;
  } catch {
    return;
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
      const instructions = root.mcpServer?.instructions;
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
      const all = allMcpResources(root);
      const found = all.find((r) => r.uri === uri);
      if (!found) {
        writeError(id, -32602, `Unknown resource: ${uri}`);
        await finish("unknown_route", new Error(`Unknown resource: ${uri}`));
        return;
      }
      let text: string;
      try {
        text = found.load();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeError(id, -32603, `Resource load failed: ${message}`);
        await finish("unexpected", err);
        return;
      }
      writeResponse({
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri: found.uri,
              mimeType: found.mimeType,
              text,
            },
          ],
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
export async function mcpServeStdioLoop(cli: Cli): Promise<void> {
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of process.stdin) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk);
    let nl = buffer.indexOf("\n");
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.length === 0) {
        nl = buffer.indexOf("\n");
        continue;
      }
      await handleRequestLine(cli, line);
      nl = buffer.indexOf("\n");
    }
  }
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    await handleRequestLine(cli, trailing);
  }
}

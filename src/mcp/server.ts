/*
This module implements the MCP JSON-RPC server over stdio: initialize, tools,
resources, and ping. Responses are newline-delimited JSON on stdout only.
*/

import type { Cli } from "../cli.ts";
import { executeHeadlessToolCall, lookupHeadlessTool } from "../headless/tool-call.ts";
import { allMcpResources, collectMcpTools, resolveMcpServerInfo } from "./tools.ts";

const MCP_PROTOCOL_VERSION = "2024-11-05";

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

/** Handles one NDJSON request line. */
async function handleRequestLine(cli: Cli, line: string): Promise<void> {
  const root = cli.program;
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(line) as JsonRpcRequest;
  } catch {
    return;
  }

  const id = req.id;
  const hasId = id !== undefined;

  if (req.jsonrpc !== "2.0") {
    if (hasId) {
      writeError(id, -32600, "Invalid Request");
    }
    return;
  }

  const method = req.method ?? "";
  const params = (req.params ?? {}) as Record<string, unknown>;

  if (method === "notifications/initialized") {
    return;
  }

  if (!hasId) {
    return;
  }

  try {
    if (method === "initialize") {
      const info = resolveMcpServerInfo(root);
      writeResponse({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: info.name, version: info.version },
        },
      });
      return;
    }

    if (method === "ping") {
      writeResponse({ jsonrpc: "2.0", id, result: {} });
      return;
    }

    if (method === "tools/list") {
      const tools = collectMcpTools(root).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(t.outputSchema === undefined ? {} : { outputSchema: t.outputSchema }),
      }));
      writeResponse({ jsonrpc: "2.0", id, result: { tools } });
      return;
    }

    if (method === "tools/call") {
      const name = params.name;
      if (typeof name !== "string") {
        writeError(id, -32602, "Invalid params: name required");
        return;
      }
      const rawArgs = params.arguments;
      if (rawArgs !== undefined && (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs))) {
        writeError(id, -32602, "Invalid params: arguments must be an object");
        return;
      }
      const lookup = lookupHeadlessTool(root, name);
      if (!lookup.ok) {
        if (lookup.kind === "unknown") {
          writeError(id, -32602, lookup.message);
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
        return;
      }
      const invokeResult = await executeHeadlessToolCall(
        cli,
        lookup.tool,
        (rawArgs ?? {}) as Record<string, unknown>,
        "mcp",
      );
      if (invokeResult.ok) {
        writeResponse({
          jsonrpc: "2.0",
          id,
          result: invokeResult.mcpResult,
        });
        return;
      }
      writeResponse({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: invokeResult.message }],
          isError: true,
        },
      });
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
      return;
    }

    if (method === "resources/read") {
      const uri = params.uri;
      if (typeof uri !== "string") {
        writeError(id, -32602, "Invalid params: uri required");
        return;
      }
      const all = allMcpResources(root);
      const found = all.find((r) => r.uri === uri);
      if (!found) {
        writeError(id, -32602, `Unknown resource: ${uri}`);
        return;
      }
      let text: string;
      try {
        text = found.load();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeError(id, -32603, `Resource load failed: ${message}`);
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
      return;
    }

    writeError(id, -32601, "Method not found");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    writeError(id, -32603, message);
  }
}

/** Runs the MCP NDJSON read loop on stdin until EOF. */
export async function mcpServeStdioLoop(cli: Cli): Promise<void> {
  let buffer = "";
  for await (const chunk of Bun.stdin.stream()) {
    buffer += new TextDecoder().decode(chunk);
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

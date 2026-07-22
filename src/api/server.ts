/*
HTTP tool server for ArgsBarg programs: health, OpenAPI, and tool invocation.
*/

import type { Cli } from "../cli.ts";
import {
  executeHeadlessToolCall,
  headlessFailureToHttpResponse,
  headlessSuccessToHttpResponse,
  lookupHeadlessTool,
} from "../headless/tool-call.ts";
import type { CliProgram } from "../types.ts";
import { generateOpenApi } from "./openapi.ts";
import { API_CORS_HEADERS, apiDocsHtml, apiErrorResponse, apiOptionsResponse } from "./result.ts";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

/** Resolved listen address for the HTTP API server. */
export function resolveApiListenAddress(program: CliProgram): { hostname: string; port: number } {
  const config = program.apiServer;
  return {
    hostname: config?.host ?? DEFAULT_HOST,
    port: config?.port ?? DEFAULT_PORT,
  };
}

/** Writes a JSON HTTP response with CORS headers. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...API_CORS_HEADERS,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

/** Handles one HTTP request for the API server. */
export async function handleApiRequest(cli: Cli, request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return apiOptionsResponse();
  }

  const root = cli.program;
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === "/health") {
    return jsonResponse(200, { ok: true });
  }

  if (request.method === "GET" && path === "/openapi.json") {
    return jsonResponse(200, generateOpenApi(root));
  }

  if (request.method === "GET" && path === "/openapi-browser") {
    return new Response(apiDocsHtml(), {
      status: 200,
      headers: {
        ...API_CORS_HEADERS,
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  const toolPathMatch = /^\/tools\/([^/]+)$/.exec(path);
  if (request.method === "POST" && toolPathMatch) {
    const toolName = decodeURIComponent(toolPathMatch[1] ?? "");
    let body: unknown = {};
    const rawBody = await request.text();
    if (rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return apiErrorResponse(400, { error: "Invalid JSON body" });
      }
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return apiErrorResponse(400, { error: "Request body must be a JSON object" });
    }
    return invokeApiTool(cli, toolName, body as Record<string, unknown>);
  }

  if (path === "/tools" || path.startsWith("/tools/")) {
    return apiErrorResponse(405, { error: "Method not allowed" });
  }

  return apiErrorResponse(404, { error: "Not found" });
}

/** Resolves a tool and runs it through the shared headless invoke path. */
async function invokeApiTool(cli: Cli, toolName: string, args: Record<string, unknown>): Promise<Response> {
  const lookup = lookupHeadlessTool(cli.program, toolName, "api");
  if (!lookup.ok) {
    if (lookup.kind === "unknown") {
      return apiErrorResponse(404, { error: lookup.message });
    }
    return apiErrorResponse(503, { error: lookup.message });
  }

  const result = await executeHeadlessToolCall(cli, lookup.tool, args, "api");
  if (result.ok) {
    return headlessSuccessToHttpResponse(result, lookup.tool.leaf.apiResponse);
  }
  return headlessFailureToHttpResponse(result);
}

/** Runs the HTTP API server until the process is interrupted. */
export async function apiServeHttp(cli: Cli): Promise<never> {
  const { hostname, port } = resolveApiListenAddress(cli.program);
  const server = Bun.serve({
    hostname,
    port,
    fetch: (request) => handleApiRequest(cli, request),
  });
  process.stderr.write(`HTTP API listening on http://${server.hostname}:${server.port}\n`);
  await new Promise<never>(() => {});
  throw new Error("HTTP API server stopped unexpectedly");
}

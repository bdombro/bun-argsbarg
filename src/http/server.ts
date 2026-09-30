/*
HTTP tool server for ArgsBarg programs: health, OpenAPI, and REST API invocation.
*/

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { AppSpec, HttpWireContext } from "../core/types.ts";
import { schemaStrictnessWarnings } from "../core/validate.ts";
import {
  executeHttpRouteCall,
  headlessFailureToHttpResponse,
  headlessSuccessToHttpResponse,
} from "../headless/tool-call.ts";
import { extractTraceContext, formatTraceparent } from "../log/trace.ts";
import type { App } from "../runtime/cli.ts";
import { leafHttpResponseDefaults } from "../runtime/exposure.ts";
import type { ResolvedHttpServeConfig } from "../server/overrides.ts";
import { generateOpenApi } from "./openapi.ts";
import { evaluateReadiness } from "./readiness.ts";
import { API_CORS_HEADERS, apiDocsHtml, apiErrorResponse, apiOptionsResponse } from "./result.ts";
import { defaultSuccessStatus, matchHttpRoute } from "./routes.ts";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

/** Resolved listen address for the HTTP API server. */
export function resolveHttpListenAddress(program: AppSpec): { hostname: string; port: number } {
  const config = program.httpServer;
  return {
    hostname: config?.host ?? DEFAULT_HOST,
    port: config?.port ?? DEFAULT_PORT,
  };
}

/** Resolves client IP, optionally honoring X-Forwarded-For. */
export function resolveClientIp(request: Request, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) {
      return xff.split(",")[0]?.trim() ?? "unknown";
    }
  }
  return "unknown";
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

function parseQuery(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    out[k] = v;
  }
  return out;
}

/** Handles one HTTP request for the API server. */
export async function handleApiRequest(
  cli: App,
  request: Request,
  resolved?: ResolvedHttpServeConfig,
): Promise<Response> {
  const httpConfig = resolved ?? cli.server?.http;
  const trustProxy = httpConfig?.trustProxy ?? cli.spec.httpServer?.trustProxy ?? false;
  const requestId = randomUUID();
  const url = new URL(request.url);
  const clientIp = resolveClientIp(request, trustProxy);
  const trace = extractTraceContext(request);
  const wireCtx: HttpWireContext = {
    request,
    requestId,
    clientIp,
    path: url.pathname,
    method: request.method,
    ...(trace ? { traceId: trace.traceId, spanId: trace.spanId } : {}),
  };
  const hooks = cli.server?.httpHooks ?? cli.spec.httpServer?.hooks;
  const emitter = cli.server?.emitter;
  const started = performance.now();

  const finish = async (response: Response, failureKind?: string, error?: unknown): Promise<Response> => {
    const durationMs = Math.round(performance.now() - started);
    if (failureKind && error !== undefined) {
      await hooks?.onError?.({
        ...wireCtx,
        failureKind: failureKind as import("../core/types.ts").InvokeFailureKind,
        error,
      });
    } else {
      await hooks?.onResponse?.({ ...wireCtx, status: response.status, durationMs });
    }
    emitter?.emitAccess({
      method: request.method,
      path: url.pathname,
      status: response.status,
      durationMs,
      requestId,
      clientIp,
      traceId: trace?.traceId,
      spanId: trace?.spanId,
    });
    if (!trace) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set(
      "traceparent",
      formatTraceparent({ traceId: trace.traceId, spanId: trace.spanId, sampled: trace.sampled }),
    );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  await hooks?.onRequest?.(wireCtx);

  if (request.method === "OPTIONS") {
    return finish(apiOptionsResponse());
  }

  const root = cli.spec;
  const path = url.pathname;

  if (request.method === "GET" && path === "/health/liveness") {
    return finish(jsonResponse(200, { ok: true }));
  }

  if (request.method === "GET" && path === "/health/readiness") {
    const runtime = cli.server?.runtime;
    if (!runtime) {
      return finish(jsonResponse(200, { ok: true }));
    }
    const readiness = await evaluateReadiness(root, "http", runtime);
    return finish(jsonResponse(readiness.ok ? 200 : 503, readiness));
  }

  if (request.method === "GET" && path === "/openapi.json") {
    return finish(jsonResponse(200, generateOpenApi(root)));
  }

  if (request.method === "GET" && path === "/swagger") {
    return finish(
      new Response(apiDocsHtml(), {
        status: 200,
        headers: {
          ...API_CORS_HEADERS,
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );
  }

  if (path.startsWith("/tools")) {
    return finish(apiErrorResponse(404, { error: "Not found" }));
  }

  const match = matchHttpRoute(root, request.method, path);
  if (match.ok) {
    let body: Record<string, unknown> = {};
    if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
      const rawBody = await request.text();
      if (rawBody.trim().length > 0) {
        try {
          const parsed = JSON.parse(rawBody);
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return finish(apiErrorResponse(400, { error: "Request body must be a JSON object" }));
          }
          body = parsed as Record<string, unknown>;
        } catch {
          return finish(apiErrorResponse(400, { error: "Invalid JSON body" }));
        }
      }
    }

    const query = parseQuery(url);
    const result = await executeHttpRouteCall(cli, match.route, match.pathParams, query, body, {
      request,
      clientIp,
      requestId,
      ...(trace ? { traceId: trace.traceId, spanId: trace.spanId } : {}),
    });
    if (result.ok) {
      const leafHttp = leafHttpResponseDefaults(match.route.leaf);
      const hasBody = result.response.body !== undefined;
      const methodDefault =
        match.route.leaf.http?.successStatus ??
        defaultSuccessStatus(match.route.method, hasBody && match.route.method !== "DELETE");
      return finish(headlessSuccessToHttpResponse(result, leafHttp, methodDefault));
    }
    const obscure = httpConfig?.obscureUnexpected ?? false;
    return finish(headlessFailureToHttpResponse(result, obscure), result.invokeResult?.failureKind, result.message);
  }

  return finish(apiErrorResponse(404, { error: "Not found" }));
}

/** Converts a Node request into a Fetch API `Request` (body buffered). */
async function toFetchRequest(
  /** Incoming Node request. */
  req: IncomingMessage,
  /** Listen address used to build the absolute URL. */
  origin: string,
): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(name, v);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const method = req.method ?? "GET";
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    body = new Uint8Array(Buffer.concat(chunks));
  }
  return new Request(new URL(req.url ?? "/", origin), { method, headers, body });
}

/** Writes a Fetch API `Response` to a Node response. */
async function writeFetchResponse(
  /** Response produced by {@link handleApiRequest}. */
  response: Response,
  /** Outgoing Node response. */
  res: ServerResponse,
): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") headers[name] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers["set-cookie"] = cookies;
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

/** Runs the HTTP API server until the process is interrupted. */
export async function httpServeHttp(cli: App, resolved?: ResolvedHttpServeConfig): Promise<never> {
  const listen = resolved ?? {
    hostname: resolveHttpListenAddress(cli.spec).hostname,
    port: resolveHttpListenAddress(cli.spec).port,
    trustProxy: cli.spec.httpServer?.trustProxy ?? false,
    obscureUnexpected: cli.spec.httpServer?.errors?.obscureUnexpected ?? false,
    log: { format: "json" as const, access: true, errors: true, dev: false },
  };
  const origin = `http://${listen.hostname}:${listen.port}`;
  const server = createServer((req, res) => {
    toFetchRequest(req, origin)
      .then((request) => handleApiRequest(cli, request, listen))
      .then((response) => writeFetchResponse(response, res))
      .catch((err: unknown) => {
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }));
      });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listen.port, listen.hostname, () => resolve());
  });
  const address = server.address() as AddressInfo;
  const url = `http://${listen.hostname}:${address.port}`;
  const emitter = cli.server?.emitter;
  for (const message of schemaStrictnessWarnings(cli.spec)) {
    emitter?.emit({ level: "warn", message, action: "schema.strictness" });
  }
  if (emitter && listen.log.format === "text") {
    emitter.emitLifecycle(`${cli.spec.key} ${cli.spec.version} — HTTP API listening on ${url}`, "http.server.start");
  } else {
    emitter?.emit({
      level: "info",
      message: `HTTP API listening on ${url}`,
      action: "http.server.start",
      labels: { url },
    });
    if (!emitter) {
      process.stderr.write(`HTTP API listening on ${url}\n`);
    }
  }
  await new Promise<never>(() => {});
  throw new Error("HTTP API server stopped unexpectedly");
}

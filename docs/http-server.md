# HTTP API server

ArgsBarg can expose your CLI as an HTTP REST server. Each **leaf command** becomes a route — nested command paths, HTTP verbs, and `:param` routers are reflected in the URL. By default routes sit at the server root (e.g. `GET /workspaces`). The server uses Bun's built-in HTTP stack and binds to **localhost by default**.

The HTTP API is **opt-in**. Apps that do not set `httpServer` on the program root behave exactly as before.

## Quick start

1. Add `httpServer` to your program root:

```typescript
import pkg from "../package.json" with { type: "json" };

const cli = {
  key: "myapp",
  version: pkg.version,
  description: "My app.",
  httpServer: { enabled: true },
  commands: [/* ... */],
} satisfies CliProgram;
```

`httpServer: { enabled: true }` opts in. Omit `httpServer` entirely to disable HTTP. Empty `httpServer: {}` is rejected at validation.

2. Run the HTTP server:

```bash
myapp http
```

The process listens until interrupted. Startup prints the listen URL to stderr.

Optional flags on `myapp http` (and `myapp http serve`): `--host`, `--port`, `--trust-proxy`, `--obscure-errors`, `--log-format`, `--log-file`, `--no-access-log`, `--dev`.

## Configuration

Set `httpServer` on the **program root only**. Validation rejects `httpServer` on nested nodes.

| Field | Default | Purpose |
| --- | --- | --- |
| `enabled` | *(required)* | Must be `true` when `httpServer` is set |
| `host` | `127.0.0.1` | Listen address |
| `port` | `3000` | Listen port |
| `pathPrefix` | `""` | URL prefix for user routes (e.g. `"/api"` → `/api/workspaces`; empty → `/workspaces`) |
| `trustProxy` | `false` | Honor `X-Forwarded-For` in hooks and access logs |
| `errors.errorSchema` | `{ error: string }` | OpenAPI + default error body shape |
| `errors.obscureUnexpected` | `false` | Client sees generic message on 500; ECS logs real stack |
| `hooks` | — | Observe-only wire hooks (`onRequest`, `onResponse`, `onError`) |

`httpServer` and `mcpServer` are independent — enable either or both.

Program-level `program.log` controls ECS JSON vs human text on stderr (and optional file tee). See [docs/decisions.md](decisions.md).

## REST routes

Routes are derived from the command tree:

| CLI path | HTTP | Notes |
| --- | --- | --- |
| `workspaces get` | `GET /workspaces` | Verb leaf (`get`) omitted from URL |
| `workspaces post` | `POST /workspaces` | Default POST success **201** |
| `workspaces :id get` | `GET /workspaces/{id}` | `:id` param router |
| `stat owner lookup` | `POST /stat/owner/lookup` | Default method POST when key is not a verb |

With `httpServer.pathPrefix: "/api"`, the same routes are prefixed (e.g. `GET /api/workspaces`).

When `pathPrefix` is empty, top-level command keys must not collide with framework paths (`health`, `swagger`, `openapi.json`, `tools`).

Method precedence: `leaf.http.method` → verb key (`get`/`post`/…) → **POST**.

Query string binds to options (values starting with `{` or `[` are JSON-parsed). Body on POST/PUT/PATCH binds to options, positionals, and `inputSchema` fields.

Per-surface exposure: `http.enabled: false` removes a leaf from the route table; `http.hidden: true` keeps it callable but omits it from OpenAPI.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health/liveness` | Liveness — server is online and accepting requests |
| `GET` | `/health/readiness` | Readiness — online plus config and optional `program.readiness` checks passed |
| `GET` | `/openapi.json` | OpenAPI 3.1 REST paths (includes `/health/*` and user routes) |
| `GET` | `/swagger` | Interactive Swagger UI API reference (CDN) |
| `*` | `/{command}/...` | Invoke user commands (method per route; optional `pathPrefix`) |
| `OPTIONS` | `*` | CORS preflight (`GET, POST, PUT, PATCH, DELETE`) |

`POST /tools/*` was removed in 7.0.

## Examples

```bash
curl -s http://127.0.0.1:3000/health/liveness
curl -s http://127.0.0.1:3000/health/readiness
curl -s http://127.0.0.1:3000/openapi.json
open http://127.0.0.1:3000/swagger
curl -s http://127.0.0.1:3000/workspaces
curl -s -X POST http://127.0.0.1:3000/workspaces \
  -H 'content-type: application/json' \
  -d '{"name":"qa2"}'
curl -s http://127.0.0.1:3000/workspaces/{id}
```

Discover paths and request shapes from `openapi.json` or `myapp docs openapi`.

## Handler responses (`ctx.respond()`)

API and MCP tool handlers must return machine-readable output via **`ctx.respond()`** or by **returning a value** (implicit JSON). `console.log` is not included in HTTP/MCP success payloads.

```typescript
handler: (ctx) => {
  if (ctx.hasFlag("json")) {
    return { user: "alice", path: "/tmp" };
  }
  ctx.respond({
    body: pdfBytes,
    contentType: "application/pdf",
    headers: { "Content-Disposition": 'inline; filename="invoice.pdf"' },
  });
},
```

**CLI mode:** `ctx.respond()` prints to stdout. Handlers may still use `console.log` for human-only CLI output.

### Leaf HTTP metadata

```typescript
http?: {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  segment?: string;              // URL segment override
  successStatus?: number;
  successContentType?: string;   // OpenAPI + default Content-Type
  contentDisposition?: string;
};
```

## Responses

**Success:** status from `ctx.respond({ status })` → `http.successStatus` → method default (GET 200, POST 201, DELETE 204 without body).

| Body type | HTTP `Content-Type` |
| --- | --- |
| object / array | `application/json` |
| string | handler `contentType` or `text/plain` |
| `Uint8Array` | e.g. `application/pdf` (set explicitly) |

**Errors:** JSON `{ "error": "..." }` by default (override with `httpServer.errors.errorSchema`).

| Situation | Status |
| --- | --- |
| Validation / help | 400 |
| Unknown route | 404 |
| Thrown handler / missing `ctx.respond()` | 500 |
| Missing required config | 503 |

Tool invocations are **not** gated on `/health/readiness`; readiness is for orchestrators only.

## Hooks and runtime

`program.hooks` (`beforeInvoke`, `afterInvoke`, `formatError`, `onError`) run for user commands on CLI, HTTP, and MCP — **not** for builtins.

- `ctx.locals` — per-request bag (fresh each invoke); framework sets `requestId` before `beforeInvoke` (HTTP/MCP wire id when present, else a new UUID)
- `ctx.runtime` — shared `ServerRuntime.state` on HTTP/MCP server sessions
- `ctx.pathParams` — values from `:param` routers

Error order: `formatError` → `onError` → ECS log → client response.

## CORS

All responses include wide-open CORS headers (`Access-Control-Allow-Origin: *`). Not configurable in v1.

## OpenAPI

Call `generateOpenApi(program)` from `argsbarg/http`, fetch `GET /openapi.json`, or run `myapp docs openapi --save`. Nested `$ref` in input/output schemas are dereferenced in the spec.

## Complex tool inputs

Set `inputSchema` on the leaf and read coerced values with `ctx.inputs` / `ctx.inputsAs<T>()`. HTTP query, body, and path params merge into inputs before validation.

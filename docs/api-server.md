# HTTP API server

ArgsBarg can expose your CLI as an HTTP tool server. Each **leaf command** becomes a callable tool — the same exposure model as MCP. The server uses Bun's built-in HTTP stack and binds to **localhost by default**.

The HTTP API is **opt-in**. Apps that do not set `apiServer` on the program root behave exactly as before.

## Quick start

1. Add `apiServer` to your program root:

```typescript
import pkg from "../package.json" with { type: "json" };

const cli = {
  key: "myapp",
  version: pkg.version,
  description: "My app.",
  apiServer: { enabled: true },
  commands: [/* ... */],
} satisfies CliProgram;
```

`apiServer: { enabled: true }` opts in. Omit `apiServer` entirely to disable HTTP. Empty `apiServer: {}` is rejected at validation.

2. Run the HTTP server:

```bash
myapp api
```

The process listens until interrupted. Startup prints the listen URL to stderr.

## Configuration

Set `apiServer` on the **program root only**. Validation rejects `apiServer` on nested nodes.

| Field | Default | Purpose |
| --- | --- | --- |
| `enabled` | *(required)* | Must be `true` when `apiServer` is set |
| `host` | `127.0.0.1` | Listen address |
| `port` | `3000` | Listen port |

`apiServer` and `mcpServer` are independent — enable either or both.

## Tool names

HTTP and MCP use different tool identifiers for the same leaf command:

| CLI path | HTTP API (`POST /tools/:name`) | MCP (`tools/call`) |
| --- | --- | --- |
| `stat owner lookup` | `stat-owner-lookup` | `stat_owner_lookup` |
| `render-invoice` | `render-invoice` | `render_invoice` |

OpenAPI `paths` use the API id (`/tools/render-invoice`, etc.).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET` | `/openapi.json` | OpenAPI 3.1 document (per-tool `POST /tools/{name}` paths) |
| `GET` | `/openapi-browser` | Interactive Scalar API reference (CDN) |
| `POST` | `/tools/:name` | Invoke tool; body is a flat JSON args object |
| `OPTIONS` | `*` | CORS preflight (wide-open `Access-Control-Allow-Origin: *`) |

## Examples

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/openapi.json
open http://127.0.0.1:3000/openapi-browser
curl -s -X POST http://127.0.0.1:3000/tools/{tool-key} \
  -H 'content-type: application/json' \
  -d '{...}'
```

Replace `{tool-key}` with a path segment from `openapi.json` (`paths` keys are `/tools/{tool-key}`); body keys match that tool's flat JSON args (see `docs cli-schema` or `openapi.json`).

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

**CLI mode:** `ctx.respond()` prints to stdout (JSON pretty-printed, strings as-is, `Uint8Array` as raw bytes). Handlers may still use `console.log` for human-only CLI output.

### Leaf metadata

```typescript
apiResponse?: {
  contentType?: string;           // default application/json
  contentDisposition?: string;    // e.g. attachment; filename="invoice.pdf"
};
```

Used by OpenAPI and as a default `Content-Type` when the handler does not set one.

## Responses

**Success (`200`):** raw body — no `{ ok, stdout }` envelope.

| Body type | HTTP `Content-Type` |
| --- | --- |
| object / array | `application/json` |
| string | handler `contentType` or `text/plain` |
| `Uint8Array` | e.g. `application/pdf` (required on `respond()`) |

**Errors:** JSON `{ "error": "...", "exitCode?": number }` with `400` (bad args), `404` (unknown tool), `503` (missing config), or `500` (handler failure).

## MCP binary payloads

Binary `ctx.respond()` bodies are encoded in MCP `structuredContent` as:

```json
{ "data": "<base64>", "contentType": "application/pdf", "encoding": "base64" }
```

String bodies use `{ "content": "...", "contentType": "..." }`. JSON objects are returned as-is in `structuredContent`.

## CORS

All responses include wide-open CORS headers (`Access-Control-Allow-Origin: *`). Not configurable in v1.

## OpenAPI

Call `generateOpenApi(program)` or `openApiJson(program)` from the package, fetch `GET /openapi.json` from a running server, or run `myapp docs openapi` / `myapp docs openapi --save` (writes `./docs/openapi.json` when `docs.enabled` and `apiServer.enabled`). Tools with custom `inputSchema` on the leaf are reflected in the document.

## Complex tool inputs

For nested request bodies (e.g. invoice template data), set `inputSchema` on the leaf and read `ctx.toolArgs` in the handler — it contains the original flat JSON body from `POST /tools/:name`.

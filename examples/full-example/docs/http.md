# HTTP API (full-example)

full-example exposes the same callable tools over HTTP as MCP.

## Running

```bash
full-example api
```

Listens on **http://127.0.0.1:3000** by default (`apiServer.host` / `apiServer.port`).

Bind is localhost-only in v0 — use a reverse proxy for remote access.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET` | `/openapi.json` | OpenAPI 3.1 document (tool paths and request shapes) |
| `GET` | `/openapi-browser` | Interactive Scalar API reference |
| `POST` | `/tools/:name` | Invoke with flat JSON args object in the body |
| `OPTIONS` | `*` | CORS preflight |

Replace `{tool-key}` below with a path segment from `openapi.json` (`paths` keys are `/tools/{tool-key}`). Match body keys to that tool's `requestBody` schema in the spec.

## Examples

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/openapi.json
curl -s -X POST http://127.0.0.1:3000/tools/{tool-key} \
  -H "content-type: application/json" \
  -d '{...}'
```

## Responses

Success (`200`): raw response body (JSON object, string, or binary). No `{ ok, stdout }` envelope.

Handlers must use `ctx.respond()` or return a value for API/MCP tool calls.

Errors use `{ "error": "..." }` with `400`, `404`, `503`, or `500`.

## Configuration

Configure before first use: `full-example configure`.

Default config file: `~/.local/lib/full_example/config.json`.

- **apiToken** (`apiToken`, required → env `FULL_EXAMPLE_API_TOKEN`) — Create at https://example.com/settings/tokens
- **defaultRegion** (`defaultRegion`, optional) — AWS region for API calls.
- **maxRetries** (`maxRetries`, optional) — HTTP retry count (0–10).
- **prefs** (`prefs`, optional) — Local cache preferences (not exported to env).

## Exposed tools

- `echo` (MCP: `echo`, CLI: `full-example echo`) — echo — Echo a message (MCP-friendly leaf).
- `status` (MCP: `status`, CLI: `full-example status`) — status — Show resolved config and app version. (flags: --json)

## Tool arguments

POST bodies are a flat JSON object keyed by long option and positional names (hyphenated option names are valid keys).

For HTTP clients, use **`GET /openapi.json`** (or **`GET /openapi-browser`**) for per-tool request shapes — each `POST /tools/{name}` path has a `requestBody` schema.

Varargs positionals accept a JSON array of strings (not a comma-separated string).
Options with `format: comma-list` accept a comma-separated string or JSON array.
Options with a schema `default` are applied when omitted.

Shell invocation reference: `full-example docs api`. Full CLI tree JSON: `full-example docs cli-schema`.

## OpenAPI

The HTTP API is described in OpenAPI 3.1.

- **Browse** — [http://127.0.0.1:3000/openapi-browser](http://127.0.0.1:3000/openapi-browser) (Scalar UI; loads `/openapi.json`)
- **Fetch** — `curl -s http://127.0.0.1:3000/openapi.json`
- **Save offline** — `full-example docs openapi --save` → `./docs/openapi.json` (or `just docgen` in app repos)

Use the spec to discover tool names (`paths`) and request/response shapes before calling `POST /tools/:name`.

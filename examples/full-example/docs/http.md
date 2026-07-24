# HTTP API (full-example)

full-example exposes user commands over HTTP REST routes derived from the CLI tree.

## Running

```bash
full-example http
```

Listens on **http://127.0.0.1:3000** by default (`httpServer.host` / `httpServer.port`).

Bind is localhost-only in v0 — use a reverse proxy for remote access.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` or `/health/live` | Liveness check |
| `GET` | `/health/ready` | Readiness (config + `program.readiness`) |
| `GET` | `/openapi.json` | OpenAPI 3.1 REST paths |
| `GET` | `/swagger` | Interactive Swagger UI API reference |
| `*` | `/api/...` | Invoke user commands (method per route) |
| `OPTIONS` | `*` | CORS preflight |

Discover paths from `openapi.json` (`/api/...`). Query binds options; POST/PUT/PATCH body binds options and `inputSchema` fields.

## Examples

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/ready
curl -s http://127.0.0.1:3000/openapi.json
curl -s http://127.0.0.1:3000/api/workspaces
curl -s -X POST http://127.0.0.1:3000/api/workspaces \
  -H "content-type: application/json" \
  -d '{"name":"qa2"}'
```

## Responses

Success: status from handler → `http.successStatus` → method default (GET 200, POST 201, DELETE 204).

Handlers must use `ctx.respond()` or return a value for API/MCP tool calls.

Errors use `{ "error": "..." }` with `400`, `404`, `503`, or `500`.

## REST routes

- `POST /api/echo` (CLI: `full-example echo`) — Echo a message (MCP-friendly leaf).
- `POST /api/render-json` (CLI: `full-example render-json`) — Echo a JSON message (schema-first JSON leaf demo).
- `POST /api/status` (CLI: `full-example status`) — Show app version. (flags: --json)
- `GET /api/workspaces` (CLI: `full-example workspaces get`) — List workspaces.
- `POST /api/workspaces` (CLI: `full-example workspaces post`) — Create a workspace.
- `GET /api/workspaces/{id}` (CLI: `full-example workspaces :id get`) — Get one workspace.
- `PUT /api/workspaces/{id}` (CLI: `full-example workspaces :id put`) — Replace a workspace.
- `PATCH /api/workspaces/{id}` (CLI: `full-example workspaces :id patch`) — Patch a workspace name.
- `DELETE /api/workspaces/{id}` (CLI: `full-example workspaces :id delete`) — Delete a workspace.

## Request bodies

POST/PUT/PATCH bodies are a flat JSON object keyed by long option and positional names (hyphenated option names are valid keys).

For HTTP clients, use **`GET /openapi.json`** (or **`GET /swagger`**) for per-route request shapes.

Varargs positionals accept a JSON array of strings (not a comma-separated string).
Options with `format: comma-list` accept a comma-separated string or JSON array.
Options with a schema `default` are applied when omitted.

Shell invocation reference: `full-example docs cli`. Full CLI tree JSON: `full-example docs cli-schema`.

## OpenAPI

The HTTP API is described in OpenAPI 3.1.

- **Browse** — [http://127.0.0.1:3000/swagger](http://127.0.0.1:3000/swagger) (Swagger UI; loads `/openapi.json`)
- **Fetch** — `curl -s http://127.0.0.1:3000/openapi.json`
- **Save offline** — `full-example docs openapi --save` → `./docs/openapi.json` (or `just docgen` in app repos)

Use the spec to discover REST paths and request/response shapes before calling `/api/...`.

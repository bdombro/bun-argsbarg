# Server logging

When you run `myapp http` or `myapp mcp`, Argsbarg writes **server logs to stderr** — not to stdout (handlers and CLI output stay on stdout).

By default each log line is **one JSON object** (NDJSON), shaped for the [ECS Logging](https://github.com/elastic/ecs-logging) convention. That plays nicely with Datadog, Elasticsearch, GCP Logging, and similar collectors.

For local development, switch to plain text with `--log-format text` or `program.log.format: "text"`.

## What gets logged

| Event | When | `event.action` |
| --- | --- | --- |
| Server start | HTTP/MCP process listens | `http.server.start` / `server.start` |
| Access | After each HTTP request or MCP JSON-RPC message | `http.access` / `mcp.access` |
| Invoke error | After `formatError` → `onError`, before the client sees the error | `invoke.error` |

Toggle access or error lines with `program.log.access` and `program.log.errors` (both default to `true`).

## Example line (default JSON)

After `GET /workspaces` returns 200 in 45ms:

```json
{
  "@timestamp": "2026-07-27T14:00:00.000Z",
  "log.level": "info",
  "message": "GET /workspaces",
  "ecs.version": "8.11.0",
  "service.name": "myapp",
  "service.version": "1.0.0",
  "event.action": "http.access",
  "http.request.method": "GET",
  "url.path": "/workspaces",
  "http.response.status_code": 200,
  "event.duration": 45000000,
  "labels": { "request_id": "…" }
}
```

`event.duration` is in **nanoseconds** (ECS convention). Durations in hook callbacks (`durationMs`) stay in milliseconds.

When the client sends a W3C **`traceparent`** header, lines also include `trace.id` and `span.id`, and the response echoes an updated `traceparent`.

## `program.log` options

Set on the **program root** (same level as `httpServer` / `mcpServer`):

```typescript
const program = {
  key: "myapp",
  version: "1.0.0",
  description: "…",
  log: {
    format: "json",   // "text" for human-readable stderr
    file: "server.log", // optional tee; relative paths → app config dir
    access: true,     // HTTP/MCP access lines
    errors: true,     // invoke error lines
  },
  // …
} satisfies CliProgram;
```

| Field | Default | Purpose |
| --- | --- | --- |
| `format` | `"json"` | `"json"` = ECS Logging NDJSON; `"text"` = `INFO [http.access]: GET /path` |
| `file` | — | Append the same lines to this path |
| `access` | `true` | Emit one line per HTTP request / MCP message |
| `errors` | `true` | Emit when a user command fails on HTTP/MCP |
| `enrich` | — | Add custom fields to each JSON line (see below) |
| `serialize` | — | Replace the built-in formatter entirely (see below) |

CLI overrides on `myapp http` and `myapp mcp serve`: `--log-format`, `--log-file`, `--no-access-log` (HTTP only), `--dev` (print full stacks to stderr on errors).

## `program.log.enrich` — add fields

Use **`enrich`** when you want **extra JSON fields** on top of the default ECS line — for example a team label, deployment cell, or a shape your log pipeline expects.

`enrich` is **additive only**. It cannot change `@timestamp`, `log.level`, `message`, `ecs.version`, `service.name`, `service.version`, or any field Argsbarg already set on that line.

```typescript
import type { LogEnrichContext } from "argsbarg";

const program = {
  // …
  log: {
    format: "json",
    enrich: (ctx: LogEnrichContext) => {
      // Always available:
      // ctx.level, ctx.message, ctx.action, ctx.service.name, ctx.service.version
      // ctx.requestId, ctx.traceId, ctx.spanId (when present)
      // ctx.labels, ctx.error (on error lines)

      // On access logs (http.access / mcp.access):
      // ctx.http.method, ctx.http.path, ctx.http.status, ctx.http.durationMs, ctx.http.clientIp

      return {
        deployment: "prod",
      };
    },
  },
} satisfies CliProgram;
```

Return a flat object of field names → values. Argsbarg merges each key onto the log line unless that key is already set. To add team metadata inside ECS `labels`, put it in `event.labels` via hooks rather than fighting merge order — or use `serialize` for full control.

## `program.log.serialize` — own the whole line

Use **`serialize`** when the default ECS line is not what you need — for example a legacy JSON schema used only in your organization.

When `serialize` is set, Argsbarg **does not** run the ECS formatter. Your function receives the same `LogEnrichContext` as `enrich` and must return the **full line text without a trailing newline** (Argsbarg adds `\n`).

```typescript
import type { LogEnrichContext } from "argsbarg";

const program = {
  // …
  log: {
    format: "json",
    serialize: (ctx: LogEnrichContext) =>
      JSON.stringify({
        message: ctx.message,
        level: ctx.level.toUpperCase(),
        contextMap: {
          ...(ctx.traceId ? { trace_id: ctx.traceId } : {}),
          ...(ctx.spanId ? { span_id: ctx.spanId } : {}),
        },
      }),
  },
} satisfies CliProgram;
```

Do **not** set both `enrich` and `serialize` expecting both to apply — `serialize` wins and `enrich` is ignored.

Prefer **`enrich`** when you only need a few extra fields. Reserve **`serialize`** for fully custom output.

## Trace correlation (HTTP)

If an upstream service (gateway, sidecar, mesh) sends a standard **`traceparent`** header:

1. Argsbarg parses it and logs `trace.id` / `span.id`.
2. The HTTP response includes an updated `traceparent` for this hop.

No configuration required. If the header is missing, Argsbarg does not invent a trace id.

## Related

- [http-server.md](http-server.md) — HTTP server setup and endpoints
- [mcp.md](mcp.md) — MCP server (same `program.log` applies)
- [decisions.md](decisions.md#structured-logging-ecs-logging) — why ECS Logging and hooks instead of a bundled observability SDK

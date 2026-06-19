# MCP server

ArgsBarg can expose your CLI to AI agents through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). Each **leaf command** becomes an MCP tool; the full command tree is available as a schema resource. The server speaks JSON-RPC over stdio — one JSON object per line on stdin and stdout.

MCP is **opt-in**. Apps that do not set `mcpServer` on the program root behave exactly as before.

## Quick start

1. Add `mcpServer` to your program root:

```typescript
const cli: CliCommand = {
  key: "myapp",
  description: "My app.",
  mcpServer: { name: "myapp", version: "1.0.0" },
  commands: [/* ... */],
};
```

`mcpServer: {}` is enough to enable the server. Optional fields override defaults (see [Configuration](#configuration)).

2. Run the MCP server:

```bash
myapp mcp
```

The process reads NDJSON requests from stdin and writes NDJSON responses to stdout. It stays alive until stdin closes.

3. Point your MCP client at that command. See [Client setup](#client-setup).

The `examples/nested.ts` demo enables MCP — try:

```bash
bun run examples/nested.ts mcp
```

## Client setup

### Cursor

Add a server entry under `mcpServers` in your Cursor MCP config:

```json
{
  "mcpServers": {
    "myapp": {
      "command": "bun",
      "args": ["run", "myapp.ts", "mcp"]
    }
  }
}
```

Use your real binary or script path. For a compiled CLI, `command` can be the installed binary and `args` can be `["mcp"]` only.

### Other MCP hosts

Any host that spawns a subprocess and wires stdin/stdout works the same way: the **command** is your app, and **`mcp`** is the subcommand that starts the server.

## Configuration

Set `mcpServer` on the **program root only** (the `CliCommand` passed to `cliRun`). Validation rejects `mcpServer` on nested nodes.

| Field | Default | Purpose |
| --- | --- | --- |
| `name` | root `key` | `serverInfo.name` in the `initialize` response |
| `version` | `package.json` `version` in cwd, else `"0.0.0"` | `serverInfo.version` |
| `schemaResourceUri` | `"argsbarg://schema"` | URI for the schema resource |

Example with all fields:

```typescript
mcpServer: {
  name: "nested-demo",
  version: "1.0.0",
  schemaResourceUri: "argsbarg://schema",
}
```

## Tools

Every **user-defined leaf command** in your schema becomes one MCP tool. Built-ins (`completion`, `mcp`) are not exposed as tools.

### Tool names

Tool names are derived from the command path, with each segment sanitized (non-alphanumeric characters become `_`) and joined with `_`.

| CLI invocation | Tool name |
| --- | --- |
| `myapp deploy` | `deploy` |
| `myapp stat owner lookup` | `stat_owner_lookup` |
| `nested.ts read` | `read` |

### Tool descriptions

Each tool’s `description` includes the human CLI path and the leaf’s help text, separated by an em dash:

| CLI path | MCP `description` |
| --- | --- |
| `stat owner lookup` | `stat owner lookup — Resolve owner info.` |
| `read` | `read — Print the first line of each file.` |
| (root leaf app) | `{root.key} — Tiny demo.` |

### Per-leaf visibility

Set `mcpTool: { enabled: false }` on a **leaf command** to hide it from `tools/list` while keeping it in the CLI and in `--schema` output:

```typescript
{
  key: "debug",
  description: "Internal diagnostics.",
  mcpTool: { enabled: false },
  handler: () => { /* ... */ },
}
```

Omitted or `enabled: true` exposes the command (default). `mcpTool` is only valid on leaves — not on the program root or routing groups.

### Tool arguments

Each tool’s `inputSchema` is a JSON Schema object built from your CLI definition:

- **Options** — parent-scoped flags are included (e.g. `stat`’s `--json` appears on `stat_owner_lookup`). Presence options are `boolean`; string and number options match their `CliOptionKind`. Required options are listed in `required`.
- **Positionals** — one property per `CliPositional` on the leaf. Single-slot positionals are `string`; varargs tails (`argMax: 0`) are `string[]`. Required positionals are listed in `required`.

Arguments are a **flat JSON object** keyed by option and positional names (same names as in your schema, including hyphenated option names like `"user-name"`).

Example for `nested.ts stat owner lookup`:

```json
{
  "path": "/path/to/file",
  "user-name": "alice",
  "json": true
}
```

This maps to argv: `stat owner lookup --json --user-name alice /path/to/file`.

Tool arguments use **long option names** only (`user-name`, not `-u`). Short aliases from your schema are not accepted in MCP tool calls.

### Tool results

On success (`isError: false`):

- **stdout** — first `content` text block with the handler’s captured stdout (raw, unchanged).
- **stderr** — when non-empty, a second `content` text block with trimmed stderr (no prefix). The block’s position signals stderr; hosts may label it themselves.
- **structuredContent** — when trimmed stdout is valid JSON, the parsed value is also returned per the [MCP tools spec](https://modelcontextprotocol.io/specification/draft/server/tools). Objects and arrays from flags like `--json` are the common case. JSON **primitives** (`true`, `42`, `"hello"`) are parsed too — a handler that prints the literal string `true` as human text would get `structuredContent: true`. Prefer objects for machine-readable output.

On failure (parse error, validation error, non-zero exit, thrown error), the message is returned as text content with `isError: true`. Handler stderr is included when present.

Help and `--schema` are not available through tool calls; use the schema resource or run the CLI directly for those.

## Schema resource

The server advertises one MCP resource: your full CLI tree as JSON — the same output as `myapp --schema`.

| Property | Value |
| --- | --- |
| Default URI | `argsbarg://schema` |
| MIME type | `application/json` |
| Contents | `cliSchemaJson(root)` — handlers omitted, built-ins excluded |

Agents can read this resource to discover commands, options, and positionals without guessing tool shapes.

## Protocol

- **Transport:** stdio, newline-delimited JSON (NDJSON).
- **JSON-RPC:** version `2.0`.
- **MCP protocol version:** `2024-11-05` (reported in `initialize`).

### Supported methods

| Method | Description |
| --- | --- |
| `initialize` | Returns capabilities (`tools`, `resources`) and `serverInfo`. |
| `notifications/initialized` | Acknowledged; no response (notification). |
| `ping` | Returns `{}`. |
| `tools/list` | Lists all tools with `name`, `description`, `inputSchema`. |
| `tools/call` | Runs a leaf handler; params: `name`, `arguments` (object). |
| `resources/list` | Lists the schema resource. |
| `resources/read` | Returns schema JSON; params: `uri`. |

Requests without an `id` are treated as notifications and do not receive a response (except `notifications/initialized`, which is ignored after parsing).

### Manual smoke test

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | bun run examples/nested.ts mcp
```

You should get one JSON line on stdout with `result.capabilities` and `result.serverInfo`.

## Reserved names

When MCP is enabled:

- Do not declare a top-level command named **`mcp`** — it is reserved for the built-in subcommand.
- Do not declare a top-level command named **`completion`** — reserved for shell completions.
- Do not declare an option named **`schema`** — reserved for `--schema`.

Running `myapp mcp` without `mcpServer` on the root fails with an error (exit 1).

## Design notes

- **Zero extra dependencies** — hand-rolled NDJSON JSON-RPC on top of ArgsBarg’s existing parser and schema.
- **Same handlers** — tool calls run your real leaf handlers via an internal invoke path that captures stdout/stderr and does not exit the process, so the MCP server can handle many requests in one process.
- **User schema only** — tool dispatch uses your program root, not merged presentation builtins.

For the `--schema` export used by the resource, see the main README built-ins section.

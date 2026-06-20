# MCP server

ArgsBarg can expose your CLI to AI agents through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). Each **leaf command** becomes an MCP tool; the full command tree is available as a schema resource. The server speaks JSON-RPC over stdio — one JSON object per line on stdin and stdout.

MCP is **opt-in**. Apps that do not set `mcpServer` on the program root behave exactly as before.

## Quick start

1. Add `mcpServer` to your program root:

```typescript
const cli = {
  key: "myapp",
  description: "My app.",
  mcpServer: { name: "myapp", version: "1.0.0" },
  commands: [/* ... */],
} satisfies CliProgram;
```

`mcpServer: {}` is enough to enable the server. Optional fields override defaults (see [Configuration](#configuration)).

2. Run the MCP server:

```bash
myapp mcp
```

The process reads NDJSON requests from stdin and writes NDJSON responses to stdout. It stays alive until stdin closes.

3. Point your MCP client at that command. See [Client setup](#client-setup).

Optionally install an agent skill for discovery without MCP: see [docs/ai-skills.md](ai-skills.md).

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
      "args": ["run", "myapp.ts", "ai", "mcp"]
    }
  }
}
```

Use your real binary or script path. For a compiled CLI, `command` can be the installed binary and `args` can be `["ai", "mcp"]`.

### Other MCP hosts

Any host that spawns a subprocess and wires stdin/stdout works the same way: the **command** is your app, and **`mcp`** starts the server.

## Configuration

Set `mcpServer` on the **program root only** (the `CliProgram` passed to `cliRun`). Validation rejects `mcpServer` on nested nodes.

| Field | Default | Purpose |
| --- | --- | --- |
| `name` | root `key` | `serverInfo.name` in the `initialize` response |
| `version` | `package.json` `version` in cwd, else `"0.0.0"` | `serverInfo.version` |
| `schemaResourceUri` | `"argsbarg://schema"` | URI for the schema resource |
| `shellEnv` | off | Capture login-shell `env` at startup (`true` uses `$SHELL`, or pass a shell path) |
| `envFile` | off | Load a `.env` file after `shellEnv` (`~` supported); warns on stderr if missing |
| `resources` | `[]` | Custom `CliMcpResource` entries for `resources/list` and `resources/read` |

Example with all fields:

```typescript
mcpServer: {
  name: "nested-demo",
  version: "1.0.0",
  schemaResourceUri: "argsbarg://schema",
}
```

## Tools

Every **user-defined leaf command** in your schema becomes one MCP tool. Built-ins (`completion`, `ai`) are not exposed as tools.

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

### Per-leaf tool metadata

```typescript
mcpTool: {
  enabled: true,
  description: "Custom tools/list text (overrides auto-generated path + help).",
  requiresEnv: ["API_TOKEN", "DATABASE_URL"],
}
```

- **`description`** — when set, replaces the auto-generated `path — help` description entirely (no automatic `requiresEnv` suffix; mention vars in your text if needed).
- **`requiresEnv`** — on auto-generated descriptions, appended as `[requires env: …]`. Enforced at `tools/call` time before the handler runs. Empty or unset env values count as missing.

### Tool arguments

Each tool’s `inputSchema` is a JSON Schema object built from your CLI definition:

- **Options** — parent-scoped flags are included (e.g. `stat`’s `--json` appears on `stat_owner_lookup`). Presence options are `boolean`; string, number, and **enum** options match their `CliOptionKind` (`Enum` uses JSON Schema `enum`). Required options are listed in `required`.
- **Positionals** — one property per `CliPositional` on the leaf. Single-slot positionals are `string`; varargs tails (`argMax: 0`) are `string[]`. Required positionals are listed in `required`. For varargs, agents may also pass a comma-separated string (`"a,b"`) or a single string (`"a"`) — both are coerced to separate argv tokens at dispatch time.

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

## Schema and custom resources

The built-in resource `argsbarg://schema` (or `schemaResourceUri`) exposes your full CLI tree as JSON — the same output as `myapp --schema`.

| Property | Value |
| --- | --- |
| Default URI | `argsbarg://schema` |
| MIME type | `application/json` |
| Contents | `cliSchemaJson(root)` — handlers omitted, built-ins excluded |

Add custom resources on the program root:

```typescript
mcpServer: {
  resources: [
    {
      uri: "myapp://config",
      name: "config",
      description: "Resolved app configuration.",
      mimeType: "application/json",
      load: () => JSON.stringify({ /* … */ }),
    },
  ],
},
```

URIs must be unique and must not equal `schemaResourceUri`. `load()` runs synchronously at `resources/read` time.

## Invocation context

Handlers receive `ctx.invocation`: `"cli"` for normal `cliRun` dispatch, `"mcp"` for MCP `tools/call`.

Use this to branch subprocess behavior — MCP stdout is the JSON-RPC wire, so child processes must not inherit it:

```typescript
handler: async (ctx) => {
  const proc = Bun.spawn(["my-tool", ...ctx.args], {
    stdout: ctx.invocation === "mcp" ? "pipe" : "inherit",
    stderr: "inherit",
  });
  // capture proc.stdout when piping…
};
```

`Bun.spawn({ stdout: "inherit" })` under MCP corrupts the wire. Prefer `"pipe"` and let argsbarg return captured handler stdout in the tool result.

### `cliInvoke` (public API)

`cliInvoke(root, argv)` runs a leaf handler without exiting the process — useful for tests and headless integrations. Returns `{ kind, exitCode, stdout, stderr }`. MCP tool dispatch uses this internally.

**Note:** Tool output is buffered until the handler completes. Live streaming (e.g. `tail -f`) is not supported yet; see [Design notes](#design-notes).

## Environment bootstrapping

MCP hosts (e.g. Cursor) often spawn your server with a minimal environment — missing `PATH` entries for Homebrew, nvm, rbenv, etc.

At server start (`cliMcpServeStdio`), before the NDJSON loop:

| Order | Source | Behavior |
| --- | --- | --- |
| 1 | `shellEnv` | Spawns `$SHELL -l -c env`; merges into `process.env` |
| 2 | `envFile` | Loads `.env`; **overwrites** keys from step 1 |

**`shellEnv` merge rules:**

- **`PATH`** — shell-only segments are **prepended** to the host `PATH` (always merged).
- **Other vars** — set only when absent from the host environment (host wins).
- On failure — one-line warning on **stderr**; server continues.

**`envFile`:**

- Supports `~` expansion.
- Missing file — warning on stderr, server continues.
- Keys from the file **always overwrite** `process.env`.

Example:

```typescript
mcpServer: {
  shellEnv: true,
  envFile: "~/.config/myapp/mcp.env",
},
```

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
| `resources/list` | Lists schema + custom resources. |
| `resources/read` | Returns resource body; params: `uri`. |

Requests without an `id` are treated as notifications and do not receive a response (except `notifications/initialized`, which is ignored after parsing).

### Manual smoke test

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | bun run examples/nested.ts mcp
```

You should get one JSON line on stdout with `result.capabilities` and `result.serverInfo`.

## Reserved names

When MCP is enabled:

- Do not declare a top-level command named **`ai`** — it is reserved for the built-in AI integration group.
- Do not declare a top-level command named **`completion`** — reserved for shell completions.
- Do not declare an option named **`schema`** — reserved for `--schema`.

Running `myapp mcp` without `mcpServer` on the root fails with an error (exit 1).

## Design notes

- **Zero extra dependencies** — hand-rolled NDJSON JSON-RPC on top of ArgsBarg’s existing parser and schema.
- **Same handlers** — tool calls run your real leaf handlers via an internal invoke path that captures stdout/stderr and does not exit the process, so the MCP server can handle many requests in one process.
- **User schema only** — tool dispatch uses your program root, not merged presentation builtins.
- **Buffered output** — MCP tool results are sent after the handler finishes. Incremental stdout (log tail, progress) is not streamed; a future release may add MCP progress notifications.

For the `--schema` export used by the resource, see the main README built-ins section.

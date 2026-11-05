# MCP server

> This feature is experimental.

ArgsBarg can expose your CLI to AI agents through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). Each **command with a handler** becomes an MCP tool. The server speaks JSON-RPC over stdio — one JSON object per line on stdin and stdout.

MCP is **opt-in**. Apps that do not set `mcpServer` on the app root behave exactly as before.

The server negotiates MCP `2025-11-25`, `2025-06-18`, or `2024-11-05`. This minor preserves initialization, session capabilities, workspace roots discovery, and existing output envelopes. The modern-only `2026-07-28` rewrite is deferred. Configuration examples below do not establish compatibility with a particular client version or runtime.

## Quick start

1. Add `mcpServer` to your app root:

```typescript
import pkg from "../package.json" with { type: "json" };

const app = argsbarg({
  key: "myapp",
  version: pkg.version,
  description: "My app.",
  mcpServer: { enabled: true },
  commands: [/* ... */],
});
```

`mcpServer: { enabled: true }` opts in. Omit `mcpServer` entirely to disable MCP. Empty `mcpServer: {}` is rejected at validation.

2. Run the MCP server:

```bash
myapp mcp
```

The process reads NDJSON requests from stdin and writes NDJSON responses to stdout. It stays alive until stdin closes.

3. Point your MCP client at that command. See [Client setup](#client-setup).

Templates ship an agent skill at `skills/<key>/SKILL.md` (authored, not generated); `mcp bundle` packs it into plugins (see [MCP Bundle](#mcp-bundle-mcp-bundle)).

The `examples/nested.ts` demo enables MCP — try:

```bash
node examples/nested.ts mcp
```

## Client setup

### Agent plugin (recommended)

Ship the app as an agent plugin (Claude Code, Cursor) or `.mcpb` bundle (Claude Desktop) with **`mcp bundle`** (see [MCP Bundle](#mcp-bundle-mcp-bundle)). The plugin launches the server and bundles the app's skill. argsbarg does not write MCP client config files; clients without plugin support use the manual setup below.

### Manual client setup

Install the CLI so `myapp` is on your PATH, then add:

```json
{
  "mcpServers": {
    "myapp": {
      "command": "myapp",
      "args": ["mcp"]
    }
  }
}
```

| Client | Config file |
| --- | --- |
| **Cursor** | `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project) |
| **Claude Code** | `claude mcp add`, or project `.mcp.json` |
| **Claude Desktop** | See platform paths below |

Restart Cursor or reload MCP after editing. Restart Claude Desktop after config changes.

**Claude Desktop** config paths:

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

You can also install a **`.mcpb`** bundle via **`mcp bundle`** (see [MCP Bundle](#mcp-bundle-mcp-bundle)).

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.myapp]
command = "myapp"
args = ["mcp"]
```

**OpenCode** (`opencode.json`):

```json
{ "mcp": { "myapp": { "type": "local", "command": ["myapp", "mcp"] } } }
```

### Other MCP hosts

Add the same command to a host that supports one of the negotiated MCP revisions over stdio. The **command** is your app, and **`mcp`** starts the server.

## Configuration

Set `mcpServer` on the **app root only** (the object passed to `argsbarg({ … })`). Validation rejects `mcpServer` on nested nodes.

| Field | Default | Purpose |
| --- | --- | --- |
| `enabled` | *(required)* | Must be `true` when `mcpServer` is set |
| `instructions` | *(none)* | Returned by `initialize`. Keep it to a short pointer describing when to use the tools and where to read the skill. Must be non-empty when set. |
| `shellEnv` | on (opt-out with `false`) | Capture login-shell `env` at startup (`true` uses `$SHELL`, or pass a shell path) |
| `resources` | `[]` | Custom `McpResource` entries (argsbarg adds none of its own); also readable through the `mcp_resource_read` tool (see [Custom resources](#custom-resources)) |
| `errors.errorSchema` | `{ error: string }` | Error body shape for tool errors |
| `errors.obscureUnexpected` | `false` | Hide unexpected error messages from the client (logs keep them) |
| `hooks` | — | Request hooks: `onRequest` (awaited before application dispatch), `onResponse`, `onError`. Cancellation notifications bypass application execution. |
| `mcpd`, `claudePlugin`, `cursorPlugin`, `bundle` | off | Packaging for `mcp bundle` (see [MCP Bundle](#mcp-bundle-mcp-bundle)) |
| `sizeLimits` | see [Tool sizes](#tool-sizes) | Overrides the default startup size warnings for tool descriptions, definitions, and `instructions` |
| `validateOutputs` | `false` | Validate declared output schemas and emit schema-conforming typed MCP results; see [Tool results](#tool-results) |

The initialization result's `serverInfo` uses the sanitized program `key` and app `version` (also used by the `version` built-in).

Example with optional fields:

```typescript
mcpServer: {
  enabled: true,
  shellEnv: false, // opt out of login-shell capture
}
```

## Workspace cwd

After initialization, argsbarg requests `roots/list` once if the client advertised roots support. Exactly one usable local file URI selects cwd before invocation hooks and handlers run; child CLIs inherit it. Application calls remain serialized while the input reader handles the roots response independently.

Unsupported, empty, multiple, malformed, remote, or inaccessible roots retain launch cwd. Errors, disconnects, and an unanswered request after five seconds also fall back. There is no roots refresh, public roots API, or settings change. A client that does not advertise roots receives no roots request.

The selected cwd persists for the server session. `hooks.beforeInvoke` can override it, and children can receive an explicit `cwd`; application changes to process cwd also persist. Do not overlap `app.invoke()` calls while output capture and cwd are process-global.

Roots are untrusted client input, not authorization or a filesystem sandbox. MCP has no standard workspace environment variable. Lack of roots support does not prevent a host from launching the process in the workspace or supplying an explicit path through its configuration. Startup configuration, module initialization, and already-open files still use launch cwd and are not rerun. CLI and REST behavior are unchanged.

## Tools

Every **user-defined command with a handler** in your schema becomes one MCP tool. Built-ins (`completion`, `version`, `mcp`, `http`) are not exposed as tools.

### Tool names

Tool names are derived from the command path, with each segment sanitized (non-alphanumeric characters become `_`) and joined with `_`.

| CLI invocation | Tool name |
| --- | --- |
| `myapp deploy` | `deploy` |
| `myapp stat owner lookup` | `stat_owner_lookup` |
| `nested.ts read` | `read` |

### Tool descriptions

Each tool’s `description` includes the human CLI path and the command’s help text, separated by an em dash. Command **`notes`** are appended after a blank line (with `{argsbarg:program}` resolved). Tool arguments are defined in `inputSchema` (options and positionals with their descriptions).

| CLI path | MCP `description` (example) |
| --- | --- |
| `stat owner lookup` | `stat owner lookup — Resolve owner info.` |
| `read` | `read — Print the first line of each file.` |
| (root command app) | `{root.key} — Tiny demo.` |

### Per-command visibility

Set `mcpTool: { enabled: false }` on a **command with a handler** to hide it from `tools/list` while keeping it in the CLI:

```typescript
{
  key: "debug",
  description: "Internal diagnostics.",
  mcpTool: { enabled: false },
  handler: () => { /* ... */ },
}
```

Omitted or `enabled: true` exposes the command (default). `mcpTool` is only valid on commands — not on the app root or command group.

**Prefer fixing schema and handlers over `mcpTool` overrides** — standard option names (`yes`, `dry-run`, `json`), headless paths, and clear descriptions usually make MCP work without per-command config. See [cli-program.md](cli-program.md).

### Per-command tool metadata

```typescript
mcpTool: {
  enabled: true,
  description: "Custom tools/list text (overrides auto-generated path + help).",
  notes: false, // omit this command's `notes` from the MCP description; a string replaces them
  annotations: { readOnlyHint: true, openWorldHint: false }, // only when true for this command
}
```

Set **`outputSchema` on the command** (not under `mcpTool`) — see [cli-program.md — Structured stdout](cli-program.md#structured-stdout).

- **`description`** — when set, replaces the auto-generated `path — help` description entirely.
- **`notes`** — overrides the command's `notes` in the MCP description only; CLI `--help` always shows the command's own `notes` unchanged. `false` omits notes from the MCP description entirely; a string replaces them; omit `notes` to use the command's `notes` as given. Useful when a note only makes sense with `--help` in front of it, or to keep a tool's definition under a size limit (see [Tool sizes](#tool-sizes)).
- **`annotations`** — explicit `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint`. These are advisory, not authorization or a replacement for host confirmation. Omitted hints retain MCP's conservative defaults; argsbarg does not infer safety from names or `--yes`. The built-in resource reader keeps conservative mutation/external-access hints because application `load()` callbacks are arbitrary code. Override it with your own command to make more specific claims.

### Tool arguments

Each tool’s `inputSchema` is a JSON Schema object built from your CLI definition:

- **Options** — command-local flags only (declare on the command that uses them). Presence options are `boolean`; string, number, and **enum** options match their `OptionKind` (`Enum` uses JSON Schema `enum`). Required options are listed in `required`. `json`, `yes`, and `verbose` are omitted from MCP wire schemas (the framework handles them on invoke; mutating tools auto-receive `--yes`).
- **Positionals** — one property per `CommandPositional` on the command. Single-slot positionals are `string`; varargs tails (`argMax: 0`) are `string[]`. Required positionals are listed in `required`. **Varargs must be a JSON array** — comma-separated strings are not accepted (use `format: comma-list` on an option when a single flag should accept `"a,b"` or `["a","b"]`).

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

#### Path parameters

Tools under `:param` command groups (e.g. `workspaces :id get` → `workspaces__id_get`) take each path parameter as a required top-level string argument (`{ "id": "…" }`, next to `input` for wrapped tools), described from the command's `pathParams` schema when declared. The call routes to that value.

#### Object-rooted schemas and wrapping

MCP requires `type: "object"` at the root of tool `inputSchema` and `outputSchema`. Object-rooted command schemas are served as-is. Other roots, such as a discriminated union, are **wrapped** under a single required property; `$schema`, `$id`, `definitions`, and `$defs` move up so local references still resolve:

```json
{
  "type": "object",
  "properties": { "input": { "anyOf": [{ "$ref": "#/definitions/Circle" }, { "$ref": "#/definitions/Rect" }] } },
  "required": ["input"],
  "additionalProperties": false,
  "definitions": { "Circle": { "…": "…" }, "Rect": { "…": "…" } }
}
```

- **Arguments** — clients send `{ "input": { "kind": "circle", "radius": 1 } }`. argsbarg unwraps `input` before invoke, so handlers, `ctx.inputs`, and `inputSchema` validation see the bare object (the exact union, unchanged). Extra top-level keys or a non-object `input` fail with a validation error.
- **Results** — non-object output schemas use a `result` property, for example `{ "result": ["a", "b"] }`. Handlers return the bare value; argsbarg wraps it. Default string results retain the released `{ content, contentType }` envelope inside that wrapper. Enable `validateOutputs` for schema-conforming typed values instead.
- **CLI and HTTP are unaffected** — only MCP `tools/list` and `tools/call` see the wrapper.

When MCP is enabled, startup validation checks every exposed tool's served schemas: each local `$ref` must resolve, and a wrapped schema must not use `$ref: "#"` (after wrapping it would point at the wrapper — reference a named definition instead). See `examples/api` `shape-area` for a union-input leaf.

### Tool results

On success (`isError: false`):

- Return a JSON value from the handler or call `ctx.respond({ body })`. Printing alone does not supply a tool result. Captured stdout/stderr are not treated as a response or mixed into protocol output.
- **Default results remain compatible.** JSON objects are returned as structured content; strings use `{ content, contentType }`; binary responses use `{ data, contentType, encoding: "base64" }`. A non-object output schema adds the `result` wrapper described above. Text content keeps the released formatting. Native media blocks are not implemented.
- **Output validation is opt-in:** set `mcpServer: { enabled: true, validateOutputs: true }`. A typed handler's JSON value must match `outputSchema` without coercion, defaults, or key stripping. Invalid results return `isError: true`; valid results use the raw typed value inside any required `result` wrapper, and text serializes that same structured value. For `z.string()` returning `"hello"`, both represent `{ "result": "hello" }`. Untyped results keep the default formatting.
- CLI and REST output validation is unchanged. The `2024-11-05` session omits `outputSchema` and `structuredContent`; text results still work.

On failure (parse error, validation error, non-zero exit, thrown error), the **full** error message is returned as text content with `isError: true` (ANSI stripped, newlines preserved). HTTP JSON `{ "error": "…" }` uses the same full text. Do not collapse headless errors to the first line.

Help is not available through tool calls; tool schemas come from `tools/list`.

## Tool sizes

Some hosts have their own limits on how much of a tool's `description` or full definition they'll read, independent of anything the MCP spec itself defines. `mcpSizeReport(root)` (exported from `argsbarg`) measures every tool's `description` length and pretty-printed `{name, description, inputSchema, outputSchema, annotations}` definition (bytes and lines) against configurable limits, and returns human-readable warnings for anything over. `serveMcp` runs this at startup and writes any warnings to stderr (`action: "mcp.size"`) before the "MCP ready" line; `mcpSizeReport(app.spec)` returns the same per-tool `ok` / `over: …` status.

Default limits — observed client behaviors, not MCP spec requirements, so they may need retuning as those clients change:

| Limit | Default | Approximates |
| --- | --- | --- |
| `descriptionChars` | `2,048` | Claude Code truncates a tool's `description` past this |
| `definitionBytes` | `51,200` | Cursor syncs each tool's full definition to a file and reads it in chunks of at most this many bytes |
| `definitionLines` | `2,000` | Same file, read in chunks of at most this many lines (whichever limit hits first) |
| `instructionsChars` | `2,048` | No specific client behavior modeled yet; a general "keep it short" budget |

Override with `mcpServer.sizeLimits`; set any field to `false` to disable that check entirely:

```typescript
mcpServer: {
  enabled: true,
  sizeLimits: {
    definitionBytes: 100_000, // this app's tools are legitimately large
    instructionsChars: false, // don't warn on instructions length
  },
}
```

## Custom resources

Argsbarg exposes no resources of its own. Add custom resources on the app root:

```typescript
mcpServer: {
  enabled: true,
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

URIs must be unique. `load()` runs synchronously at `resources/read` time.

Some hosts (Copilot, for one) only hand MCP tools to the model, so an agent told to "read `myapp://config`" has no way to do it. When `resources` is non-empty, argsbarg also registers an `mcp_resource_read` tool: its `uri` argument is an enum of your URIs, its description lists each one, and it returns the same body as `resources/read` (failures come back as `isError` results). When `instructions` is set, one line pointing at the tool is appended to it. If one of your commands already maps to `mcp_resource_read`, the command wins and the built-in is skipped.

## Invocation context

Handlers receive `ctx.invocation`: `"cli"` for `app.run()`, `"http"` for the HTTP server, `"mcp"` for MCP `tools/call`.

MCP is always non-interactive. Commands that can mount Ink or prompts should implement a **headless fast path** (same path as non-TTY CLI with `--yes` / `--json`) — see [cli-program.md — Headless-capable handlers](cli-program.md#headless-capable-handlers).

Use `ctx.invocation` to branch subprocess behavior — MCP stdout is the JSON-RPC wire, so child processes must not inherit it:

```typescript
handler: async (ctx) => {
  const proc = spawn("my-tool", ctx.args, {
    stdio: ["ignore", ctx.invocation === "mcp" ? "pipe" : "inherit", "inherit"],
  });
  // capture proc.stdout when piping…
};
```

Inheriting stdout (`stdio: "inherit"`) under MCP corrupts the wire. Prefer `"pipe"` and return the child's captured output explicitly, for example `return stdout`, rather than only printing it.

### Cancellation and progress

`ctx.mcp.signal` is a cooperative `AbortSignal` for MCP handlers and invocation hooks. Pass it to Node child-process APIs and other abortable work. Cancellation is handled immediately while tools remain serialized; cancelled queued calls never invoke their handler. Cancelled results are suppressed, and unknown/completed IDs are ignored. String and numeric IDs remain distinct. A signal cannot interrupt synchronous code or children that do not receive it.

```typescript
handler: async (ctx) => {
  ctx.mcp?.reportProgress?.(0, 1, "Starting");
  const { stdout } = await execFileAsync("my-tool", [], {
    signal: ctx.mcp?.signal,
    cwd: "/explicit/workspace",
  });
  ctx.mcp?.reportProgress?.(1, 1, "Finished");
  return stdout;
}
```

Progress is opt-in through request `_meta.progressToken`; the reporter is a no-op without it or after completion/cancellation. Values must be finite, nonnegative, strictly increasing, and not exceed an optional finite total. Notifications use the original token and bypass output capture. Ordinary stdout remains buffered. `ctx.mcp` is absent for CLI and REST handlers.

### `app.invoke` (public API)

`app.invoke(argv)` runs a command handler without exiting the process — useful for tests and headless integrations. Returns `{ kind, exitCode, stdout, stderr, response? }`. MCP tool dispatch uses the explicit `response` internally.

**Note:** Tool output is buffered until the handler completes. Live streaming (e.g. `tail -f`) is not supported yet; see [Design notes](#design-notes).

## Environment bootstrapping

MCP hosts (e.g. Cursor) often spawn your server with a minimal environment — missing `PATH` entries for Homebrew, nvm, rbenv, etc.

At server start (`app.serveMcp()`), before the NDJSON loop:

| Order | Source | Behavior |
| --- | --- | --- |
| 1 | `shellEnv` | Spawns `$SHELL -l -c env`; merges into `process.env` |

**`shellEnv` merge rules:**

- **`PATH`** — shell-only segments are **prepended** to the host `PATH` (always merged).
- **Other vars** — set only when absent from the host environment (host wins).
- On failure — one-line warning on **stderr**; server continues.

argsbarg does not manage app settings. Read credentials from `process.env` (hosts and plugins inject env at spawn) or your own config file.

## Protocol

- **Transport:** stdio, newline-delimited JSON (NDJSON).
- **JSON-RPC:** version `2.0`.
- **MCP versions:** `2025-11-25`, `2025-06-18`, and `2024-11-05`. `initialize` echoes a supported requested revision; otherwise it offers `2025-11-25`. Clients unable to support the offered revision should disconnect. Capabilities are negotiated for the session, not required on each request.
- **Results:** ordinary JSON-RPC `result` or `error` responses. No modern `resultType`, discovery, or MRTR fields are required.
- **Errors:** malformed JSON gets `-32700`; invalid envelopes get `-32600`; malformed params/metadata get `-32602`. Unknown methods get `-32601`. Parse and invalid-request errors without a usable ID use `id: null`. Recoverable errors do not stop the reader. Batch arrays are not supported.

### Supported methods

| Method | Description |
| --- | --- |
| `initialize` | Negotiates the protocol revision; returns server identity, tools/resources capabilities, and optional `instructions`. |
| `notifications/initialized` | Starts once-per-session workspace discovery when roots are supported. |
| `ping` | Returns an empty result. |
| `tools/list` | Lists tools with `name`, `description`, `inputSchema`, optional `outputSchema`/`annotations`, plus `mcp_resource_read` when resources exist. |
| `tools/call` | Runs a handler or resource reader; params: `name`, optional object `arguments`, and optional `_meta.progressToken`. |
| `resources/list` | Lists custom resources (`mcpServer.resources`). |
| `resources/read` | Returns resource body; params: `uri`. |
| `notifications/cancelled` | Cooperatively cancels the exact request ID outside the execution queue. |

Valid notifications have no `id`, receive no response, and never invoke tools. The private server-to-client `roots/list` request is answered through the continuous input reader without waiting behind application execution.

### Manual smoke test

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}' | node examples/nested.ts mcp
```

You should get one JSON line with `result.protocolVersion`, `result.capabilities`, and `result.serverInfo`.

### Upgrading from 8.1.0

No lifecycle or output-shape migration is required. Existing clients retain their negotiated revision and result envelopes. Cancellation and progress are optional; pass `ctx.mcp.signal` to abortable work and use `ctx.mcp.reportProgress` when useful. Enable `validateOutputs` only after checking handlers and consumers: typed string results then use `{ result: "text" }` instead of `{ result: { content, contentType } }`. The `2026-07-28` architecture remains a separate future major.

## MCP Bundle (`mcp bundle`)

When `mcpServer.enabled` is true, **`mcp bundle`** writes dist artifacts you opt into on the app root:

```bash
myapp mcp bundle
# → dist/myapp.mcpb               (when mcpServer.mcpd: true)
# → dist/claude-plugin/myapp.zip  (when mcpServer.claudePlugin: true)
# → dist/cursor-plugin/myapp.zip  (when mcpServer.cursorPlugin: true)
```

Enable any combination of packaging flags:

```typescript
mcpServer: {
  enabled: true,
  mcpd: true,           // Claude Desktop `.mcpb`
  claudePlugin: true,   // Claude Code plugin zip
  cursorPlugin: true,   // Cursor plugin zip
},
```

Expects an executable at **`dist/<program.key>`** (for example a compiled binary) and packs it as `bin/<key>`. Stdout prints one path per artifact produced.

| Output | Purpose |
| --- | --- |
| **`dist/<key>.mcpb`** | Claude Desktop MCP Bundle — when `mcpd: true` (default **false**) |
| **`dist/claude-plugin/<name>.zip`** | Claude Code plugin zip — when `claudePlugin: true` (default **false**) |
| **`dist/cursor-plugin/<name>.zip`** | Cursor plugin zip — when `cursorPlugin: true` (default **false**) |

Manifest metadata is generated from your schema (`mcpServerId`, tools). Optional pack-time fields live under **`mcpServer.bundle`** (`author`, `displayName`, `homepage`, `icon`, `license`, `longDescription`, `repository`, `skillsDir`).

**Claude Code plugin zip layout** (paths at archive root):

```
.claude-plugin/plugin.json   # includes "mcpServers": ".mcp.json"
.mcp.json
bin/myapp                    # executable (0755 preserved in the zip)
skills/<dirName>/...
```

**Cursor plugin zip layout** (paths at archive root):

```
.cursor-plugin/plugin.json   # Cursor plugin manifest
mcp.json                     # includes mcpServers with ${CURSOR_PLUGIN_ROOT}
bin/myapp                    # executable (0755 preserved in the zip)
skills/<dirName>/...
```

`plugin.json` and `mcp.json` configure Cursor and Claude to load the bundled MCP server when the plugin is enabled. The plugin zip preserves the executable bit on `bin/<key>`.

If the repository has a skill directory under `skills/<dirName>/` (or `mcpServer.bundle.skillsDir`), the plugin bundles that repository skill. Otherwise the plugin ships no skill.

Load Claude plugin locally with `claude --plugin-dir ./dist/claude-plugin/myapp.zip`.
Unpack Cursor plugin locally into `~/.cursor/plugins/local/<name>`.

Bare **`myapp mcp`** still runs the stdio MCP server for hosts configured by hand (see [Manual client setup](#manual-client-setup)).

## Hidden commands and options

Set **`hidden: true`** on a command or option to omit it from help listings, schema export, shell completions, and MCP `tools/list` / tool `inputSchema`. Hidden commands remain invocable; **`myapp hidden-cmd -h`** still works.

## Reserved names

When MCP is enabled, `mcp` is reserved at the root (as are `completion` and `version` always). Running `myapp mcp` without `mcpServer` on the root fails with an error (exit 1).

## Design notes

- **Zero extra dependencies** — hand-rolled NDJSON JSON-RPC on top of ArgsBarg’s existing parser and schema.
- **Same handlers** — tool calls run your real command handlers via an internal invoke path that captures stdout/stderr and does not exit the process, so the MCP server can handle many requests in one process.
- **User schema only** — tool dispatch uses your app root, not merged presentation builtins.
- **Buffered output** — final results wait for the handler. Opted-in progress notifications are live, but incremental stdout is not streamed.


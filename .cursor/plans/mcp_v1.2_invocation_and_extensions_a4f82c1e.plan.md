---
name: MCP v1.2 — invocation context and schema extensions
overview: "Seven targeted additions: ctx.invocation for CLI/MCP branching, public cliInvoke export, CliOptionKind.Enum with choices, mcpTool description override + requiresEnv metadata, pluggable mcpResources on the root, mcpServer.envFile for explicit secrets, and mcpServer.shellEnv to auto-capture the user's full login shell environment (PATH, toolchains, exports)."
todos:
  - id: types
    content: "Step 1: Add CliInvocation type, CliOptionKind.Enum + choices on CliOption, description/requiresEnv on CliMcpToolConfig, CliMcpResource interface + resources on CliMcpServerConfig, envFile on CliMcpServerConfig"
    status: completed
  - id: validate
    content: "Step 2: Validate Enum choices (non-empty, distinct), mcpResources URI uniqueness vs built-in schema URI"
    status: completed
  - id: context-invocation
    content: "Step 3: Add invocation param to CliContext constructor; set 'cli' in cliRun, 'mcp' in cliInvoke; export cliInvoke from index.ts"
    status: completed
  - id: enum-kind
    content: "Step 4: Wire CliOptionKind.Enum — parser validation, help rendering (choice label), completions (choice list), MCP inputSchema (enum array)"
    status: completed
  - id: mcp-tool-meta
    content: "Step 5: Wire mcpTool.description override and requiresEnv note in collectMcpTools"
    status: completed
  - id: mcp-resources
    content: "Step 6: Wire CliMcpResource into resources/list and resources/read in server.ts"
    status: completed
  - id: env-bootstrap
    content: "Step 7: Env bootstrapping — shellEnv captures login shell (PATH, toolchains, exports); envFile overrides specific keys; applied in order at cliMcpServeStdio startup"
    status: completed
  - id: tests
    content: "Step 8: Unit + subprocess tests for all six features"
    status: completed
  - id: docs-typegen
    content: "Step 9: Update docs/mcp.md, README.md, CHANGELOG.md; run just typegen and just test"
    status: completed
isProject: false
---

# MCP v1.2 — invocation context and schema extensions

Seven additive improvements driven by consumer app feedback (`qa`, `idp-trees`). No breaking changes, no new runtime dependencies, no new public MCP internals.

---

## Implementation order

1. Types (all in one pass — all downstream steps depend on these)
2. Validation
3. `ctx.invocation` + `cliInvoke` export
4. `CliOptionKind.Enum`
5. `mcpTool` metadata wiring
6. `mcpResources` wiring
7. Env bootstrapping (`shellEnv` then `envFile`)
8. Tests
9. Docs + typegen

Do not wire runtime or MCP server changes before their types exist.

---

## Step 1: Types ([`src/types.ts`](src/types.ts))

### `CliInvocation` type

```typescript
/** How a leaf handler was dispatched. */
export type CliInvocation = "cli" | "mcp";
```

Place before `CliOptionKind`. Import in [`src/context.ts`](src/context.ts).

### `CliOptionKind.Enum`

```typescript
export enum CliOptionKind {
  Presence = "presence",
  String = "string",
  Number = "number",
  /** Fixed set of allowed string values. Requires non-empty `choices` on the option. */
  Enum = "enum",
}
```

### `choices` on `CliOption`

```typescript
export interface CliOption {
  // ...existing fields...
  /**
   * Allowed values. Required when kind === Enum; ignored otherwise.
   * Must be a non-empty array of distinct non-empty strings.
   */
  choices?: string[];
}
```

### `CliMcpToolConfig` additions

```typescript
export interface CliMcpToolConfig {
  /** When `false`, omit from `tools/list` (default: exposed). */
  enabled?: boolean;
  /**
   * Override the generated MCP tool description.
   * Default: auto-generated from command path and description.
   */
  description?: string;
  /**
   * Environment variable names required at runtime.
   * Appended to the MCP tool description so agents can fail fast.
   */
  requiresEnv?: string[];
}
```

### `CliMcpResource` interface (new)

```typescript
/**
 * A custom MCP resource exposed under resources/list and resources/read.
 * Added to CliMcpServerConfig.resources.
 */
export interface CliMcpResource {
  /** Resource URI (must be unique; must not equal schemaResourceUri). */
  uri: string;
  /** Short display name for resources/list. */
  name: string;
  /** Optional human description for resources/list. */
  description?: string;
  /** MIME type (default: "text/plain"). */
  mimeType?: string;
  /** Called at resources/read time; must return the resource body. */
  load: () => string;
}
```

### `CliMcpServerConfig` additions

```typescript
export interface CliMcpServerConfig {
  // ...existing fields...
  /**
   * Capture the user's login shell environment at MCP server start and merge it
   * into process.env. Solves missing PATH, nvm/rbenv shims, Homebrew binaries,
   * and shell exports that MCP hosts (e.g. Cursor) don't inherit.
   *
   * `true`  — use $SHELL, falling back to /bin/zsh on macOS or /bin/bash elsewhere.
   * `string` — explicit shell path (e.g. "/bin/bash").
   *
   * Merge semantics: shell env is the baseline; host-provided process.env wins for
   * all keys except PATH, which is always merged (shell PATH prepended to host PATH).
   * Silently skipped if the shell spawn fails or times out (5 s).
   */
  shellEnv?: boolean | string;
  /**
   * Path to a .env file loaded into process.env at MCP server start, after shellEnv.
   * Supports `~` expansion. Silently skipped if the file does not exist.
   * Always overwrites — envFile is authoritative for its keys.
   */
  envFile?: string;
  /**
   * Custom MCP resources exposed alongside the built-in argsbarg://schema resource.
   * URIs must be unique and must not equal schemaResourceUri.
   */
  resources?: CliMcpResource[];
}
```

---

## Step 2: Validation ([`src/validate.ts`](src/validate.ts))

### `CliOptionKind.Enum` — in `walkCommand`, for each option on a command

```
if (opt.kind === CliOptionKind.Enum) {
  if (!opt.choices || opt.choices.length === 0)
    throw CliSchemaValidationError: "Option '${opt.name}' on '${cmd.key}': Enum kind requires non-empty choices"
  if (new Set(opt.choices).size !== opt.choices.length)
    throw CliSchemaValidationError: "Option '${opt.name}' on '${cmd.key}': Enum choices must be distinct"
}
```

Also throw if `opt.choices` is set on a non-Enum kind (defensive).

### `mcpResources` URI uniqueness — in `walkCommand` at the root node

```
if (isRoot && root.mcpServer?.resources) {
  const schemaUri = root.mcpServer.schemaResourceUri ?? MCP_SCHEMA_URI_DEFAULT;
  const uris = root.mcpServer.resources.map(r => r.uri);
  if (uris.includes(schemaUri))
    throw: "mcpServer.resources URI '${schemaUri}' conflicts with the built-in schema resource"
  if (new Set(uris).size !== uris.length)
    throw: "mcpServer.resources URIs must be unique"
}
```

Import `MCP_SCHEMA_URI_DEFAULT` from `../mcp/tools.ts` — or extract the constant to a shared location if that creates a circular dep. If circular: inline the default string `"argsbarg://schema"` in validate.ts.

**No validation** needed for `envFile` (file-not-found is a runtime warning, not a schema error) or for `mcpTool.description`/`requiresEnv` (no constraints beyond type).

---

## Step 3: `ctx.invocation` + `cliInvoke` export

### [`src/context.ts`](src/context.ts)

Add `invocation` as the **last** constructor parameter with default `"cli"` to preserve backwards compatibility for any direct `new CliContext(...)` callers (tests, etc.):

```typescript
import type { CliCommand, CliInvocation } from "./types.ts";

export class CliContext {
  // ...existing fields...
  readonly invocation: CliInvocation;

  constructor(
    appName: string,
    commandPath: string[],
    args: string[],
    opts: Record<string, string>,
    schema: CliCommand,
    invocation: CliInvocation = "cli",
  ) {
    // ...existing assignments...
    this.invocation = invocation;
  }
  // ...existing methods unchanged...
}
```

### [`src/runtime.ts`](src/runtime.ts) — line 115

Change:
```typescript
const ctx = new CliContext(parseRoot.key, pr.path, pr.args, pr.opts, parseRoot);
```
To:
```typescript
const ctx = new CliContext(parseRoot.key, pr.path, pr.args, pr.opts, parseRoot, "cli");
```

### [`src/invoke.ts`](src/invoke.ts) — line 111

Change:
```typescript
const ctx = new CliContext(root.key, pr.path, pr.args, pr.opts, root);
```
To:
```typescript
const ctx = new CliContext(root.key, pr.path, pr.args, pr.opts, root, "mcp");
```

### [`src/index.ts`](src/index.ts) — export

Add to public exports:
```typescript
export { cliInvoke } from "./invoke.ts";
export type { CliInvokeKind, CliInvokeResult } from "./invoke.ts";
```

Also export the new types added in Step 1:
```typescript
export type { CliInvocation, CliMcpResource } from "./types.ts";
```

---

## Step 4: `CliOptionKind.Enum`

Four touchpoints — handle all four or leave the type dead.

### Parser validation ([`src/parse.ts`](src/parse.ts) or `postParseValidate`)

After an Enum option's value is consumed, check `choices.includes(value)`. On failure, set parse error: `"Option --${name}: '${value}' is not one of: ${choices.join(', ')}"`. Do this in `postParseValidate` alongside existing validation, not deep in the tokenizer.

### Help rendering ([`src/help.ts`](src/help.ts))

Option value label: currently String shows `<value>`, Number shows `<number>`. Enum should show `<choice1|choice2|…>` (truncate display if choices > 4: `<a|b|c|…>`).

### Shell completions ([`src/completion.ts`](src/completion.ts))

Where String options emit a generic word completion, Enum options should emit each choice as a discrete completion candidate.

### MCP `inputSchema` ([`src/mcp/tools.ts`](src/mcp/tools.ts))

In `optionProperty`:
```typescript
case CliOptionKind.Enum:
  return { type: "string", enum: opt.choices, description: opt.description };
```

---

## Step 5: `mcpTool` metadata ([`src/mcp/tools.ts`](src/mcp/tools.ts))

In `collectMcpTools`, when building `McpToolDef.description` for a leaf:

```typescript
function resolveToolDescription(
  root: CliCommand,
  path: string[],
  leaf: CliCommand,
): string {
  // Author-supplied override wins
  if (leaf.mcpTool?.description) {
    return leaf.mcpTool.description;
  }
  // Auto-generate: path + leaf description
  let desc = mcpToolDescription(root, path, leaf.description);
  // Append env requirements
  const env = leaf.mcpTool?.requiresEnv;
  if (env && env.length > 0) {
    desc += ` [requires env: ${env.join(", ")}]`;
  }
  return desc;
}
```

Replace the inline description construction in `collectMcpTools` with a call to `resolveToolDescription`.

`mcpTool.enabled === false` filter is already in place — no change there.

---

## Step 6: `mcpResources` ([`src/mcp/server.ts`](src/mcp/server.ts))

### Helper (can live in `server.ts` or `tools.ts`)

```typescript
function allMcpResources(root: CliCommand): Array<{
  uri: string; name: string; description?: string; mimeType: string; load: () => string;
}> {
  const schemaUri = resolveMcpSchemaUri(root);
  const builtIn = [{
    uri: schemaUri,
    name: "cli-schema",
    description: "Full CLI command tree (same as --schema).",
    mimeType: "application/json",
    load: () => cliSchemaJson(root),
  }];
  const user = (root.mcpServer?.resources ?? []).map(r => ({
    uri: r.uri,
    name: r.name,
    description: r.description,
    mimeType: r.mimeType ?? "text/plain",
    load: r.load,
  }));
  return [...builtIn, ...user];
}
```

### `tools/call` — `requiresEnv` enforcement

Before dispatching to `cliInvoke`, check that all env vars declared on the matched tool's leaf are present. Fail fast with an MCP error result rather than letting the handler surface an opaque runtime error:

```typescript
const missing = (tool.leaf.mcpTool?.requiresEnv ?? [])
  .filter((k) => !process.env[k]);
if (missing.length > 0) {
  writeResponse({
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: `Missing required env: ${missing.join(", ")}` }],
      isError: true,
    },
  });
  return;
}
```

Do this **after** resolving the tool by name (already errors with `-32602` if unknown) and **before** `mcpToolCallToArgv` / `cliInvoke`. No new types needed.

### `resources/list`

Replace hardcoded single-resource response with:
```typescript
const resources = allMcpResources(root).map(r => ({
  uri: r.uri,
  name: r.name,
  description: r.description,
  mimeType: r.mimeType,
}));
writeResponse({ jsonrpc: "2.0", id, result: { resources } });
```

### `resources/read`

Replace hardcoded URI check with:
```typescript
const all = allMcpResources(root);
const found = all.find(r => r.uri === params.uri);
if (!found) {
  writeError(id, -32602, `Unknown resource: ${params.uri}`);
  return;
}
let text: string;
try {
  text = found.load();
} catch (err) {
  writeError(id, -32603, `Resource load failed: ${err instanceof Error ? err.message : String(err)}`);
  return;
}
writeResponse({
  jsonrpc: "2.0", id,
  result: { contents: [{ uri: found.uri, mimeType: found.mimeType, text }] },
});
```

---

## Step 7: Env bootstrapping ([`src/mcp.ts`](src/mcp.ts) — `cliMcpServeStdio`)

Both loaders run at the top of `cliMcpServeStdio`, before the read loop, in this order: **shellEnv first** (sets the baseline), **envFile second** (overrides specific keys). All output from loaders goes to **stderr only**.

### `shellEnv` — `captureShellEnv` + `applyShellEnv`

```typescript
import { spawnSync } from "node:child_process";

function captureShellEnv(shell: string): Record<string, string> {
  const result = spawnSync(shell, ["-l", "-c", "env"], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.error || result.status !== 0) return {};
  const env: Record<string, string> = {};
  for (const line of result.stdout.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) {
      env[line.slice(0, eq)] = line.slice(eq + 1);
    }
  }
  return env;
}

function applyShellEnv(env: Record<string, string>): void {
  for (const [key, val] of Object.entries(env)) {
    if (key === "PATH") {
      // Always merge PATH: prepend shell-only segments before host PATH
      const existing = process.env.PATH ?? "";
      const existingParts = new Set(existing.split(":"));
      const shellOnly = val.split(":").filter((p) => !existingParts.has(p));
      if (shellOnly.length > 0) {
        process.env.PATH = [...shellOnly, existing].join(":");
      }
    } else if (process.env[key] === undefined) {
      // Shell env is baseline; host-provided vars win
      process.env[key] = val;
    }
  }
}
```

In `cliMcpServeStdio`:
```typescript
const shellEnvCfg = root.mcpServer?.shellEnv;
if (shellEnvCfg) {
  const shell =
    typeof shellEnvCfg === "string"
      ? shellEnvCfg
      : (process.env.SHELL ?? (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash"));
  try {
    applyShellEnv(captureShellEnv(shell));
  } catch {
    process.stderr.write(`[argsbarg] shellEnv: failed to capture shell environment from ${shell}\n`);
  }
}
```

**Why `-l` (login) not `-i` (interactive):** `-i` requires a tty; `-l` (login shell) sources profile files without one and is the right flag for env capture. Never use `-i` here.

### `envFile` — `loadEnvFile`

Runs after `shellEnv`, so it can override anything the shell set:

```typescript
function loadEnvFile(envFile: string): void {
  const resolved = envFile.startsWith("~")
    ? envFile.replace("~", process.env.HOME ?? "")
    : envFile;
  let text: string;
  try {
    text = readFileSync(resolved, "utf8");
  } catch {
    return; // silently skip if not found
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) process.env[key] = val; // always overwrite — envFile is authoritative
  }
}
```

In `cliMcpServeStdio`:
```typescript
if (root.mcpServer?.envFile) {
  loadEnvFile(root.mcpServer.envFile);
}
```

### Priority summary (lowest → highest)

| Source | Wins over |
|--------|-----------|
| Shell env (`shellEnv`) | nothing — baseline only |
| `envFile` | shell env |
| Host `process.env` at startup | shell env (not envFile) |
| PATH | always merged — no single source wins |

---

## Step 8: Tests ([`src/index.test.ts`](src/index.test.ts))

### Unit tests

1. **`ctx.invocation` via cliRun** — invoke `cliRun` with a spy handler; assert `ctx.invocation === "cli"`.
2. **`ctx.invocation` via cliInvoke** — call `cliInvoke`; pass handler that reads `ctx.invocation`; assert `"mcp"`.
3. **`CliOptionKind.Enum` inputSchema** — fixture leaf with Enum option; assert `inputSchema.properties.mode.enum` equals choices array.
4. **`CliOptionKind.Enum` argv validation** — `cliInvoke` with invalid choice value → `kind: "error"`.
5. **`CliOptionKind.Enum` valid value** — valid choice → `kind: "ok"`.
6. **`cliValidateRoot` rejects Enum with no choices** — `choices: []` → `CliSchemaValidationError`.
7. **`cliValidateRoot` rejects Enum with duplicate choices** — throw.
8. **`mcpTool.description` override** — fixture leaf with `mcpTool: { description: "custom" }`; assert `collectMcpTools` tool description equals `"custom"`.
9. **`mcpTool.requiresEnv`** — fixture leaf; assert description includes `[requires env: TOKEN]`.
10. **`mcpResources` in resources/list** — subprocess test: `resources/list` response includes custom resource URI.
11. **`mcpResources` read** — subprocess test: `resources/read` with custom URI calls `load()` and returns body.
12. **`mcpResources` wrong URI** — returns `-32602`.
13. **`cliValidateRoot` rejects resources with duplicate URIs** — throw.
14. **`cliValidateRoot` rejects resource URI matching schemaResourceUri** — throw.

15. **`requiresEnv` enforcement — missing var** — subprocess test: tool with `requiresEnv: ['ARGSBARG_TEST_SECRET']`; call without that var set; assert `isError: true`, content mentions the var name.
16. **`requiresEnv` enforcement — var present** — same tool, set the var in `process.env` before spawning; assert `isError: false`.
17. **`shellEnv` PATH merge** — unit test `applyShellEnv` directly: call with a mock env where PATH has extra segments not in `process.env.PATH`; assert those segments are prepended and original PATH is preserved.
16. **`shellEnv` host wins for non-PATH vars** — unit test `applyShellEnv`: call with a key already in `process.env`; assert existing value is unchanged.
17. **`shellEnv` sets missing vars** — unit test `applyShellEnv`: call with a key absent from `process.env`; assert it is set.
18. **`envFile` overwrites** — unit test `loadEnvFile`: key already in `process.env`; assert it is overwritten.
19. **`envFile` priority over shellEnv** — call `applyShellEnv` then `loadEnvFile` with the same key; assert `envFile` value wins.

### Subprocess tests

- `mcpResources/list` and `mcpResources/read` require updating the `nested.ts` fixture or using a test-local fixture.
- Preferred: add `resources` to `nestedMcpFixture` in the test file (not `examples/nested.ts`) to avoid coupling the demo app to test-specific URIs.
- `envFile` loading: write a temp `.env` file in the test, start MCP server, call a tool whose handler reads `process.env`; assert the value is present. Use `Bun.file` + a temp path under `os.tmpdir()`.
- **Do not** write a subprocess test for `shellEnv` that asserts specific PATH contents — shell env varies per machine and makes CI fragile. The unit tests for `captureShellEnv`/`applyShellEnv` are sufficient; trust that `spawnSync` works.

---

## Step 9: Docs + typegen

### [`docs/mcp.md`](docs/mcp.md)

Add or update sections:

- **Invocation context**: `ctx.invocation === "mcp"` in MCP calls; safe subprocess pattern (`Bun.spawn({ stdout: 'pipe' })` when `ctx.invocation === 'mcp'`; note that `Bun.spawn({ stdout: 'inherit' })` bypasses capture and corrupts the MCP wire).
- **`cliInvoke` (public)**: headless testing without subprocess.
- **`mcpTool.description`**: per-leaf description override.
- **`mcpTool.requiresEnv`**: surfaces as `[requires env: …]` in tool description.
- **`mcpServer.resources`**: custom resources with code example.
- **`mcpServer.shellEnv`**: spawns `$SHELL -l -c env` at startup; baseline merge (PATH always merged, other vars only when absent from host env); use when Cursor or other hosts lack toolchain access; warn on stderr if shell fails.
- **`mcpServer.envFile`**: path to `.env` file; `~` supported; runs after `shellEnv`; always overwrites; use for tokens and secrets.
- **Priority table**: shell → envFile → host env (PATH always merged).
- **Enum options** (brief cross-ref to README).

### [`README.md`](README.md)

- Add `Enum` row to the `CliOptionKind` table.
- One-line note in the MCP section pointing to `docs/mcp.md`.

### [`CHANGELOG.md`](CHANGELOG.md) — `[Unreleased]` → Added

- `ctx.invocation` (`"cli"` or `"mcp"`) on `CliContext`
- `cliInvoke` and `CliInvokeResult` exported from public API
- `CliOptionKind.Enum` with `choices` — JSON Schema `enum`, completions, parse validation
- `mcpTool.description` — per-leaf MCP tool description override
- `mcpTool.requiresEnv` — env variable requirements surfaced in tool description and enforced at `tools/call` time (missing vars return `isError: true` before the handler runs)
- `mcpServer.resources` — pluggable `CliMcpResource` items in `resources/list` and `resources/read`
- `mcpServer.shellEnv` — login shell env captured at MCP server start; PATH always merged, other vars fill gaps in host env
- `mcpServer.envFile` — `.env` file loaded into `process.env` at MCP server start, after `shellEnv`

### Typegen

```
just typegen
```

Run after all type changes are complete. Verify `index.d.ts` exports `CliInvocation`, `CliMcpResource`, `CliOptionKind.Enum`, `cliInvoke`, `CliInvokeResult`, `CliInvokeKind`.

---

## Pitfalls (do NOT)

- Export MCP server internals (`cliMcpServeStdio`, `collectMcpTools`, `buildToolCallSuccess`) from `index.ts`
- Use `Bun.file()` async API in `loadEnvFile` — use `readFileSync` from `node:fs` (sync, already imported in `tools.ts`)
- Allow `resources/read` to call `load()` before checking the URI — always find first, then load
- Validate `mcpResources` at runtime instead of schema validation time — catch it in `cliValidateRoot`
- Use `-i` (interactive) flag for `shellEnv` shell spawn — requires a tty; use `-l` (login) instead
- Write `shellEnv` failure messages to stdout — corrupts the MCP wire; stderr only
- Spawn the shell async — `captureShellEnv` must be sync (`spawnSync`) since it runs before the NDJSON loop starts
- Check `requiresEnv` after `cliInvoke` — check it before, so agents get a clean error rather than a handler-level failure
- Write a subprocess test that asserts specific PATH entries from `shellEnv` — shell env is machine-specific; unit-test `applyShellEnv` instead

---

## File change summary

| File | Action |
|------|--------|
| [`src/types.ts`](src/types.ts) | `CliInvocation`, `CliOptionKind.Enum`, `choices` on `CliOption`, `CliMcpToolConfig` additions, `CliMcpResource`, `CliMcpServerConfig` additions |
| [`src/context.ts`](src/context.ts) | `invocation` param + field |
| [`src/validate.ts`](src/validate.ts) | Enum choices validation, `mcpResources` URI uniqueness |
| [`src/parse.ts`](src/parse.ts) | Enum value validation in `postParseValidate` |
| [`src/help.ts`](src/help.ts) | Enum choice label in option display |
| [`src/completion.ts`](src/completion.ts) | Enum choices in completion candidates |
| [`src/runtime.ts`](src/runtime.ts) | Pass `"cli"` to `CliContext` |
| [`src/invoke.ts`](src/invoke.ts) | Pass `"mcp"` to `CliContext` |
| [`src/index.ts`](src/index.ts) | Export `cliInvoke`, `CliInvokeKind`, `CliInvokeResult`, `CliInvocation`, `CliMcpResource` |
| [`src/mcp/tools.ts`](src/mcp/tools.ts) | `resolveToolDescription`, Enum in `optionProperty` |
| [`src/mcp/server.ts`](src/mcp/server.ts) | `allMcpResources` helper, updated `resources/list` + `resources/read` |
| [`src/mcp.ts`](src/mcp.ts) | `captureShellEnv`, `applyShellEnv`, `loadEnvFile`; both called at startup in order |
| [`src/index.test.ts`](src/index.test.ts) | All new unit + subprocess tests |
| [`docs/mcp.md`](docs/mcp.md) | New sections |
| [`README.md`](README.md) | Enum row, MCP blurb |
| [`CHANGELOG.md`](CHANGELOG.md) | Unreleased entries |
| [`index.d.ts`](index.d.ts) | Regenerated via `just typegen` |

---

## Out of scope (explicitly deferred)

- Streaming `tools/call` (requires MCP progress notifications)
- Output truncation in MCP results
- Nested `fallbackCommand` on routing nodes
- GNU-style tail option parsing (`--flag` after positionals)
- Shared option groups / `extends` on commands
- `mcpTool.group` / `risk` annotations
- `structuredError` for JSON on exit(1)
- Hiding `mcpEnabled: false` commands from `--schema`

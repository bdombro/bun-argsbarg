# Writing `Program` and commands with a handler

ArgsBarg turns your schema into help, shell completions, and MCP tools. **The same `description` fields you write for humans are the agent contract** for basic apps.

**Documentation map:** [docs/README.md](README.md) — which guide to read for MCP, configure, consumer docgen, and Cursor setup.

## Minimal app (MCP is free)

```typescript
const app = argsbarg({
  commands: [
    command({
      key: "greet",
      description: "Greet someone by name.",
      positionals: [
        { name: "name", description: "Who to greet.", kind: OptionKind.String },
      ],
      handler: async (ctx) => { /* ... */ },
    }),
  ],
  description: "One-line summary of what the CLI does.",
  key: "myapp",
  mcpServer: { enabled: true },
  version: "1.0.0",
});
```

No `mcpTool` blocks required. Every command becomes an MCP tool; `inputSchema` comes from options and positionals.

## HTTP API (optional)

```typescript
const app = argsbarg({
  commands: [/* ... */],
  description: "One-line summary of what the CLI does.",
  httpServer: { enabled: true }, // myapp api → http://127.0.0.1:3000
  key: "myapp",
  version: "1.0.0",
});
```

`httpServer` and `mcpServer` are independent. Tool exposure uses the same rules (`mcpTool.enabled: false` hides from MCP and HTTP). See [http-server.md](http-server.md).

**Logging** — HTTP and MCP server logs go to stderr (JSON by default). Configure `log` on the app root; use **`enrich`** to add fields or **`serialize`** for a fully custom line. See **[logging.md](logging.md)**.

## Inline schema by default

ArgsBarg is **schema-first** — the program tree is the product. **Keep `Program` and command fields inline** (`key`, `description`, `options`, `positionals`, `handler`) so a reader sees the full command contract in one place.

**Inline by default:**

```typescript
{
  key: "reserve",
  description: "Reserve a QA environment.",
  options: [
    { name: "yes", description: "Skip confirmation; use for non-interactive runs.", kind: OptionKind.Presence },
    { name: "dry-run", description: "Preview without mutating.", kind: OptionKind.Presence },
  ],
  positionals: [
    { name: "env", description: "Environment name.", kind: OptionKind.String, argMin: 0, argMax: 1 },
  ],
  handler: async (ctx) => { /* … */ },
}
```

**Extract only when well justified:**

| Extract | When |
| --- | --- |
| Shared option objects (`DRY_RUN_OPTION`, `JSON_OPTION`) | Identical flag reused on many commands |
| Shared spreads (`...MCP_TOOL_MUTATOR`) | Same `mcpTool` metadata on a family of commands |
| `commands/<name>/command.tsx` module | Entry file is large; handler/body is substantial (Ink page, headless dispatch) |
| `docs.topics` text imports | Compile-time markdown bundling — not schema shape |

**Avoid extracting** thin indirection: a file that only re-exports `{ key, description, options }` with no logic, or splitting every command into its own module when the handler is a few lines. If extraction does not reduce duplication or file size materially, keep it inline.

When you extract a command or command group, prefer a **plain exported object** — not a zero-arg wrapper function:

```typescript
// commands/reserve/command.tsx
export const reserveCommand = command({
  key: "reserve",
  description: "Reserve a QA environment.",
  options: [YES_OPTION, DRY_RUN_OPTION],
  positionals: [/* … */],
  handler: async (ctx) => { /* … */ },
});
```

Use a **parameterized factory** only when the schema truly depends on inputs (e.g. `createUpsertCommand(deps)` for tests or injected config). A `reserveCommand()` that returns a static literal adds indirection without benefit.

Build the app with **`argsbarg({ … })`** and declare every command with **`command({ … })`** — inline or in their own modules — so handlers get typed `ctx.inputs` / `ctx.pathParams`. Extracted command groups can use `satisfies CommandGroup` (command groups have nothing to infer). Keep **program-root fields in alphabetical order** (`appConfig`, `commands`, `description`, `docs`, `hooks`, `httpServer`, `key`, `mcpServer`, `readiness`, `version`, …).

## Descriptions

Write for **what the command does**, not how the UI works:

- **Good:** `Reserve a QA environment.`
- **Weak:** `Opens the reservation wizard.`

Option and positional `description` strings appear in `-h` and MCP `inputSchema` — keep them concrete (`Environment name (e.g. qa2).`).

Use root **`notes`** for cross-cutting hints shown in help (install commands, docs topics, VPN requirements).

## Agent-friendly schema

Descriptions and schemas are copied into MCP tools and HTTP OpenAPI — optimize for smaller, clearer agent payloads:

- **Declare options on the command with a handler** that uses them — command groups cannot declare options (app root may). Wire schemas (MCP, OpenAPI) expose leaf-local options only.
- Prefer **`kind: "document"`** commands with a Zod `inputSchema` for complex tool bodies (one nested object beats many flat flags). Put agent-facing documentation in `.describe()` on every field.
- Keep **`description`** strings short and action-oriented; put examples in **`notes`**, not duplicated in every option.
- Use **`hidden: true`** or **`mcpTool.enabled: false`** for debug/internal commands.
- For shape discovery: HTTP agents load **`docs openapi`** or `GET /openapi.json`; MCP agents use **`docs cli-schema`**; load full **`docs cli`** only when prose is needed.
- Repository **`skills/<app>/SKILL.md`** acts as an intent-based command group that directs agents to `<subcommand> --help` — see [bundled-docs.md](bundled-docs.md#agent-artifact-contract).

Schemas: [json-schema-subset.md](json-schema-subset.md) (Zod 4 authoring; emitted as JSON Schema 2020-12).

## Well-known option names

Prefer **`yes`**, **`dry-run`**, and **`json`** when semantics match. They appear in `-h` and MCP `inputSchema` — write clear option `description` strings (e.g. "Skip confirmation; use for non-interactive runs.").

## When to use `mcpTool` (escape hatches only)

**Omit `mcpTool` unless you have a specific reason.**

### Fix the CLI first

Many "MCP problems" are schema or handler gaps. Prefer these over escape hatches:

| Problem | Fix (not `mcpTool`) |
| --- | --- |
| Agents don't know which flags to pass | Use standard option names (`yes`, `dry-run`, `json`); improve option `description` strings |
| MCP calls hang on prompts | Add `--yes` and a headless code path; use `shouldRunHeadlessWithYes` |
| Help text describes Ink UI | Rewrite command `description` as the action ("Reserve an environment.") |
| MCP needs different args than humans | Expose the same flags; resolve defaults in the handler for both `cli` and `mcp` |
| Command "doesn't work" over MCP | Branch on `ctx.invocation === "mcp"` in the handler (stdio is the wire) |

### When escape hatches are appropriate

| Field | Use when |
| --- | --- |
| `enabled: false` | Command is **genuinely** CLI-only (open browser, Ink-only flow with no scriptable equivalent) |
| `description: "..."` | **Irreducible** MCP limitation (e.g. live tail / `--watch` cannot be streamed on the MCP wire yet) |

### Structured stdout

On **commands with a handler**, set `outputSchema` to a JSON Schema describing stdout when the handler emits JSON (typically with `--json`, or via MCP on the headless path):

```typescript
{
  key: "lookup",
  description: "Resolve owner info.",
  outputSchema: {
    type: "object",
    properties: { user: { type: "string" }, path: { type: "string" } },
    required: ["user", "path"],
  },
  handler: (ctx) => { /* ... */ },
}
```

Exported in `docs cli-schema`, `docs cli`, and MCP `tools/list`. Not validated at runtime yet. Pair with `notes` for prose examples; do not duplicate the full schema in `notes`.

For a **outputSchema codegen guidelines** (TypeScript types → JSON Schema → `outputSchema` constants), see [output-schema.md](output-schema.md).

Do **not** use `mcpTool.description` to paper over missing `--yes`, non-standard flag names, or handlers that only work interactively — fix those instead.

If help text and MCP behavior match after your fixes, **omit `mcpTool` entirely**.

## Value formats

On **string options**, optional metadata improves validation, MCP `inputSchema`, and handler reads:

| Field | Purpose |
| --- | --- |
| `format: ValueFormat.Duration` | Values like `30s`, `20m`, `1h`; read with `ctx.durationOpt(name)` (milliseconds) |
| `format: ValueFormat.CommaList` | Single-flag lists (`--services a,b`); MCP may pass string or array; read with `ctx.commaListOpt(name)` |
| `format: ValueFormat.Date` | `YYYY-MM-DD`; read with `ctx.dateOpt(name)` |
| `format: ValueFormat.DateTime` | RFC 3339 instant; read with `ctx.dateTimeOpt(name)` |
| `default: "..."` | Applied in post-parse when the option is omitted (not valid with `required: true`) |
| `pattern: "..."` | Regex validation (mutually exclusive with `format`) |

`format` applies to **string options only** — not positionals. Post-parse keeps raw strings in `ctx.opts`; typed readers return coerced values.

**Example** (duration with default, comma-list flag):

```typescript
import { OptionKind, ValueFormat } from "argsbarg";

options: [
  {
    name: "timeout",
    description: "Maximum wait time.",
    kind: OptionKind.String,
    format: ValueFormat.Duration,
    default: "20m",
  },
  {
    name: "services",
    description: "Service names to reset (single env only).",
    kind: OptionKind.String,
    format: ValueFormat.CommaList,
  },
],
handler: async (ctx) => {
  const timeoutMs = ctx.durationOpt("timeout")!; // always set via default
  const services = ctx.commaListOpt("services"); // string[] | undefined
},
```

**Varargs positionals** (`argMax: 0`):

| Surface | Multiple values |
| --- | --- |
| CLI | Space-separated words: `myapp uids uid-a uid-b` |
| MCP | JSON array on the positional key: `{ "uids": ["uid-a", "uid-b"] }` |

Read varargs with `ctx.positional("uids")` (returns `string[]`) or `ctx.args`. Do not comma-split argv tokens or use `format` on positionals.

**`ctx.inputs`** — coerced option and positional values for the current command. When `inputSchema` (a Zod schema) is set, argsbarg validates **before the handler runs** and `ctx.inputs` is the schema's **parsed output** (defaults and transforms applied), cached on `ctx`:

```typescript
const { limit, "skip-readiness": skipReadiness, timeout } = ctx.inputs;
```

**`command`** — declare every command with `command({ … })`: `ctx.inputs` is typed as `z.output<typeof inputSchema>` (or from the `options` / `positionals` literals), `ctx.pathParams` from `pathParams`, and the handler's return value is checked against `outputSchema`. A one-command CLI passes its handler straight to `argsbarg({ …, handler })`, which infers the same way. Results fit anywhere a `RunnableCommand` / `Program` does, including command group `commands` arrays.

```typescript
import { command } from "argsbarg";
import { RenderInvoiceInput } from "./types.ts"; // z.strictObject({ format: z.enum(["pdf", "html"]), invoice: … })

export const renderInvoice = command({
  key: "render-invoice",
  description: "Render an invoice from template data",
  kind: "document",
  inputSchema: RenderInvoiceInput,
  handler: (ctx) => {
    const { format, invoice } = ctx.inputs; // typed
    // ...
  },
});
```

**Typed options without a schema** — `command` also types `ctx.inputs` from the command's own `options` / `positionals` literals: presence → `boolean`, `Number` → `number`, `Enum` → its `choices` union, `Duration` → `number` (ms), `CommaList` → `string[]`, other strings → `string`; `required` or `default` options (and single positionals with `argMin` ≥ 1) are non-optional. Root and ancestor options are present at runtime but not in the type.

**Path parameters** — `:param` command group values are available as `ctx.pathParams` (raw strings; `ctx.rawPathParams` always holds the raw segments). Declare `pathParams: z.strictObject({ id: z.string().describe("…") })` on the command to validate them before the handler, type them via `command`, and describe them in MCP tool schemas and OpenAPI. Keys must match the `:param` names above the command and must not also appear in `inputSchema`. Undeclared path params are merged into `ctx.inputs`.

**`CommandInputs`** — return type of `ctx.inputs` (exported from `"argsbarg"`). A flat record keyed by **schema option and positional names** (hyphens preserved, e.g. `"skip-readiness"`). Values are coerced per kind/format:

| Schema | Value in `CommandInputs` |
| --- | --- |
| Presence | `boolean` |
| Number | `number` or `undefined` if omitted |
| String (plain) | `string` or `undefined` |
| `format: duration` | `number` (milliseconds) |
| `format: comma-list` | `string[]` |
| `format: date` | `string` (`YYYY-MM-DD`) |
| `format: date-time` | `string` (normalized UTC ISO) |
| Single positional | `string` or `undefined` |
| Varargs positional | `string[]` or `undefined` |
| `kind: json` | parsed object/array or `undefined` (`ctx.jsonOpt(name)`; piped stdin preloaded before handler) |

Omitted options appear as `undefined` (not absent keys). Options with `default` are filled in post-parse before handlers run, so `ctx.inputs` and `durationOpt` see defaults. **`ctx.opts` always holds raw strings** — use typed accessors or `ctx.inputs` for coerced values.

### Typed `locals` and server `state`

**`ctx.locals`** — per-invocation bag populated in `program.hooks.beforeInvoke` (framework seeds `requestId` before hooks run). **`ctx.runtime.state`** — shared HTTP/MCP server bag (DB pools, readiness cache, etc.).

Argsbarg exports empty **`Locals`** and **`ServerState`** interfaces. Augment them once in your app so handlers see typed fields.

Create a `src/types/argsbarg.d.ts` file (or any name under your `tsconfig.json`'s `include` path) and ensure it contains at least one top-level `import` or `export` statement so TypeScript treats it as a module (module augmentation). Because it is matched by the `include` paths in `tsconfig.json`, TypeScript automatically loads it globally—no runtime or build-time imports are needed in your entry points!

```typescript
// src/types/argsbarg.d.ts
import type { AppDb } from "../db";

declare module "argsbarg" {
  interface Locals {
    db: AppDb;
  }
  interface ServerState {
    db?: AppDb;
  }
}
```

```typescript
// app.ts
hooks: { beforeInvoke: AppDb.attach },

// handler
handler: (ctx) => ctx.locals.db.workspaces.list(),
```

Use **`Locals`** for handler-facing per-request state (`ctx.locals.db`). Use **`ServerState`** for cross-request server resources (`ctx.runtime.state.db`). Populate both in `beforeInvoke` when needed.

### Json options and piped stdin

For nested tool bodies (e.g. invoice template data), declare a matching property in the command's Zod `inputSchema` and add a **`kind: Json`** option with the same name:

```typescript
{
  name: "invoice",
  description: "Invoice template data. Pass JSON via --invoice or pipe to stdin.",
  kind: OptionKind.Json,
  pipable: true,
  required: true,
}
```

| Surface | How `invoice` is supplied |
| --- | --- |
| CLI | `--invoice '<json>'` **or** omit the flag and pipe JSON to stdin (preloaded before the handler) |
| MCP / HTTP | `invoice` object in the tool JSON body (`ctx.toolArgs`) |

**Precedence:** if `--invoice` is set, the flag value wins and stdin is not read.

Use **`ctx.jsonOpt("invoice")`** or **`ctx.inputs`** — both synchronous. Argsbarg reads piped stdin before calling the handler when a `pipable` Json flag is omitted. When `leaf.inputSchema` is set, argsbarg validates merged inputs with Zod **before the handler runs**; `ctx.inputs` returns the cached parsed value.

At most one `pipable` Json option per command. Json option names must be properties of the `inputSchema` object when one is set.

### Structured document commands (`kind: "document"`)

When the entire tool body is a structured document (JSON or YAML, no CLI flags), set **`kind: "document"`** on the command with **`inputSchema`** and **no `options` or `positionals`**:

```typescript
command({
  key: "render-invoice",
  description: "Render an invoice from template data",
  kind: "document",
  inputSchema: RenderInvoiceInput,
  handler: (ctx) => {
    const { format, invoice } = ctx.inputs;
    // ...
  },
})
```

| Surface | How input is supplied |
| --- | --- |
| CLI | One JSON or YAML positional **or** pipe a JSON/YAML document to stdin |
| MCP / HTTP | Full tool args object (`ctx.toolArgs` / JSON or YAML request body) |

Example CLI:
```bash
# JSON positional or pipe
jq '{format:"pdf", invoice:.}' data.json | myapp render-invoice
myapp render-invoice '{"format":"pdf","invoice":{"id":"INV-1"}}'

# YAML positional or pipe
myapp render-invoice 'format: pdf
invoice:
  id: INV-1'
cat << 'EOF' | myapp render-invoice
format: pdf
invoice:
  id: INV-1
EOF
```

See [json-schema-subset.md](json-schema-subset.md) for authoring schemas in Zod, [output-schema.md](output-schema.md) for `outputSchema`, and [http-server.md](http-server.md) for HTTP tool bodies.

`CommandInputs` (commands without an `inputSchema`) is intentionally untyped at the framework level. Narrow in your app (`read*Flags(ctx)` returning a typed struct), or give the command a Zod `inputSchema` and declare it with `command`.

See [examples/formats.ts](../examples/formats.ts) for a runnable demo.

Cross-field rules (e.g. `--match-remote` requires `--branch`) stay in consumer `resolve*` layers — argsbarg does not validate those.

## Read flags once, resolve once

For apps with **Ink + headless + MCP** (multiple surfaces per command), avoid scattering `ctx.hasFlag` / `ctx.stringOpt` through the handler. Use two layers:

| Layer | Responsibility |
| --- | --- |
| **`read*Flags(ctx)`** | Read coerced values from `ctx` (`ctx.inputs`, `durationOpt`, `commaListOpt`, shared mutator flags) into one typed struct |
| **`resolve*Input(flags)`** | Cross-field validation and defaults; returns `{ ok, input }` or `{ ok: false, error }` |

The handler calls **`read*Flags` once**, passes the struct to **`resolve*Input`**, then branches to Ink, headless, or MCP with the same resolved input.

**Shared reads** — when many commands share options (`yes`, `dry-run`, `json`), one app-level helper (e.g. `readMutatingFlags(ctx)`) plus per-command extensions:

```typescript
// cli/flags.ts
export function readMutatingFlags(ctx: CommandContext) {
  const dryRun = ctx.hasFlag("dry-run");
  return {
    dryRun,
    yes: ctx.hasFlag("yes"),
    explicitJson: wantsExplicitJson(ctx, ctx.hasFlag("json")),
  };
}

// commands/reset/resolve.ts
export function readResetFlags(ctx: CommandContext) {
  return {
    ...readMutatingFlags(ctx),
    env: ctx.args[0],
    force: ctx.hasFlag("force"),
    services: ctx.commaListOpt("services"),
  };
}

export function resolveResetInput(flags: ReturnType<typeof readResetFlags>) {
  if (!flags.env) return { ok: false, error: "…" };
  return { ok: true, input: { env: flags.env, force: flags.force, services: flags.services } };
}

// command handler
handler: async (ctx) => {
  const flags = readResetFlags(ctx);
  await dispatchMutatingCommand({
    dryRun: flags.dryRun,
    headless: shouldRunHeadlessWithYes(ctx, { yes: flags.yes, hasRequiredArgs: !!flags.env, dryRun: flags.dryRun }),
    resolve: () => resolveResetInput(flags),
    /* … */
  });
};
```

**JSON-only CLIs** — a single `readCommandOptions(ctx)` wrapping `ctx.inputs` per shared option set is usually enough; full `resolve*` layering is optional.

## Upgrading to 3.6+

### MCP varargs (breaking)

Varargs positionals (`argMax: 0`) must be a **JSON array** in `tools/call` — comma-separated strings are no longer accepted.

```json
// before (removed)
{ "uids": "a,b,c" }

// after
{ "uids": ["a", "b", "c"] }
```

CLI argv is unchanged: space-separated words. Use `format: comma-list` on an **option** when a single flag should accept `a,b` or `["a","b"]` over MCP.

### Value formats (optional)

Add `format`, `default`, or `pattern` on string **options**; read with `ctx.durationOpt`, `ctx.commaListOpt`, `ctx.inputs`, etc. Replace hand-rolled `split(",")` / `parseDurationMs` try/catch where the schema can declare the shape.

### Handler layering (optional)

Ink + headless + MCP apps benefit from `read*Flags(ctx)` + `resolve*Input(flags)` — see above.

## Headless-capable handlers

Simple commands (read args, print stdout) are already headless — no extra work. **Any handler that might mount Ink, prompt, or open a browser should also implement a scriptable fast path** for:

- **MCP** (`ctx.invocation === "mcp"` — always non-interactive)
- **HTTP API** (`ctx.invocation === "http"` — same headless rules as MCP)
- **Non-TTY CLI** (pipes, CI, `myapp cmd --yes` in a script)
- **Explicit flags** (`--json`, `--dry-run`)

Use **one headless implementation** for MCP, HTTP API, and scripted CLI; do not fork separate transport handlers.

### When to branch

| Command kind | Headless trigger | Helpers |
| --- | --- | --- |
| Read / query | MCP, `--json`, or non-TTY | `shouldRunHeadless`, `wantsExplicitJson` |
| Mutate | MCP with args + `yes`/`dry-run`, or non-TTY with `--yes` | `shouldRunHeadlessWithYes`, `requireYesInNonTty` |
| Mutate with positionals | Same, but avoid auto-headless on empty argv | `shouldRunHeadlessWithPositionals` |

### Recommended handler shape

**Mutating command** (wizard optional, script path required):

```typescript
import { requireYesInNonTty, shouldRunHeadlessWithYes } from "argsbarg";

handler: async (ctx) => {
  const dryRun = ctx.hasFlag("dry-run");
  const yes = ctx.hasFlag("yes");
  const env = ctx.args[0];

  requireYesInNonTty(yes, "Example: myapp reserve qa2 --yes", dryRun);

  if (shouldRunHeadlessWithYes(ctx, { yes, hasRequiredArgs: !!env, dryRun })) {
    const result = await executeReserve({ dryRun, env, yes });
    process.stdout.write(`${result.message}\n`);
    return;
  }

  await renderInteractiveWizard({ env, yes, dryRun });
};
```

**Read / query command** (optional `--json`):

```typescript
import { shouldRunHeadless, wantsExplicitJson } from "argsbarg";

handler: async (ctx) => {
  const json = ctx.hasFlag("json");

  if (shouldRunHeadless(ctx, json)) {
    const data = await fetchStatus(ctx.args[0]);
    if (wantsExplicitJson(ctx, json)) {
      process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    } else {
      process.stdout.write(formatStatusHuman(data));
    }
    return;
  }

  await renderPage(<StatusPage env={ctx.args[0]} />);
};
```

### Rules of thumb

1. **Resolvable from flags** — if a human can complete the action with flags, an agent can too (`--env qa2 --yes`). Wizards are optional sugar on TTY.
2. **`--yes` on mutators** — required for non-TTY CLI scripts; MCP should pass `yes: true` in tool arguments when the schema exposes `yes`.
3. **Stdout is the contract** — headless paths write results to stdout (or JSON with `--json`); stderr for errors. No Ink on the MCP wire.
4. **`ctx.invocation === "mcp"`** — use only for wire-specific behavior (pipe child stdout, reject `--watch`, etc.), not to duplicate business logic.
5. **Hide only when impossible** — `mcpTool.enabled: false` after confirming no headless path exists (browser-only, irreducible streaming).

Basic synchronous handlers do not need this structure — only commands with an interactive branch.

## Configuration (`appConfig`)

Declare app configuration on the **app root** (not on commands). Values persist in a flat JSON file; handlers read resolved values via `ctx.appConfig`.

```typescript
import { argsbarg } from "argsbarg";
import { Settings } from "./config/types.ts"; // Zod object schema

const app = argsbarg({
  key: "myapp",
  version: "1.0.0",
  description: "…",
  appConfig: {
    schema: Settings, // optional; omit for all-string mode
    entries: {
      apiToken: {
        description: "Create at https://example.com/settings/tokens",
        env: "API_TOKEN",
        sensitive: true,
      },
      defaultRegion: {
        title: "Default region",
        description: "AWS region (default us-east-1).",
        required: false,
      },
      maxRetries: { description: "Retry count." },
    },
  },
  handler: (ctx) => {
    const token = ctx.appConfig.require("apiToken");
    const region = ctx.appConfig.get("defaultRegion");
  },
});

await app.run();
```

| Field | Default | Purpose |
| --- | --- | --- |
| `description` | *(required)* | Shown in prompts, `configure get`, and bundle manifests |
| `title` | config key | Short label in interactive `configure` |
| `default` | — | Used when `schema` omitted (all-string mode) |
| `required` | `true` | When `false`, optional unless required by `schema` |
| `sensitive` | name heuristic (`token`, `secret`, …) | Redact in prompts, `configure get`, and status |
| `env` | — | When set: non-empty host env overrides file; consulted again after `resolve` when `resolve` returns `undefined`; exported to `process.env` after resolve |
| `resolve` | — | Optional fallback after file; return `undefined` to fall back to `env` (if set) and defaults |

**Config file** (created on demand):

- Default: `$XDG_CONFIG_HOME/<sanitized-key>/config` or `%APPDATA%/<key>/config`.
- JSON: flat object keyed by schema names — `{ "apiToken": "…", "maxRetries": 5 }`.
- **Strict:** unknown keys rejected on load.
- **CLI:** missing required config exits 1 before the command handler (TTY prompt when interactive). Built-in `docs` and `configure get`/`set` skip this exit.
- **MCP:** server stays up; missing config returns `isError: true` at `tools/call`.
- **Configure:** interactive `configure` runs the app config wizard; **`configure install`** registers MCP in `~/.agents/mcp.json` (see https://dotagentsprotocol.com). Optional `configure.afterInstall` / `configure.beforeUninstall` for app-specific agent setup; see [configure.md](configure.md).
- **MCP install:** `mcpServer: { enabled: true }` merges into `~/.agents/mcp.json` on `configure install`; manual Cursor/Claude setup in [mcp.md](mcp.md).

See [config-schema.md](config-schema.md) for codegen, [configure.md](configure.md) (`configure.targets`), and [mcp.md](mcp.md).

**Handler access (`ctx.appConfig`):** `get`, `require`, `set`, `read` (schema-aware, resolved values); `getUnsafe`, `setUnsafe`, `readUnsafe` (raw file, works without `appConfig`); `path`, `dir`. Prefer `get`/`set` when `appConfig` is declared. Env export remains for subprocess inheritance. `path` is `~/.local/lib/<key>/config.json`; `dir` is its parent.

**`_bindings`:** reserved metadata for per-key intent (`env`, `file`, `skip`). Set by the wizard, `configure set --from-env`, or `ctx.appConfig.set`. Does not change resolve order (env still wins when set).

## Reserved names

Do not declare user commands named `completion`, `configure`, `mcp`, `version`, or `docs` at the root — ArgsBarg injects these when configured. App config uses `configure get` / `configure set` subcommands (not a top-level `config` command).

## Agent instructions for consumer repos

Argsbarg ships framework docs under `node_modules/argsbarg/docs/` (same files as this repo’s `docs/`). **This file is the authoritative guide** — `AGENTS.md` inlines the tripwire rules that tell agents when to read it.

Agents do **not** discover package docs automatically. Wire them in after `bun add argsbarg`:

1. **Use the copy template `AGENTS.md`** (recommended):

```bash
bun scripts/merge-agents-md.ts .
```

`bun x argsbarg@latest create` copies `AGENTS.md` and `CLAUDE.md` (`@AGENTS.md`) into new projects automatically.

2. **Add app-specific sections below the managed block** (recommended). The framework baseline lives between `<!-- argsbarg:managed -->` and `<!-- /argsbarg:managed -->` at the top of the file. All application-specific sections (`## Tooling`, `## Documentation`, `## App conventions`, custom rules) live below the closing marker where they take precedence over framework defaults. Example:

```markdown
## App conventions

- Shared mutator flags: `readQaMutatingFlags(ctx)` in `src/cli/shared.ts`.
- Per command: `read*Flags` + `resolve*Input` in `commands/<name>/resolve.ts`.
```

If you maintain argsbarg from a sibling checkout, `just consumers-dev` / `just consumers-sync` refresh the shared managed section and **keep** all app-specific sections below it. Commit `AGENTS.md` in your repo.

- **Not this file:** `skills/<app>/SKILL.md` in your repository is the **app** skill — how to *invoke* the CLI. `AGENTS.md` is for *authoring* argsbarg schema.

## See also

- [Documentation map](README.md) — which doc to read when
- [Output schemas](output-schema.md) — codegen pipeline for command `outputSchema`
- [Developing argsbarg](developing.md) — release, consumer sync, npm `files`
- [MCP server](mcp.md) — tools, schema resource, env bootstrapping
- [Agent skills](ai-skills.md) — repository skills
- [Bundled docs](bundled-docs.md) — `docs` topics, consumer docgen vs framework docs

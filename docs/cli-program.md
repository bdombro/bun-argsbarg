# Writing `CliProgram` and leaf commands

ArgsBarg turns your schema into help, shell completions, MCP tools, and agent skills. **The same `description` fields you write for humans are the agent contract** for basic apps.

**Documentation map:** [docs/README.md](README.md) — which guide to read for MCP, configure, consumer docgen, and Cursor setup.

## Minimal app (MCP is free)

```typescript
const cli = {
  key: "myapp",
  version: "1.0.0",
  description: "One-line summary of what the CLI does.",
  mcpServer: { enabled: true },
  commands: [
    {
      key: "greet",
      description: "Greet someone by name.",
      positionals: [
        { name: "name", description: "Who to greet.", kind: CliOptionKind.String },
      ],
      handler: async (ctx) => { /* ... */ },
    },
  ],
} satisfies CliProgram;
```

No `mcpTool` blocks required. Every leaf becomes an MCP tool; `inputSchema` comes from options and positionals.

## HTTP API (optional)

```typescript
const cli = {
  key: "myapp",
  version: "1.0.0",
  description: "One-line summary of what the CLI does.",
  apiServer: { enabled: true }, // myapp api → http://127.0.0.1:3000
  commands: [/* ... */],
} satisfies CliProgram;
```

`apiServer` and `mcpServer` are independent. Tool exposure uses the same rules (`mcpTool.enabled: false` hides from MCP and HTTP). See [api-server.md](api-server.md).

## Inline schema by default

ArgsBarg is **schema-first** — the program tree is the product. **Keep `CliProgram` and leaf fields inline** (`key`, `description`, `options`, `positionals`, `handler`) so a reader sees the full command contract in one place.

**Inline by default:**

```typescript
{
  key: "reserve",
  description: "Reserve a QA environment.",
  options: [
    { name: "yes", description: "Skip confirmation; use for non-interactive runs.", kind: CliOptionKind.Presence },
    { name: "dry-run", description: "Preview without mutating.", kind: CliOptionKind.Presence },
  ],
  positionals: [
    { name: "env", description: "Environment name.", kind: CliOptionKind.String, argMin: 0, argMax: 1 },
  ],
  handler: async (ctx) => { /* … */ },
}
```

**Extract only when well justified:**

| Extract | When |
| --- | --- |
| Shared option objects (`DRY_RUN_OPTION`, `JSON_OPTION`) | Identical flag reused on many leaves |
| Shared spreads (`...MCP_TOOL_MUTATOR`) | Same `mcpTool` metadata on a family of commands |
| `commands/<name>/command.tsx` module | Entry file is large; handler/body is substantial (Ink page, headless dispatch) |
| `docs.topics` text imports | Compile-time markdown bundling — not schema shape |

**Avoid extracting** thin indirection: a file that only re-exports `{ key, description, options }` with no logic, or splitting every leaf into its own module when the handler is a few lines. If extraction does not reduce duplication or file size materially, keep it inline.

When you extract a leaf or router, prefer a **plain exported object** — not a zero-arg wrapper function:

```typescript
// commands/reserve/command.tsx
export const reserveCommand = {
  key: "reserve",
  description: "Reserve a QA environment.",
  options: [YES_OPTION, DRY_RUN_OPTION],
  positionals: [/* … */],
  handler: async (ctx) => { /* … */ },
} satisfies CliLeaf;
```

Use a **parameterized factory** only when the schema truly depends on inputs (e.g. `createUpsertCommand(deps)` for tests or injected config). A `reserveCommand()` that returns a static literal adds indirection without benefit.

**`satisfies CliProgram`** on the root (or **`satisfies CliLeaf`** / router type on extracted modules) preserves type-checking whether inline or not.

## Descriptions

Write for **what the command does**, not how the UI works:

- **Good:** `Reserve a QA environment.`
- **Weak:** `Opens the reservation wizard.`

Option and positional `description` strings appear in `-h`, MCP `inputSchema`, and generated skills — keep them concrete (`Environment name (e.g. qa2).`).

Use root **`notes`** for cross-cutting hints shown in help (install commands, docs topics, VPN requirements).

## Well-known option names

Prefer **`yes`**, **`dry-run`**, and **`json`** when semantics match. They appear in `-h`, MCP `inputSchema`, and generated skills — write clear option `description` strings (e.g. "Skip confirmation; use for non-interactive runs.").

## When to use `mcpTool` (escape hatches only)

**Omit `mcpTool` unless you have a specific reason.**

### Fix the CLI first

Many "MCP problems" are schema or handler gaps. Prefer these over escape hatches:

| Problem | Fix (not `mcpTool`) |
| --- | --- |
| Agents don't know which flags to pass | Use standard option names (`yes`, `dry-run`, `json`); improve option `description` strings |
| MCP calls hang on prompts | Add `--yes` and a headless code path; use `shouldRunHeadlessWithYes` |
| Help text describes Ink UI | Rewrite leaf `description` as the action ("Reserve an environment.") |
| MCP needs different args than humans | Expose the same flags; resolve defaults in the handler for both `cli` and `mcp` |
| Command "doesn't work" over MCP | Branch on `ctx.invocation === "mcp"` in the handler (stdio is the wire) |

### When escape hatches are appropriate

| Field | Use when |
| --- | --- |
| `enabled: false` | Command is **genuinely** CLI-only (open browser, Ink-only flow with no scriptable equivalent) |
| `description: "..."` | **Irreducible** MCP limitation (e.g. live tail / `--watch` cannot be streamed on the MCP wire yet) |

### Structured stdout

On **leaf commands**, set `outputSchema` to a JSON Schema describing stdout when the handler emits JSON (typically with `--json`, or via MCP on the headless path):

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

Exported in `docs cli-schema`, `docs api`, skill `reference.md`, and MCP `tools/list`. Not validated at runtime yet. Pair with `notes` for prose examples; do not duplicate the full schema in `notes`.

For a **outputSchema codegen guidelines** (TypeScript types → JSON Schema → `outputSchema` constants), see [output-schema.md](output-schema.md).

Do **not** use `mcpTool.description` to paper over missing `--yes`, non-standard flag names, or handlers that only work interactively — fix those instead.

If help text and MCP behavior match after your fixes, **omit `mcpTool` entirely**.

## Value formats

On **string options**, optional metadata improves validation, MCP `inputSchema`, and handler reads:

| Field | Purpose |
| --- | --- |
| `format: CliValueFormat.Duration` | Values like `30s`, `20m`, `1h`; read with `ctx.durationOpt(name)` (milliseconds) |
| `format: CliValueFormat.CommaList` | Single-flag lists (`--services a,b`); MCP may pass string or array; read with `ctx.commaListOpt(name)` |
| `format: CliValueFormat.Date` | `YYYY-MM-DD`; read with `ctx.dateOpt(name)` |
| `format: CliValueFormat.DateTime` | RFC 3339 instant; read with `ctx.dateTimeOpt(name)` |
| `default: "..."` | Applied in post-parse when the option is omitted (not valid with `required: true`) |
| `pattern: "..."` | Regex validation (mutually exclusive with `format`) |

`format` applies to **string options only** — not positionals. Post-parse keeps raw strings in `ctx.opts`; typed readers return coerced values.

**Example** (duration with default, comma-list flag):

```typescript
import { CliOptionKind, CliValueFormat } from "argsbarg";

options: [
  {
    name: "timeout",
    description: "Maximum wait time.",
    kind: CliOptionKind.String,
    format: CliValueFormat.Duration,
    default: "20m",
  },
  {
    name: "services",
    description: "Service names to reset (single env only).",
    kind: CliOptionKind.String,
    format: CliValueFormat.CommaList,
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

**`readLeafInputs()`** — for leaves with several flags, one schema-driven read instead of hand-rolled `hasFlag` / `stringOpt` lines:

```typescript
const { limit, "skip-readiness": skipReadiness, timeout } = ctx.readLeafInputs();
// duration → number (ms); comma-list → string[]; presence → boolean; number → number
```

**`CliLeafInputs`** — return type of `readLeafInputs()` (exported from `"argsbarg"`). A flat record keyed by **schema option and positional names** (hyphens preserved, e.g. `"skip-readiness"`). Values are coerced per kind/format:

| Schema | Value in `CliLeafInputs` |
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
| `kind: json` | parsed object/array or `undefined` (use `readLeafInputsAsync()` for pipable stdin and MCP merge) |

Omitted options appear as `undefined` (not absent keys). Options with `default` are filled in post-parse before handlers run, so `readLeafInputs()` and `durationOpt` see defaults. **`ctx.opts` always holds raw strings** — use typed accessors or `readLeafInputs()` for coerced values.

### Json options and piped stdin

For nested tool bodies (e.g. invoice template data), declare a matching property in schemagen `inputType`, wire `inputSchema` on the leaf, and add a **`kind: Json`** option with the same name:

```typescript
{
  name: "invoice",
  description: "Invoice template data. Pass JSON via --invoice or pipe to stdin.",
  kind: CliOptionKind.Json,
  pipable: true,
  required: true,
}
```

| Surface | How `invoice` is supplied |
| --- | --- |
| CLI | `--invoice '<json>'` **or** omit the flag and pipe JSON to stdin |
| MCP / HTTP | `invoice` object in the tool JSON body (`ctx.toolArgs`) |

**Precedence:** if `--invoice` is set, the flag value wins and stdin is not read.

Use **`await ctx.readLeafInputsAsync()`** (not sync `readLeafInputs()`) so Json options resolve from flags, piped stdin, or `toolArgs`. When `leaf.inputSchema` is set, argsbarg validates the merged inputs (same JSON Schema subset as `program.appConfig`).

At most one `pipable` Json option per leaf. Json option names must appear in `inputSchema.properties` when a custom `inputSchema` is set.

See [output-schema.md](output-schema.md) for schemagen `inputType` and [api-server.md](api-server.md) for HTTP tool bodies.

`CliLeafInputs` is intentionally untyped at the framework level. Narrow in your app (`read*Flags(ctx)` returning a typed struct) rather than expecting inference from `satisfies CliLeaf`.

See [examples/formats.ts](../examples/formats.ts) for a runnable demo.

Cross-field rules (e.g. `--match-remote` requires `--branch`) stay in consumer `resolve*` layers — argsbarg does not validate those.

## Read flags once, resolve once

For apps with **Ink + headless + MCP** (multiple surfaces per leaf), avoid scattering `ctx.hasFlag` / `ctx.stringOpt` through the handler. Use two layers:

| Layer | Responsibility |
| --- | --- |
| **`read*Flags(ctx)`** | Read coerced values from `ctx` (`readLeafInputs()`, `durationOpt`, `commaListOpt`, shared mutator flags) into one typed struct |
| **`resolve*Input(flags)`** | Cross-field validation and defaults; returns `{ ok, input }` or `{ ok: false, error }` |

The handler calls **`read*Flags` once**, passes the struct to **`resolve*Input`**, then branches to Ink, headless, or MCP with the same resolved input.

**Shared reads** — when many leaves share options (`yes`, `dry-run`, `json`), one app-level helper (e.g. `readMutatingFlags(ctx)`) plus per-command extensions:

```typescript
// cli/flags.ts
export function readMutatingFlags(ctx: CliContext) {
  const dryRun = ctx.hasFlag("dry-run");
  return {
    dryRun,
    yes: ctx.hasFlag("yes"),
    explicitJson: wantsExplicitJson(ctx, ctx.hasFlag("json")),
  };
}

// commands/reset/resolve.ts
export function readResetFlags(ctx: CliContext) {
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

**JSON-only CLIs** — a single `readCommandOptions(ctx)` wrapping `readLeafInputs()` per shared option set is usually enough; full `resolve*` layering is optional.

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

Add `format`, `default`, or `pattern` on string **options**; read with `ctx.durationOpt`, `ctx.commaListOpt`, `ctx.readLeafInputs()`, etc. Replace hand-rolled `split(",")` / `parseDurationMs` try/catch where the schema can declare the shape.

### Handler layering (optional)

Ink + headless + MCP apps benefit from `read*Flags(ctx)` + `resolve*Input(flags)` — see above.

## Headless-capable handlers

Simple leaves (read args, print stdout) are already headless — no extra work. **Any handler that might mount Ink, prompt, or open a browser should also implement a scriptable fast path** for:

- **MCP** (`ctx.invocation === "mcp"` — always non-interactive)
- **HTTP API** (`ctx.invocation === "api"` — same headless rules as MCP)
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
import {
  requireYesInNonTty,
  shouldRunHeadlessWithYes,
} from "argsbarg";

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

## Configuration (`program.appConfig`)

Declare app configuration on the **program root** (not on leaves). Values persist in a flat JSON file; handlers read resolved values via `ctx.appConfig`.

```typescript
import { Cli, type CliProgram } from "argsbarg";
import { APP_CONFIG_JSON_SCHEMA } from "./schemas/configSchemas.js";

const program = {
  key: "myapp",
  version: "1.0.0",
  description: "…",
  appConfig: {
    jsonSchema: APP_CONFIG_JSON_SCHEMA, // optional; omit for all-string mode
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
} satisfies CliProgram;

const cli = new Cli(program);
await cli.run();
```

| Field | Default | Purpose |
| --- | --- | --- |
| `description` | *(required)* | Shown in prompts, `configure get`, and bundle manifests |
| `title` | config key | Short label in interactive `configure` |
| `default` | — | Used when `jsonSchema` omitted (all-string mode) |
| `required` | `true` | When `false`, optional unless required by `jsonSchema` |
| `sensitive` | name heuristic (`token`, `secret`, …) | Redact in prompts, `configure get`, and status |
| `env` | — | When set: non-empty host env overrides file; consulted again after `resolve` when `resolve` returns `undefined`; exported to `process.env` after resolve |
| `resolve` | — | Optional fallback after file; return `undefined` to fall back to `env` (if set) and defaults |

**Config file** (created on demand):

- Default: `$XDG_CONFIG_HOME/<sanitized-key>/config` or `%APPDATA%/<key>/config`.
- JSON: flat object keyed by schema names — `{ "apiToken": "…", "maxRetries": 5 }`.
- **Strict:** unknown keys rejected on load.
- **CLI:** missing required config exits 1 before the leaf handler (TTY prompt when interactive). Built-in `docs` and `configure get`/`set` skip this exit.
- **MCP:** server stays up; missing config returns `isError: true` at `tools/call`.
- **Configure:** interactive `configure` runs the app config wizard; **`configure --sync`** refreshes agent artifacts.
- **Agent integration:** `configure.agentIntegration` (`mcp` | `skill` | `both`) sets default sync targets; see [configure.md](configure.md#configuretargets).

See [config-schema.md](config-schema.md) for codegen, [configure.md](configure.md) (`configure.targets`), and [mcp.md](mcp.md).

**Handler access (`ctx.appConfig`):** `get`, `require`, `set`, `read` (schema-aware, resolved values); `getUnsafe`, `setUnsafe`, `readUnsafe` (raw file, works without `program.appConfig`); `path`, `dir`. Prefer `get`/`set` when `appConfig` is declared. Env export remains for subprocess inheritance. `path` is `~/.local/lib/<key>/config.json`; `dir` is its parent.

**`_bindings`:** reserved metadata for per-key intent (`env`, `file`, `skip`). Set by the wizard, `configure set --from-env`, or `ctx.appConfig.set`. Does not change resolve order (env still wins when set).

## Reserved names

Do not declare user commands named `completion`, `configure`, `mcp`, `version`, or `docs` at the root — ArgsBarg injects these when configured. App config uses `configure get` / `configure set` subcommands (not a top-level `config` command).

## Cursor rule for consumer repos

Argsbarg ships framework docs under `node_modules/argsbarg/docs/` (same files as this repo’s `docs/`). **This file is the authoritative guide** — the Cursor rule is a thin tripwire that tells agents to read it.

Agents do **not** discover package docs automatically. Wire them in after `bun add argsbarg`:

1. **Copy the Cursor rule** (recommended):

```bash
mkdir -p .cursor/rules
bun scripts/merge-cli-program-rule.ts . \
  node_modules/argsbarg/examples/full-example/.cursor/rules/cli-program.mdc
```

The template is ~30 lines: when to read which doc, plus hard rules agents often get wrong. It does **not** duplicate this guide. `bunx argsbarg create` copies this file into new projects automatically.

2. **Add an app-specific block at the bottom** (recommended). Replace the template placeholder with a heading like `**myapp conventions:**` and short bullets — shared flag modules, `read*Flags` / `resolve*` paths, Ink vs JSON-only, etc. Example:

```markdown
**sqsp-qa conventions:**

- Shared mutator flags: `readQaMutatingFlags(ctx)` in `src/cli/shared.ts`.
- Per command: `read*Flags` + `resolve*Input` in `commands/<name>/resolve.ts`.
```

If you maintain argsbarg from a sibling checkout, `just consumer-dev` / `just consumers-sync` refresh the shared template and **keep** this footer (matched by the `**… conventions:**` heading). Commit `.cursor/rules/cli-program.mdc` in your repo.

3. **Optional:** a separate rule (e.g. `.cursor/argsbarg.mdc` or `AGENTS.md`) for broader package API notes.

**Not this file:** `myapp configure` writes the **app** skill (`SKILL.md` under `~/.cursor/skills/`) from your command schema — how to *invoke* the CLI. The rule above is for *authoring* argsbarg schema.

## See also

- [Documentation map](README.md) — which doc to read when
- [Output schemas](output-schema.md) — codegen pipeline for leaf `outputSchema`
- [Developing argsbarg](developing.md) — release, consumer sync, npm `files`
- [MCP server](mcp.md) — tools, schema resource, env bootstrapping
- [Agent skills](ai-skills.md) — `configure`
- [Bundled docs](bundled-docs.md) — `docs` topics, consumer docgen vs framework docs

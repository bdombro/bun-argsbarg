![Logo](logo.png)
<!-- Big money NE - https://patorjk.com/software/taag/#p=testall&f=Bulbhead&t=shebangsy&x=none&v=4&h=4&w=80&we=false> -->

[GitHub](https://github.com/bdombro/bun-argsbarg)
[License: MIT](LICENSE)
[npm version](https://www.npmjs.com/package/argsbarg)
[Bun](https://bun.sh)

Build beautiful, well-behaved, production-grade CLIs, HTTP REST services, MCP Servers for Bun from a single, unified schema. Zero dependencies — one peer: [Zod](https://zod.dev).

Why ArgsBarg?

*Schema-first & Auto-validated* — Define your entire command structure, options, description, and inputs once. ArgsBarg compiles this into type-safe option accessors, command-line routing, and validation schemas, keeping your code and interfaces perfectly aligned.

*Zod Schemas & Docgen* — Define inputs, outputs, and config once in [Zod](https://zod.dev): argsbarg validates with them, infers handler types via `command`, and emits JSON Schema for MCP, OpenAPI, and help — no codegen step. Easily export standard-compliant API documentation, full CLI reference markdown, and OpenAPI 3.1 definitions directly from your code (`docs --save` command) using introspection.

*Production REST Server* — Instantly expose your commands as HTTP REST endpoints (`POST /v1/some-command`) with built-in Kubernetes-compliant `/health/liveness` and `/health/readiness` probes, ECS structured JSON logging to `stderr`, and auto-generated OpenAPI 3.1 specs with an interactive Swagger UI.

*First-Class Homebrew Distribution* — Exposes robust native support for packaging and distributing compiled binaries and shell completions cleanly via a standard tap-from-repo Homebrew model. Includes built-in completion script generators (`completion bash`/`zsh`/`fish`) consumed by Homebrew's standard `generate_completions_from_executable` command out of the box, ensuring friction-free installations and updates for your developers.

*High-Performance & Light Footprint* — Optimized specifically for Bun. Executes TypeScript and TSX source files directly with no transpile or bundling steps required, leveraging `Bun.serve` for rapid startup and low memory usage. Ships with zero production dependencies; `zod` is the only peer.

*Beautiful* `-h` *screens* — Scoped help at any routing depth, rendered in rounded UTF-8 boxes with tables, terminal-width wrapping, and color when stdout is a TTY. Errors print in red with contextual help on stderr.

*Shell completions* — `completion bash`, `completion zsh`, and `completion fish` built-ins generate scripts consumed by Homebrew during formula `install` (`generate_completions_from_executable`). See [docs/distribution-homebrew.md](docs/distribution-homebrew.md).

Also checkout ArgsBarg for [cpp](https://github.com/bdombro/cpp-argsbarg), [nim](https://github.com/bdombro/nim-argsbarg), and [swift](https://github.com/bdombro/swift-argsbarg)!

Halps! -->
help-preview.png
[help-preview.png](docs/help-preview.png)


Sub-level Halps! -->
help-l2-preview.png
[help-l2-preview.png](docs/help-l2-preview.png)

Shell completions! -->
completions-preview.png
[completions-preview.png](docs/completions-preview.png)

Production-grade HTTP Server! -->
```sh
$ myapp http
{"@timestamp":"2026-07-29T10:23:59.094Z","message":"HTTP API listening on http://127.0.0.1:13000",...}
{"@timestamp":"2026-07-29T10:23:59.194Z","message":"GET /health/liveness","ecs.version":"8.11.0",...}
{"@timestamp":"2026-07-29T10:23:59.195Z","message":"server stopping","ecs.version":"8.11.0",...}
```

## Basic Usage

```typescript
import { argsbarg, OptionKind } from "argsbarg";

const app = argsbarg({
  description: "Tiny demo.",
  handler: async (ctx) => {
    const name = ctx.args[0] ?? "world";
    if (ctx.hasFlag("verbose")) { 
      console.log("verbose mode"); 
    }
    console.log(`hello ${name}`);
  },
  key: "helloapp",
  options: [
    {
      name: "verbose",
      description: "Enable extra logging.",
      kind: OptionKind.Presence,
      shortName: "v",
    },
  ],
  positionals: [
    {
      name: "name",
      description: "Who to greet.",
      kind: OptionKind.String,
      argMin: 0,
      argMax: 1,
    },
  ],
  version: "1.0.0",
});

await app.run();
```

`app.run()` parses `process.argv`, prints help or errors, dispatches the command handler, and **exits the process**.

## What is it?

Everything you need for a first-class CLI:

- **Nested subcommands** (command group nodes with `commands`, command nodes with `handler`)
- **POSIX-style options** (`-x`, `--long`, `--long=value`) — kinds: presence, string, number, **enum** (`choices` array)
- **Bundled presence flags** (`-abc`)
- **Positional arguments and varargs tails** (`CommandPositional` objects on `positionals`)
- **Scoped help** at any routing depth (`-h` / `--help`)
- **Default-command fallback** (`FallbackMode`)
- **Option separator** (`--` to stop option parsing)
- **Rich help**: rounded UTF-8 boxes, tables, terminal width detection (`process.stdout.columns`), colors when stdout/stderr is a TTY
- **TypeScript-native**: Typed option accessors (`ctx.typedOpt<T>`) and `async/await` handler support.

## Getting Started

You can either quickly bootstrap a complete, feature-rich project skeleton using our CLI creator or manually integrate ArgsBarg into an existing codebase.

### Option A: Bootstrap a New Project (Recommended)

ArgsBarg provides an interactive project generator to scaffold a new repository fully equipped with TypeScript, Biome, Zod schemas, automated docgen, standard testing, and Homebrew integration rules:

```bash
# Interactive setup (prompts for naming and git configurations)
bun x argsbarg@latest create my-app

# Non-interactive / Headless setup
bun x argsbarg@latest create my-app --template cli --release-repo org/my-cli --yes
```

Edit `scripts/create-identity.ts` in the new repository to set your description. The `create` command copies the full-featured template, runs `bun install`, bootstraps a git repository (if standalone), and runs initial validation tests.

#### What the bootstrapped template includes:

| Area                  | Files / wiring                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------- |
| All built-ins          | `completion`, `version`, `configure`, `docs`, `mcp`, `http`, `configure get`/`set`       |
| Zod schemas           | `src/commands/<name>/types.ts` → `export const X = z.strictObject({…})` + `z.infer` type   |
| `outputSchema`        | `src/commands/status/types.ts` → `StatusJsonOutput`, wired with `command`              |
| Command layout        | `src/commands/<name>/command.ts`; registration in `src/app.ts`                       |
| MCP doc topics        | `docs.topics` auto-exposed as `<key>://docs/<topic>` resources when docs + MCP enabled   |
| Package import        | `from "argsbarg"` (not relative to argsbarg `src/`)                                      |
| Homebrew distribution | `scripts/formula-shared.ts`, `scripts/dev-formula.ts`, `Formula/`, `justfile`            |
| Dev tooling           | Biome (`just format` / `just lint`), TypeScript, colocated tests                         |
| Agent instructions    | `AGENTS.md`, `CLAUDE.md` (`@AGENTS.md`)                                                 |

*Tip: Verify an existing tree or template setup with `bun x argsbarg create --check .`*

### Option B: Manual Installation (For Existing Projects)

To manually integrate ArgsBarg into your existing Bun application: `bun add argsbarg`.


## Built-in Commands

ArgsBarg automatically integrates several core features into your application. These are divided into stable core capabilities and optional experimental integrations:

### Core Capabilities (Stable)

- `-h` / `--help` — Highly-formatted, terminal-width scoped help at any routing depth. Rounded UTF-8 boxes in TTY; unboxed plain text with in-band YAML input and output schemas in non-TTY for zero-drift agent discovery.
- `version` — Print the program's version (e.g., `myapp version`).
- `http` — Launch the high-performance HTTP REST server (injected when `httpServer.enabled` is `true`).
- `completion bash` / `zsh` / `fish` — Generate shell completion scripts to stdout for deployment and packaging.
- `docs` — Print bundled markdown topics, schema JSON, or CLI reference markdown (`myapp docs cli`, `myapp docs cli-schema`, etc.). Enabled by default; see [docs/bundled-docs.md](docs/bundled-docs.md).
- `configure get` / `set` — Query and update application-level configurations non-interactively (active when `appConfig` contains configuration schema entries).

### Experimental Integrations (Opt-in)

- `mcp` — Run as a Model Context Protocol stdio-based agent server (injected when `mcpServer.enabled` is `true`). See [docs/mcp.md](docs/mcp.md).
- `configure` (`install` / `uninstall` / `status`) — Agent artifact setup (enabled by default; opt out with `configure: { enabled: false }`). See [docs/configure.md](docs/configure.md).

Do not declare top-level commands named `completion`, `version`, or `docs` as they are reserved by default. If their respective features are enabled, `http`, `mcp`, and `configure` are also reserved.

## HTTP REST Server

By opting in with `httpServer: { enabled: true }` on your app root, running your app with the `http` subcommand launches a high-performance HTTP REST server powered natively by `Bun.serve`. This is ideal for sidecars, microservices, and micro-container deployments (such as in Kubernetes).

Nested command paths map directly to standard REST paths (e.g., `v1 invoices render` maps to `POST /v1/invoices/render`).

```typescript
const app = argsbarg({
  commands: [/* ... */],
  description: "My service.",
  httpServer: { enabled: true, port: 3000 },
  key: "myapp",
  version: "1.0.0",
});
```

```bash
myapp http --port 3000
```



### Key HTTP Features:

- **Built-in Health Checks** — Automatic `/health/liveness` (responds 200 when online) and `/health/readiness` (responds 200 when online and config validation passes) probes out of the box, compliant with container orchestrators.
- **OpenAPI 3.1 Spec & Swagger UI** — Serves standard `/openapi.json` and a `/swagger` interactive API browser generated directly from your command schema and JSDoc metadata.
- **Pre-Handler Schema Validation** — Incoming request payloads are validated against the compile-time JSON Schema (`inputSchema`) on commands with a handler before your handler ever runs.
- **ECS Structured Logging** — Access and error logs are automatically structured as Elastic Common Schema (ECS) JSON objects and written to `stderr` (e.g., for Datadog or ELK collection).
- **W3C Distributed Tracing** — Automatically parses, propagates, and echoes `traceparent` headers for distributed tracing pipelines.

See **[docs/http-server.md](docs/http-server.md)** for details on endpoints and response shapes, and **[docs/logging.md](docs/logging.md)** for log configurations.

## Distribution & Packaging (Homebrew)

ArgsBarg is built to distribute the compiled binary and shell completions cleanly through Homebrew via a standard **tap-from-repo** model.

### Installation & Post-Install Setup:

```bash
brew tap <org>/<repo> git@github.com:<org>/<repo>.git
brew install <tap>/myapp
```

During installation, Homebrew registers the built-in generated shell completions automatically via `generate_completions_from_executable` (see [docs/distribution-homebrew.md](docs/distribution-homebrew.md)).

### Shell Completions:

Completion scripts can also be output directly at any time for manual setups or formula auditing:

```bash
myapp completion bash
myapp completion zsh
myapp completion fish
```



## How it works

1. Build the app with `argsbarg({ … })` and each command with `command({ … })`: `key` is the app name, `commands` are top-level subcommands, `options` are global flags. A command group root must not set `handler` or declare `positionals` (validated at startup). A command root may set `handler` and `positionals` directly. Use `fallbackCommand` / `fallbackMode` on any **command group** for default subcommand routing (not root-only).
2. Call `await app.run()` — validates, parses argv, renders help or errors, invokes the command handler, and `process.exit`s with status **0** on success, **1** on implicit help or error (explicit `--help` → **0**).
3. From a handler, `cliErrWithHelp(ctx, "message")` prints a red error line plus contextual help on stderr and exits **1** (CLI only; API/MCP invocations throw a plain `Error`).



### Fallback modes (`FallbackMode`)


| Mode               | Empty argv         | Unknown first token                                  |
| ------------------ | ------------------ | ---------------------------------------------------- |
| `MissingOnly`      | Default command    | Error                                                |
| `MissingOrUnknown` | Default command    | Default command (token becomes argv for the default) |
| `UnknownOnly`      | Root help (exit 1) | Default command                                      |


With `MissingOrUnknown` / `UnknownOnly`, unrecognized flags at the **current command group** stop option consumption and the remainder is passed to the default command.

Set `fallbackCommand` / `fallbackMode` on nested command groups too — e.g. `docs` with `fallbackCommand: "guide"` routes `myapp docs` to the guide command without requiring a root-level default.

### Positionals (help labels)

Add `CommandPositional` entries to the command’s `positionals` list (separate from `CommandOption` flags). With `argMax: 0`, the tail accepts at least `argMin` tokens and has no upper bound unless you set `argMax` > 0.


| Fields                                                           | Label    |
| ---------------------------------------------------------------- | -------- |
| omit `argMin` / `argMax` (defaults `1` / `1`, one required word) | `<n>`    |
| `argMin: 0`, `argMax: 1`                                         | `[n]`    |
| `argMin: 0`, `argMax: 0`                                         | `[n...]` |
| `argMin: 1`, `argMax: 0`                                         | `<n...>` |




### Reading values (`CommandContext`)

- `ctx.flag("verbose")` / `ctx.hasFlag("verbose")` — presence options (`boolean`).
- `ctx.stringOpt("name")` / `ctx.numberOpt("count")` — `string | undefined` / `number | null`.
- `ctx.durationOpt("timeout")` — duration options (`format: ValueFormat.Duration`) as milliseconds.
- `ctx.commaListOpt("services")` — comma-list options as `string[] | undefined`.
- `ctx.dateOpt("on")` / `ctx.dateTimeOpt("since")` — ISO date / date-time options.
- `ctx.inputs` — coerced option and positional values for the current command; when `inputSchema` is set, validated before the handler runs and cached on `ctx`.
- `command({ inputSchema, handler })` — `ctx.inputs` typed from the command's Zod `inputSchema` (parsed output, defaults applied).
- `ctx.jsonOpt(name)` — parsed Json option (flag, preloaded stdin, or MCP/HTTP `toolArgs`).
- `ctx.typedOpt<T>("custom", parseFn)` — custom parsing for type-safe option resolution.
- `ctx.args` — positional words in order as `string[]`.
- `ctx.positional("name")` — named positional lookup; varargs slots return `string[]`, single slots return `string | undefined`.
- `ctx.spec` — app root (`Program`) for contextual help.



### Capabilities (built-ins)

`completion`, `version`, `configure`, `mcp`, and `http` are not part of your schema — they are injected at runtime from app-level config (`mcpServer`, `httpServer`, `configure`, `docs`). Reserved command names: `completion` and `version` always; `configure` unless `configure.enabled: false`; `docs` unless `docs.enabled: false` (default on); `mcp` when `mcpServer.enabled` is `true`; `http` when `httpServer.enabled` is `true`.

## Examples

Check the `examples/` directory for full working scripts:


| Example               | File                     | Shows                                                                                             |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `ArgsBargMinimal`     | `examples/minimal.ts`    | Smallest embeddable CLI (not a copy template).                                                    |
| `ArgsBargNested`      | `examples/nested.ts`     | Nested command tree, positional tails, async handlers.                                            |
| `ArgsBargFormats`     | `examples/formats.ts`    | `ValueFormat`, `default`, `ctx.inputs`.                                                        |
| `cli` template        | `examples/cli/`          | **Default copy template:** all builtins, Homebrew justfile; options/flags only (no schemas).        |
| `api` template        | `examples/api/`          | **Schema-first copy template:** Zod `inputSchema`/`outputSchema` via `command`, REST CRUD, SQLite. |
| `agent-plugin` template | `examples/agent-plugin/` | **Agent plugin copy template:** Claude Code / Cursor marketplace plugin with a committed Node bundle. |


Examples ship in the npm package under `node_modules/argsbarg/examples/`.

## Bootstrap a new CLI

Copy a shipped template into a new directory (`cli` default, `api` for schema-first, or `agent-plugin`):

Interactive (TTY) — pick a template (A/B/C), then key and release repo:

```bash
bun x argsbarg@latest create my-cli
```

Non-interactive:

```bash
bun x argsbarg@latest create my-cli \
  --template cli \
  --key my-cli --release-repo org/my-cli --yes
```

Schema-first (Zod schemas, `command`, REST CRUD demo):

```bash
bun x argsbarg@latest create my-api \
  --template api \
  --key my-api --release-repo org/my-api --yes
```

Edit `scripts/create-identity.ts` in the new repo to set `desc` (used by `description` and the Homebrew formula).

`create` copies the template (including `AGENTS.md` and `CLAUDE.md`), substitutes `{key}` / `{tap}` / `{releaseRepo}` placeholders, runs `bun install`, `bun test`, and `git init` + Initial commit when appropriate.

**Git bootstrap:** skipped when the target already has a `.git` directory, or when the target sits inside an existing git work tree (monorepo subfolder). Standalone new directories get an `Initial commit`.

Verify an existing tree: `bun x argsbarg create --check .`

To refresh agent instructions in an existing consumer: `bun scripts/merge-agents-md.ts .` from an argsbarg checkout (or pass the npm package path to the template).

### What the copy templates include

Both templates ship all builtins (`completion`, `version`, `configure`, `docs`, `mcp`, `http`), Homebrew `justfile` + formula scripts, and `AGENTS.md` + `CLAUDE.md`.

| Template | Path | Adds beyond builtins |
| --- | --- | --- |
| **cli** (default) | `examples/cli/` | `echo`, `status` — options/flags only; no schemas |
| **json** | `examples/api/` | Zod `inputSchema`/`outputSchema` (`command`), `render-json`, `shape-area`, `workspaces` REST CRUD, in-memory SQLite |

Package import: `from "argsbarg"` (not relative to argsbarg `src/`).

```bash
export PATH="$PATH:$(pwd)/examples"

eval "$(minimal.ts completion zsh)"
minimal.ts --help
minimal.ts hello --name world

eval "$(nested.ts completion zsh)"
nested.ts stat owner lookup -u alice ./README.md
nested.ts read ./README.md

bun ./examples/formats.ts run --tags demo,docs --on 2026-06-22

cd examples/cli && just setup
just run status --json
```



## [Experimental] AI Agent & Copilot Integrations

ArgsBarg includes optional experimental features designed to make your CLI and services easily discoverable and executable by modern developer AI agents (such as Cursor, Claude Code, and standard MCP clients). These are entirely opt-in and do not affect the footprint, performance, or stability of the core CLI and HTTP layers.

### 1. Model Context Protocol (MCP) Server

Opt in by setting `mcpServer: { enabled: true }` on your app root. Running `myapp mcp` starts a JSON-RPC 2.0 stdio server.

- **Automatic Tool Exposure** — Every command with a handler in your CLI tree becomes an executable MCP tool with inputs automatically generated from your CLI options.
- **Documentation Resources** — Your CLI structure, JSON schemas, and bundled `docs.topics` are automatically exposed to agents as resources (e.g., `<key>://schema`).
- **Context-Aware Invocations** — Handlers can read `ctx.invocation` to distinguish between direct CLI, HTTP requests, or headless MCP calls.

See **[docs/mcp.md](docs/mcp.md)** for configuration, env bootstrapping, custom resources, Cursor/Claude setup, and protocol details.

### 2. Agent instructions (`AGENTS.md`)

ArgsBarg ships authoring docs under `node_modules/argsbarg/docs/`. Because AI agents do not automatically read inside `node_modules/`, each copy template includes an `AGENTS.md` with inlined argsbarg authoring rules and a `CLAUDE.md` bridge (`@AGENTS.md`).

```bash
bun scripts/merge-agents-md.ts .
```

This refreshes the argsbarg-managed section at the top of `AGENTS.md` while preserving all app-specific sections below it. See **Agent instructions** in [docs/cli-program.md](docs/cli-program.md).

### 3. Agent Skills & Workspace Configuration

ArgsBarg CLIs adopt the open repository skill convention (`skills/<app>/SKILL.md`) per the standard at https://dotagentsprotocol.com/. Scaffolding via `argsbarg create` copies an initial `SKILL.md` template directing agents to run `<subcommand> --help` for just-in-time option discovery. Running `myapp configure install` registers your MCP server in `~/.agents/mcp.json` and bootstraps app configuration.

See **[docs/configure.md](docs/configure.md)** and **[docs/ai-skills.md](docs/ai-skills.md)** for developer setup and automated Homebrew pipeline integration.

---



## Public API overview

The package root (`argsbarg` / `src/index.ts`) exports the types and runtime you need to define a schema and run it. Parsing, completion script generation, help rendering, and schema pre-validation live in other modules under `src/` for tests and advanced integrations.


| Symbol                                                            | Role                                                                                                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Program`, `CommandOption`, `CommandPositional`                        | Schema types.                                                                                                                                  |
| `program`, `command`, `RunnableCommand`, `CommandGroup`, `Command`  | Program/command helpers (infer `ctx.inputs`, `ctx.pathParams`, and returns) and command-tree types.                                               |
| `OptionKind`, `ValueFormat`, `FallbackMode`              | Option kinds, value formats (`duration`, `comma-list`, `date`, `date-time`), and root fallback behavior.                                       |
| `SchemaValidationError`                                        | Thrown when the static command tree violates schema rules.                                                                                     |
| `CommandContext`                                                      | Handler context (`ctx.hasFlag`, `ctx.stringOpt`, `ctx.durationOpt`, `ctx.inputs`, `ctx.invocation`, …).                                        |
| `CommandInputs`                                                   | Record type returned by `ctx.inputs` — coerced option/positional values keyed by schema name.                                                  |
| `App`                                                             | Runtime: validate + freeze program, `run()`, `invoke()`, `serveMcp()`, `appConfig` getter, `exportCommandSchema()`, `exportAppConfigSchema()`. |
| `InvokeResult`, `InvokeKind`                                | Result types from `cli.invoke()`.                                                                                                              |
| `AppConfig`, `AppConfigEntry`                               | App config block on the app root (`entries` metadata overlay + optional Zod `schema`).                                                      |
| `cliErrWithHelp(ctx, msg)`                                        | Print error + scoped help on stderr, exit 1.                                                                                                   |
| `parseDurationMs`, `parseCommaList`, `parseDate`, `parseDateTime` | Optional format parsers for use outside handlers.                                                                                              |


Reserved identifiers (validated at startup): root commands `completion`, `version`, `configure`, `docs` (unless `docs.enabled: false`), `mcp` (when `mcpServer.enabled` is `true`), and `http` (when `httpServer.enabled` is `true`).

---



## License

MIT
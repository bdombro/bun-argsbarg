Logo



[GitHub](https://github.com/bdombro/bun-argsbarg)
[License: MIT](LICENSE)
[npm version](https://www.npmjs.com/package/argsbarg)
[Bun](https://bun.sh)

Build beautiful, well-behaved CLI+MCP apps with Bun — **no third-party runtime dependencies**. 

Why another CLI parser?

*Schema-first* — define your entire CLI’s structure, commands, options, and help in a single, explicit data model, making the command-line interface auto-validated, centralized, clear, and self-describing upfront.

*AI Friendly* — Generate and install rich skills, mcp server, docs based on the schema.

*Beautiful* `-h` *screens* — scoped help at any routing depth, rendered in rounded UTF-8 boxes with tables, terminal-width wrapping, and color when stdout is a TTY. Errors print in red with contextual help on stderr.

*Shell completions* — `completion bash`, `completion zsh`, and `completion fish` built-ins generate scripts consumed by Homebrew during formula `install` (`generate_completions_from_executable`). See [docs/distribution-homebrew.md](docs/distribution-homebrew.md).

*Bun-optimized* — built from the ground up for Bun and TypeScript, leveraging Bun’s performance and modern JavaScript features without any extra dependencies.

Also checkout ArgsBarg for [cpp](https://github.com/bdombro/cpp-argsbarg), [nim](https://github.com/bdombro/nim-argsbarg), and [swift](https://github.com/bdombro/swift-argsbarg)!

Halps! -->
help-preview.png

Sub-level Halps! -->
help-l2-preview.png

Shell completions! -->
completions-preview.png

## Usage

```typescript
import { Cli, type CliProgram, CliOptionKind } from "argsbarg";

const program = {
  key: "helloapp",
  version: "1.0.0",
  description: "Tiny demo.",
  positionals: [
    {
      name: "name",
      description: "Who to greet.",
      kind: CliOptionKind.String,
      argMin: 0,
      argMax: 1,
    },
  ],
  options: [
    {
      name: "verbose",
      description: "Enable extra logging.",
      kind: CliOptionKind.Presence,
      shortName: "v",
    },
  ],
  handler: async (ctx) => {
    const name = ctx.args[0] ?? "world";
    if (ctx.hasFlag("verbose")) { 
      console.log("verbose mode"); 
    }
    console.log(`hello ${name}`);
  },
} satisfies CliProgram;

const cli = new Cli(program);
await cli.run();
```

`Cli.run()` parses `process.argv`, prints help or errors, dispatches the leaf handler, and **exits the process**.

## What is it?

Everything you need for a first-class CLI:

- **Nested subcommands** (router nodes with `commands`, leaf nodes with `handler`)
- **POSIX-style options** (`-x`, `--long`, `--long=value`) — kinds: presence, string, number, **enum** (`choices` array)
- **Bundled presence flags** (`-abc`)
- **Positional arguments and varargs tails** (`CliPositional` objects on `positionals`)
- **Scoped help** at any routing depth (`-h` / `--help`)
- **Default-command fallback** (`CliFallbackMode`)
- **Option separator** (`--` to stop option parsing)
- **Rich help**: rounded UTF-8 boxes, tables, terminal width detection (`process.stdout.columns`), colors when stdout/stderr is a TTY
- **TypeScript-native**: Typed option accessors (`ctx.typedOpt<T>`) and `async/await` handler support.



## Built-ins

Every app gets:

- `-h` / `--help` at any routing depth (scoped help).
- `completion bash` **/** `completion zsh` **/** `completion fish` — print shell completion scripts to stdout (injected by `Cli.run()`).
- `version` — print `CliProgram.version` (`myapp version`).
- `mcp` — when `mcpServer.enabled` is `true`, run as an MCP stdio server (`myapp mcp`).
- `docs` — when `docs.enabled` is `true`, print bundled markdown topics, schema JSON, API markdown, and generated skill content (`myapp docs`, `myapp docs readme`, `myapp docs schema`, `myapp docs api`, `myapp docs skill`, …). See [docs/bundled-docs.md](docs/bundled-docs.md).
- `configure` — manage agent skills, MCP config, and app config (`myapp configure --sync --yes` after Homebrew install). See [docs/configure.md](docs/configure.md).

Do not declare a top-level command named `completion`, `version`, or `configure` — they are reserved.
When `mcpServer.enabled` is `true`, do not declare a top-level command named `mcp` — it is reserved for the MCP built-in.
When `docs.enabled` is `true`, do not declare a top-level command named `docs` — it is reserved for the docs built-in.

### MCP (AI agents)

Opt in on the program root with `mcpServer: { enabled: true }`, then run `myapp mcp` for a stdio MCP server. Each leaf command becomes a tool; the CLI tree is available as resource `<sanitized-key>://schema` (same as `myapp docs schema`). Handlers can read `ctx.invocation`; use `cli.invoke(argv)` for headless testing.

See **[docs/mcp.md](docs/mcp.md)** for configuration, env bootstrapping, custom resources, Cursor setup, and protocol details. See **[docs/cli-program.md](docs/cli-program.md)** for schema authoring (consumer apps: run `bunx argsbarg create` or refresh with `bun scripts/merge-cli-program-rule.ts .` from the argsbarg package).

### Configure CLI

Ship via **Homebrew** (tap-from-repo). The formula installs the binary and shell completions; `post_install` runs agent artifact refresh. Private taps need `HOMEBREW_GITHUB_API_TOKEN` on install — see [docs/distribution-homebrew.md](docs/distribution-homebrew.md#end-user-install).

```bash
brew tap <org>/<repo> git@github.com:<org>/<repo>.git
HOMEBREW_GITHUB_API_TOKEN="$(gh auth token)" brew install <tap>/myapp
myapp configure    # interactive per-target setup; opt-in app config wizard
```

See **[docs/distribution-homebrew.md](docs/distribution-homebrew.md)** for formula patterns and `bunx argsbarg create`. See **[docs/configure.md](docs/configure.md)** for `configure`, `--sync`, `--remove-all`, and `--status`.

### Shell completions

Homebrew installs completion scripts during `brew install` via `generate_completions_from_executable`. The CLI still exposes generation for formula authors:

```bash
myapp completion bash
myapp completion zsh
myapp completion fish
```

Users configure their shell per [Homebrew Shell Completion](https://docs.brew.sh/Shell-Completion).

## Quick Start

```bash
bun add argsbarg
```



### Cursor / AI agents

Argsbarg ships authoring docs in `node_modules/argsbarg/docs/`. Agents do not load them unless your repo points there — copy the thin Cursor rule after install (it tells agents to **read** `cli-program.md`, not duplicate it):

```bash
mkdir -p .cursor/rules
mkdir -p .cursor/rules
bun scripts/merge-cli-program-rule.ts . \
  node_modules/argsbarg/examples/full-example/.cursor/rules/cli-program.mdc
```

Add app-specific conventions in a second rule if needed. Copy the rule from the template, then add a `**<your-app> conventions:**` block at the bottom (see **Cursor rule** in [docs/cli-program.md](docs/cli-program.md)). Documentation map: **[docs/README.md](docs/README.md)**.

## How it works

1. Build a **program root** with `satisfies CliProgram` (or `: CliProgram`): `key` is the app name, `commands` are top-level subcommands, `options` are global flags. A router root must not set `handler` or declare `positionals` (validated at startup). A leaf root may set `handler` and `positionals` directly. Use `fallbackCommand` / `fallbackMode` on any **routing node** for default subcommand routing (not root-only).
2. Call `await new Cli(program).run()` — validates, parses argv, renders help or errors, invokes the leaf handler, and `process.exit`s with status **0** on success, **1** on implicit help or error (explicit `--help` → **0**).
3. From a handler, `cliErrWithHelp(ctx, "message")` prints a red error line plus contextual help on stderr and exits **1**.



### Fallback modes (`CliFallbackMode`)


| Mode               | Empty argv         | Unknown first token                                  |
| ------------------ | ------------------ | ---------------------------------------------------- |
| `MissingOnly`      | Default command    | Error                                                |
| `MissingOrUnknown` | Default command    | Default command (token becomes argv for the default) |
| `UnknownOnly`      | Root help (exit 1) | Default command                                      |


With `MissingOrUnknown` / `UnknownOnly`, unrecognized flags at the **current routing node** stop option consumption and the remainder is passed to the default command.

Set `fallbackCommand` / `fallbackMode` on nested routers too — e.g. `docs` with `fallbackCommand: "guide"` routes `myapp docs` to the guide leaf without requiring a root-level default.

### Positionals (help labels)

Add `CliPositional` entries to the command’s `positionals` list (separate from `CliOption` flags). With `argMax: 0`, the tail accepts at least `argMin` tokens and has no upper bound unless you set `argMax` > 0.


| Fields                                                           | Label    |
| ---------------------------------------------------------------- | -------- |
| omit `argMin` / `argMax` (defaults `1` / `1`, one required word) | `<n>`    |
| `argMin: 0`, `argMax: 1`                                         | `[n]`    |
| `argMin: 0`, `argMax: 0`                                         | `[n...]` |
| `argMin: 1`, `argMax: 0`                                         | `<n...>` |




### Reading values (`CliContext`)

- `ctx.flag("verbose")` / `ctx.hasFlag("verbose")` — presence options (`boolean`).
- `ctx.stringOpt("name")` / `ctx.numberOpt("count")` — `string | undefined` / `number | null`.
- `ctx.durationOpt("timeout")` — duration options (`format: CliValueFormat.Duration`) as milliseconds.
- `ctx.commaListOpt("services")` — comma-list options as `string[] | undefined`.
- `ctx.dateOpt("on")` / `ctx.dateTimeOpt("since")` — ISO date / date-time options.
- `ctx.readLeafInputs()` — coerced option and positional values for the current leaf (schema-driven).
- `ctx.typedOpt<T>("custom", parseFn)` — custom parsing for type-safe option resolution.
- `ctx.args` — positional words in order as `string[]`.
- `ctx.positional("name")` — named positional lookup; varargs slots return `string[]`, single slots return `string | undefined`.
- `ctx.program` — program root (`CliProgram`) for contextual help.



### Capabilities (built-ins)

`completion`, `version`, `install`, and `mcp` are not part of your schema — they are injected at runtime from program-level config (`mcpServer`, `install`, `docs`). Reserved command names: `completion` and `version` always; `install` unless `install.enabled: false`; `mcp` when `mcpServer.enabled` is `true`; `docs` when `docs.enabled` is `true`.

## Examples

Check the `examples/` directory for full working scripts:


| Example               | File                     | Shows                                                                                    |
| --------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `ArgsBargMinimal`     | `examples/minimal.ts`    | String + presence flags, `MissingOrUnknown` fallback.                                    |
| `ArgsBargNested`      | `examples/nested.ts`     | Nested command tree, positional tails, async handlers.                                   |
| `ArgsBargFormats`     | `examples/formats.ts`    | `CliValueFormat`, `default`, `readLeafInputs()`.                                         |
| `ArgsBargFullExample` | `examples/full-example/` | **Copy template:** all builtins, schemagen, Homebrew justfile, `outputSchema`, `from "argsbarg"`. |


Examples ship in the npm package under `node_modules/argsbarg/examples/`.

## Bootstrap a new CLI

Copy the shipped `examples/full-example` template into a new directory:

Interactive (TTY):

```bash
bunx argsbarg create my-cli
```

Non-interactive:

```bash
bunx argsbarg create my-cli \
  --key my-cli --release-repo org/my-cli --yes
```

Edit `scripts/create-identity.ts` in the new repo to set `desc` (used by `program.description` and the Homebrew formula).

`create` copies the template (including `.cursor/rules/cli-program.mdc`), substitutes `{key}` / `{tap}` / `{releaseRepo}` placeholders in `README.md` and other files, runs `bun install`, schemagen, `bun test`, and `git init` + Initial commit when appropriate.

**Git bootstrap:** skipped when the target already has a `.git` directory, or when the target sits inside an existing git work tree (monorepo subfolder). Standalone new directories get an `Initial commit`.

Verify an existing tree: `bunx argsbarg create --check .`

To refresh the Cursor rule in an existing consumer: `bun scripts/merge-cli-program-rule.ts .` from an argsbarg checkout (or pass the npm package path to the template).

### What the full-example template includes

| Area | Files / wiring |
| --- | --- |
| All builtins | `completion`, `version`, `configure`, `docs`, `mcp`, `configure get`/`set` |
| `program.appConfig` | `src/types.ts` (`AppConfig`) → `schemas/configSchemas.ts` |
| `outputSchema` | `src/commands/status/types.ts` → `schemas/outputSchemas.ts` |
| Schemagen | `scripts/schemagen.ts` + `scripts/schemagen/discover-schema-roots.ts` |
| Command layout | `src/commands/<name>/command.ts`; registration in `src/program.ts` |
| MCP doc topics | `docs.topics` auto-exposed as `<key>://docs/<topic>` resources when docs + MCP enabled |
| Package import | `from "argsbarg"` (not relative to argsbarg `src/`) |
| Homebrew distribution | `scripts/formula-shared.ts`, `scripts/with-dev-formula.ts`, `Formula/`, `justfile` |
| Dev tooling | Biome (`just format` / `just lint`), TypeScript, colocated tests |
| Cursor rules | `.cursor/rules/cli-program.mdc`, `.cursor/rules/code.mdc` |

When changing builtins or the template, run `just check-full-example` from the argsbarg repo root.

```bash
export PATH="$PATH:$(pwd)/examples"

eval "$(minimal.ts completion zsh)"
minimal.ts --help
minimal.ts hello --name world

eval "$(nested.ts completion zsh)"
nested.ts stat owner lookup -u alice ./README.md
nested.ts read ./README.md

bun ./examples/formats.ts run --tags demo,docs --on 2026-06-22

cd examples/full-example && just setup && just schemagen
just run status --json
```



## Public API overview

The package root (`argsbarg` / `src/index.ts`) exports the types and runtime you need to define a schema and run it. Parsing, completion script generation, help rendering, and schema pre-validation live in other modules under `src/` for tests and advanced integrations.


| Symbol                                                            | Role                                                                                                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `CliProgram`, `CliOption`, `CliPositional`, `CliHandler`          | Schema and handler types.                                                                                                                      |
| `CliOptionKind`, `CliValueFormat`, `CliFallbackMode`              | Option kinds, value formats (`duration`, `comma-list`, `date`, `date-time`), and root fallback behavior.                                       |
| `CliSchemaValidationError`                                        | Thrown when the static command tree violates schema rules.                                                                                     |
| `CliContext`                                                      | Handler context (`ctx.hasFlag`, `ctx.stringOpt`, `ctx.durationOpt`, `ctx.readLeafInputs`, `ctx.invocation`, …).                                |
| `CliLeafInputs`                                                   | Record type returned by `readLeafInputs()` — coerced option/positional values keyed by schema name.                                            |
| `Cli`                                                             | Runtime: validate + freeze program, `run()`, `invoke()`, `serveMcp()`, `appConfig` getter, `exportCommandSchema()`, `exportAppConfigSchema()`. |
| `CliInvokeResult`, `CliInvokeKind`                                | Result types from `cli.invoke()`.                                                                                                              |
| `CliAppConfig`, `CliAppConfigEntry`                               | App config block on the program root (`entries` metadata overlay + optional `jsonSchema`).                                                     |
| `cliErrWithHelp(ctx, msg)`                                        | Print error + scoped help on stderr, exit 1.                                                                                                   |
| `parseDurationMs`, `parseCommaList`, `parseDate`, `parseDateTime` | Optional format parsers for use outside handlers.                                                                                              |


Reserved identifiers (validated at startup): root commands `completion`, `version`, `install`, `docs` (when `docs.enabled` is `true`), and `mcp` (when `mcpServer.enabled` is `true`).

---



## License

MIT
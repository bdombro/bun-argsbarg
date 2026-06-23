![Logo](https://github.com/bdombro/bun-argsbarg/blob/main/logo.png)
<!-- Big money NE - https://patorjk.com/software/taag/#p=testall&f=Bulbhead&t=shebangsy&x=none&v=4&h=4&w=80&we=false> -->

[![GitHub](https://img.shields.io/badge/GitHub-bdombro%2Fbun--argsbarg-181717?logo=github)](https://github.com/bdombro/bun-argsbarg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/argsbarg.svg)](https://www.npmjs.com/package/argsbarg)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?logo=bun&logoColor=white)](https://bun.sh)

Build beautiful, well-behaved CLI apps with Bun — **no third-party runtime dependencies**. 

Why another CLI parser?

*Schema-first* — define your entire CLI’s structure, commands, options, and help in a single, explicit data model, making the command-line interface centralized, clear, and self-describing upfront.

*Beautiful `-h` screens* — scoped help at any routing depth, rendered in rounded UTF-8 boxes with tables, terminal-width wrapping, and color when stdout is a TTY. Errors print in red with contextual help on stderr.

*Shell completions* — `completion bash`, `completion zsh`, and `completion fish` built-ins generate installable scripts from your schema so users get tab completion for commands, flags, and positionals without extra tooling.

*Optional MCP server* — set `mcpServer: { enabled: true }` on the program root to expose leaf commands as MCP tools and the full CLI tree as a schema resource (`myapp mcp` over stdio). See [docs/mcp.md](docs/mcp.md). Compiled binaries can install binary, completions, skills, and MCP config with `myapp install` — see [docs/install.md](docs/install.md).

*Bun-optimized* — built from the ground up for Bun and TypeScript, leveraging Bun’s performance and modern JavaScript features without any extra dependencies.

Also checkout ArgsBarg for [cpp](https://github.com/bdombro/cpp-argsbarg), [nim](https://github.com/bdombro/nim-argsbarg), and [swift](https://github.com/bdombro/swift-argsbarg)!

Halps! -->
![help-preview.png](https://github.com/bdombro/bun-argsbarg/blob/main/docs/help-preview.png)

Sub-level Halps! -->
![help-l2-preview.png](https://github.com/bdombro/bun-argsbarg/blob/main/docs/help-l2-preview.png)

Shell completions! -->
![completions-preview.png](https://github.com/bdombro/bun-argsbarg/blob/main/docs/completions-preview.png)


## Usage

```typescript
import { cliRun, type CliProgram, CliOptionKind } from "argsbarg";

const cli = {
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

await cliRun(cli);
```

`cliRun` parses `process.argv`, prints help or errors, dispatches the leaf handler, and **exits the process**.



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
- **`completion bash` / `completion zsh` / `completion fish`** — print shell completion scripts to stdout (injected by `cliRun`).
- **`version`** — print `CliProgram.version` (`myapp version`).
- **`mcp`** — when `mcpServer.enabled` is `true`, run as an MCP stdio server (`myapp mcp`).
- **`docs`** — when `docs.enabled` is `true`, print bundled markdown topics, schema JSON, API markdown, and generated skill content (`myapp docs`, `myapp docs readme`, `myapp docs schema`, `myapp docs api`, `myapp docs skill`, …). See [docs/bundled-docs.md](docs/bundled-docs.md).
- **`install`** — install the binary, completions, skills, and MCP config to the user environment (`myapp install --all --yes`). See [docs/install.md](docs/install.md).

Do not declare a top-level command named **`completion`**, **`version`**, or **`install`** — they are reserved.
When **`mcpServer.enabled`** is `true`, do not declare a top-level command named **`mcp`** — it is reserved for the MCP built-in.
When **`docs.enabled`** is `true`, do not declare a top-level command named **`docs`** — it is reserved for the docs built-in.


### MCP (AI agents)

Opt in on the program root with `mcpServer: { enabled: true }`, then run `myapp mcp` for a stdio MCP server. Each leaf command becomes a tool; the CLI tree is available as resource `<sanitized-key>://schema` (same as `myapp docs schema`). Handlers can read `ctx.invocation` and use `cliInvoke` for headless testing.

See **[docs/mcp.md](docs/mcp.md)** for configuration, env bootstrapping, custom resources, Cursor setup, and protocol details. See **[docs/cli-program.md](docs/cli-program.md)** for schema authoring (consumer apps: copy **`docs/templates/cursor/rules/cli-program.mdc`** to **`.cursor/rules/cli-program.mdc`**).

### Install CLI

argsbarg includes CLI features to manage installation of your compiled bun app. After `bun build --compile` (or when running via `bun`), ship your CLI and let users run:

```bash
myapp install --all --yes
```

This copies the binary to `~/.local/bin`, installs shell completions (bash/zsh/fish when each shell is on PATH), writes Cursor/Claude skills when agent directories exist, and merges MCP server entries into Cursor and Claude config files.

See **[docs/install.md](docs/install.md)** for `--reinstall`, `install --update`, `--status`, `--uninstall`, and flags.


### Shell completions

```bash
myapp completion bash > ~/.bash_completion.d/myapp
# or: source <(myapp completion bash)

myapp completion zsh > ~/.zsh/completions/_myapp   
# then: fpath+=(~/.zsh/completions); autoload -Uz compinit && compinit
# or, for a one-off test in the current shell: eval "$(myapp completion zsh)"

myapp completion fish > ~/.config/fish/completions/myapp.fish
```



## Quick Start

```bash
bun add argsbarg
```

### Cursor / AI agents

Argsbarg ships authoring docs in `node_modules/argsbarg/docs/`. Agents do not load them unless your repo points there — copy the thin Cursor rule after install (it tells agents to **read** `cli-program.md`, not duplicate it):

```bash
mkdir -p .cursor/rules
cp node_modules/argsbarg/docs/templates/cursor/rules/cli-program.mdc .cursor/rules/cli-program.mdc
```

Add app-specific conventions in a second rule if needed. Documentation map: **[docs/README.md](docs/README.md)**. Authoring guide: **[docs/cli-program.md](docs/cli-program.md)**.


## How it works

1. Build a **program root** with `satisfies CliProgram` (or `: CliProgram`): `key` is the app/binary name, `commands` are top-level subcommands, `options` are global flags. A router root must not set `handler` or declare `positionals` (validated at startup). A leaf root may set `handler` and `positionals` directly. Use `fallbackCommand` / `fallbackMode` on any **routing node** for default subcommand routing (not root-only).
2. Call `await cliRun(root)` with that root — validates, parses argv, renders help or errors, invokes the leaf handler, and `process.exit`s with status **0** on success, **1** on implicit help or error (explicit `--help` → **0**).
3. From a handler, `cliErrWithHelp(ctx, "message")` prints a red error line plus contextual help on stderr and exits **1**.

### Fallback modes (`CliFallbackMode`)

| Mode | Empty argv | Unknown first token |
| --- | --- | --- |
| `MissingOnly` | Default command | Error |
| `MissingOrUnknown` | Default command | Default command (token becomes argv for the default) |
| `UnknownOnly` | Root help (exit 1) | Default command |

With `MissingOrUnknown` / `UnknownOnly`, unrecognized flags at the **current routing node** stop option consumption and the remainder is passed to the default command.

Set `fallbackCommand` / `fallbackMode` on nested routers too — e.g. `docs` with `fallbackCommand: "guide"` routes `myapp docs` to the guide leaf without requiring a root-level default.

### Positionals (help labels)

Add `CliPositional` entries to the command’s `positionals` list (separate from `CliOption` flags). With `argMax: 0`, the tail accepts at least `argMin` tokens and has no upper bound unless you set `argMax` > 0.

| Fields | Label |
| --- | --- |
| omit `argMin` / `argMax` (defaults `1` / `1`, one required word) | `<n>` |
| `argMin: 0`, `argMax: 1` | `[n]` |
| `argMin: 0`, `argMax: 0` | `[n...]` |
| `argMin: 1`, `argMax: 0` | `<n...>` |

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

`completion`, `version`, `install`, and `mcp` are not part of your schema — they are injected at runtime from program-level config (`mcpServer`, `install`, `docs`). Reserved command names: `completion` and `version` always; `install` unless `install.enabled: false`; `mcp` when `mcpServer.enabled` is `true`; `docs` when `docs.enabled` is `true`. When `install.updateGetLatest` is set, `install --update` is available (not a separate command).



## Examples

Check the `examples/` directory for full working scripts:

| Example | File | Shows |
| --- | --- | --- |
| `ArgsBargMinimal` | `examples/minimal.ts` | String + presence flags, `MissingOrUnknown` fallback. |
| `ArgsBargNested` | `examples/nested.ts` | Nested command tree, positional tails, async handlers. |
| `ArgsBargFormats` | `examples/formats.ts` | `CliValueFormat`, `default`, `readLeafInputs()`. |

```bash
export PATH="$PATH:$(pwd)/examples"

eval "$(minimal.ts completion zsh)"
minimal.ts --help
minimal.ts hello --name world

eval "$(nested.ts completion zsh)"
nested.ts stat owner lookup -u alice ./README.md
nested.ts read ./README.md

bun ./examples/formats.ts run --tags demo,docs --on 2026-06-22
```



## Public API overview

The package root (`argsbarg` / `src/index.ts`) exports the types and runtime you need to define a schema and run it. Parsing, completion script generation, help rendering, and schema pre-validation live in other modules under `src/` for tests and advanced integrations.

| Symbol | Role |
| --- | --- |
| `CliProgram`, `CliOption`, `CliPositional`, `CliHandler` | Schema and handler types. |
| `CliOptionKind`, `CliValueFormat`, `CliFallbackMode` | Option kinds, value formats (`duration`, `comma-list`, `date`, `date-time`), and root fallback behavior. |
| `CliSchemaValidationError` | Thrown when the static command tree violates schema rules. |
| `CliContext` | Handler context (`ctx.hasFlag`, `ctx.stringOpt`, `ctx.durationOpt`, `ctx.readLeafInputs`, `ctx.invocation`, …). |
| `CliLeafInputs` | Record type returned by `readLeafInputs()` — coerced option/positional values keyed by schema name. |
| `cliRun(root, [argv])` | Validate, parse argv, dispatch, exit. |
| `cliInvoke(root, argv)` | Parse and dispatch without exiting; returns captured stdout/stderr. |
| `cliErrWithHelp(ctx, msg)` | Print error + scoped help on stderr, exit 1. |
| `parseDurationMs`, `parseCommaList`, `parseDate`, `parseDateTime` | Optional format parsers for use outside handlers. |

Reserved identifiers (validated at startup): root commands **`completion`**, **`version`**, **`install`**, **`docs`** (when `docs.enabled` is `true`), and **`mcp`** (when `mcpServer.enabled` is `true`).

---

## License

MIT

![Logo](https://github.com/bdombro/bun-argsbarg/blob/main/logo.png)
<!-- Big money NE - https://patorjk.com/software/taag/#p=testall&f=Bulbhead&t=shebangsy&x=none&v=4&h=4&w=80&we=false> -->

[![GitHub](https://img.shields.io/badge/GitHub-bdombro%2Fbun--argsbarg-181717?logo=github)](https://github.com/bdombro/bun-argsbarg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/argsbarg.svg)](https://www.npmjs.com/package/argsbarg)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?logo=bun&logoColor=white)](https://bun.sh)

Build beautiful, well-behaved CLI apps with Bun — **no third-party runtime dependencies**. 

Why another CLI parser?

*Schema-first* -- define your entire CLI’s structure, commands, options, and help in a single, explicit data model, making the command-line interface centralized, clear, and self-describing upfront.

*Bun-optimized* -- built from the ground up for Bun and TypeScript, leveraging Bun’s performance and modern JavaScript features without any extra dependencies.

Also checkout ArgsBarg for [cpp](https://github.com/bdombro/cpp-argsbarg), [nim](https://github.com/bdombro/nim-argsbarg), and [swift](https://github.com/bdombro/swift-argsbarg)!

Halps! -->
![help-preview.png](https://github.com/bdombro/bun-argsbarg/blob/main/docs/help-preview.png)

Sub-level Halps! -->
![help-l2-preview.png](https://github.com/bdombro/bun-argsbarg/blob/main/docs/help-l2-preview.png)

Shell completions! -->
![completions-preview.png](https://github.com/bdombro/bun-argsbarg/blob/main/docs/completions-preview.png)


## Usage

```typescript
import { cliRun, CliCommand, CliOptionKind } from "argsbarg";

const cli: CliCommand = {
  key: "helloapp",
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
};

await cliRun(cli);
```

`cliRun` parses `process.argv`, prints help or errors, dispatches the leaf handler, and **exits the process**.



## What is it?

Everything you need for a first-class CLI:

- **Nested subcommands** (`CliCommand` with `commands` for groups, `handler` for leaves)
- **POSIX-style options** (`-x`, `--long`, `--long=value`)
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
- **`completion bash` / `completion zsh`** — print shell completion scripts to stdout (injected by `cliRun`).

Do not declare a top-level command named **`completion`** — it is reserved for this built-in.


### Shell completions

```bash
myapp completion bash > ~/.bash_completion.d/myapp
# or: source <(myapp completion bash)

myapp completion zsh > ~/.zsh/completions/_myapp   
# then: fpath+=(~/.zsh/completions); autoload -Uz compinit && compinit
# or, for a one-off test in the current shell: eval "$(myapp completion zsh)"
```



## Install

```bash
bun add bun-argsbarg
```


## How it works

1. Build a **program root** `CliCommand` using pure TypeScript objects: `key` is the app/binary name, `commands` are top-level subcommands, `options` are global flags. The root must not set `handler` or declare `positionals` (validated at startup). Use `fallbackCommand` / `fallbackMode` on the root only for default top-level routing.
2. Call `await cliRun(root)` with that root — validates, parses argv, renders help or errors, invokes the leaf handler, and `process.exit`s with status **0** on success, **1** on implicit help or error (explicit `--help` → **0**).
3. From a handler, `cliErrWithHelp(ctx, "message")` prints a red error line plus contextual help on stderr and exits **1**.

### Fallback modes (`CliFallbackMode`)

| Mode | Empty argv | Unknown first token |
| --- | --- | --- |
| `MissingOnly` | Default command | Error |
| `MissingOrUnknown` | Default command | Default command (token becomes argv for the default) |
| `UnknownOnly` | Root help (exit 1) | Default command |

With `MissingOrUnknown` / `UnknownOnly`, unrecognized **root** flags stop root-flag consumption and the remainder is passed to the default command.

### Positionals (help labels)

Add `CliPositional` entries to the command’s `positionals` list (separate from `CliOption` flags). With `argMax: 0`, the tail accepts at least `argMin` tokens and has no upper bound unless you set `argMax` > 0.

| Fields | Label |
| --- | --- |
| omit `argMin` / `argMax` (defaults `1` / `1`, one required word) | `<n>` |
| `argMin: 0`, `argMax: 1` | `[n]` |
| `argMin: 0`, `argMax: 0` | `[n...]` |
| `argMin: 1`, `argMax: 0` | `<n...>` |

### Reading values (`CliContext`)

- `ctx.flag("verbose")` — presence options (`boolean`).
- `ctx.stringOpt("name")` / `ctx.numberOpt("count")` — `string | undefined` / `number | null`.
- `ctx.typedOpt<T>("custom", parseFn)` — pass a custom parsing function for type-safe option resolution.
- `ctx.args` — positional words in order as `string[]`.
- `ctx.schema` — merged program root (`CliCommand`) for contextual help.



## Examples

Check the `examples/` directory for full working scripts:

| Example | File | Shows |
| --- | --- | --- |
| `ArgsBargMinimal` | `examples/minimal.ts` | String + presence flags, `MissingOrUnknown` fallback. |
| `ArgsBargNested` | `examples/nested.ts` | Nested `CliCommand` tree, positional tails, async handlers. |

```bash
export PATH="$PATH:$(pwd)/examples"

eval "$(minimal.ts completion zsh)"
minimal.ts --help
minimal.ts hello --name world

eval "$(nested.ts completion zsh)"
nested.ts stat owner lookup -u alice ./README.md
nested.ts read ./README.md
```



## Public API overview

The package root (`argsbarg` / `src/index.ts`) exports the types and runtime you need to define a schema and run it. Parsing, completion script generation, help rendering, and schema pre-validation live in other modules under `src/` for tests and advanced integrations.

| Symbol | Role |
| --- | --- |
| `CliCommand`, `CliOption`, `CliPositional`, `CliHandler` | Schema and handler types. |
| `CliOptionKind`, `CliFallbackMode` | Option kinds and root fallback behavior. |
| `CliSchemaValidationError` | Thrown when the static command tree violates schema rules. |
| `CliContext` | Handler context (`ctx.flag`, `ctx.stringOpt`, `ctx.args`, …). |
| `cliRun(root, [argv])` | Validate, parse argv, dispatch, exit. |
| `cliErrWithHelp(ctx, msg)` | Print error + scoped help on stderr, exit 1. |

Reserved identifier (validated at startup): root command **`completion`**.

---

## License

MIT

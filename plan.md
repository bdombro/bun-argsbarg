# bun-argsbarg Plan

## Plan: bun-argsbarg — Bun CLI Argument Parser

**TL;DR**: Convert the Swift `argsbarg` declarative CLI framework into a TypeScript/Bun library with the same CLI features (schema-driven parsing, help rendering, shell completion, subcommand routing, fallback commands) while leveraging TypeScript's type system for compile-time schema safety.

## Current Status

**Overall**: Phases 1–5 (95%) complete; Phases 6–8 in progress.

### ✅ Completed

- **Phase 1**: Core Schema Types (`src/types.ts`)
  - `CliOptionKind` enum (Presence, String, Number)
  - `CliFallbackMode` enum (MissingOnly, MissingOrUnknown, UnknownOnly)
  - `CliCommand`, `CliOption`, `CliPositional`, `CliHandler`, `CliContext` interfaces
  - `CliSchemaValidationError` class
  - `CliOption` on `options`, `CliPositional` on `positionals`, nested routes under `commands`

- **Phase 2**: Argument Parser (`src/parse.ts`)
  - `parse(root, argv)` with long/short options, bundling, equals syntax
  - Option consumption logic with strict number validation
  - Subcommand routing and positional argument collection
  - Help token detection (`-h`, `--help`)
  - `postParseValidate()` for strict option validation
  - `cliValidateRoot()` for schema validation (root rules, child uniqueness, reserved names, positional ordering)
  - Support for all fallback modes

- **Phase 3**: Runtime Context (`src/context.ts`)
  - `CliContext` class with typed accessors
  - `flag(name)` — boolean presence check
  - `stringOpt(name)` — string value or undefined
  - `numberOpt(name)` — strict double parsing or null
  - `typedOpt<T>(name, parse)` — generic typed accessor (TypeScript advantage)

- **Phase 4**: Help Rendering (`src/help.ts`)
  - `cliHelpRender()` for formatted help output
  - TTY-aware ANSI colors (red, aqua, gray, bold)
  - Unicode box drawing (╭╮├┤╰╯)
  - Terminal width detection (`process.stdout.columns`)
  - Text wrapping with visible width calculation (strips ANSI)
  - Help sections: usage box, options table, positionals table, subcommands table, notes box
  - `cliOptionLabel()` for formatted option display

- **Phase 5**: Shell Completion (`src/completion.ts`)
  - `completionBashScript(schema)` — bash tab-completion generator
  - `completionZshScript(schema)` — zsh tab-completion generator
  - Scope walking for command tree traversal
  - Option/command/positional matching logic for both shells

### 🚧 In Progress

- **Phase 6**: Main Entry Point (`src/index.ts`)
  - **Status**: Placeholder `hello()` function remains
  - **Needs**: Implement `cliRun(root: CliCommand): Promise<void>`
    - Validate schema via `cliValidateRoot()`
    - Auto-merge built-in `completion` command with `bash`/`zsh` subcommands
    - Call `parse()` on `process.argv.slice(2)`
    - Call `postParseValidate()`
    - Handle `ParseKind.Help` → render via `cliHelpRender()` → exit(0)
    - Handle `ParseKind.Error` → render red error + contextual help → exit(1)
    - Route to handler function with `CliContext`
    - Support async handlers with `await`

- **Phase 7**: Examples & Tests (`src/index.test.ts`, `examples/`)
  - **Status**: Only placeholder tests exist
  - **Needs**: 
    - Replace `src/index.test.ts` with comprehensive test suite covering:
      - Option parsing (long, short, bundled, equals syntax)
      - Help detection and rendering
      - Subcommand routing and fallback modes
      - Positional argument collection and arity validation
      - Unknown options/commands
      - Schema validation errors
      - Async handler support
      - Typed option accessors
    - Create `examples/minimal.ts` — hello with `--name` and `--verbose`
    - Create `examples/nested.ts` — nested subcommands with positionals (mirroring Swift examples)

### ❌ Not Started

- **Phase 8**: Project Polish
  - Add `biome.json` for linting/formatting
  - Add CLI binary entry point (`bin/argsbarg`)
  - Create `README.md` with API docs and usage examples
  - Update `package.json` scripts and bin entry
  - Verify all verification steps pass

## Next Immediate Steps

1. Implement `cliRun()` in `src/index.ts`
2. Rewrite `src/index.test.ts` with actual test coverage
3. Create working examples in `examples/`
4. Run `bun test` and verify all tests pass
5. Run examples and verify output matches expectations

**Steps**

### Phase 1: Core Schema Types (types.ts)
- Define TypeScript equivalents of Swift's `CliOptionKind`, `CliOption`, `CliCommand`, `CliFallbackMode`
- Leverage TypeScript generics/union types for compile-time safety (e.g., typed option values instead of string-only)
- Add `CliHandler` type as `(ctx: CliContext) => void | Promise<void>` (support async handlers)
- Add `CliSchemaValidationError` enum/class
- **Parallel with Phase 2**

### Phase 2: Argument Parser (parse.ts)
- Implement `parse(root: CliCommand, argv: string[]): ParseResult` — same logic as Swift
  - Long options (`--name`, `--name=value`)
  - Short options (`-n`, bundled `-abc`)
  - Subcommand routing through nested `CliCommand` tree
  - Positional argument collection with arity validation (argMin/argMax)
  - Help token detection (`-h`/`--help`)
  - Root-level `fallbackCommand`/`fallbackMode` support
- Implement `postParseValidate()` — strict number validation, option key verification
- Implement `cliValidateRoot()` — schema validation (no handler on routing nodes, no positionals on root, unique short names, reserved `-h`, etc.)
- **Depends on Phase 1**

### Phase 3: Context & Runtime (context.ts)
- Implement `CliContext` class with typed accessors:
  - `flag(name)` — boolean presence check
  - `stringOpt(name)` — string value
  - `numberOpt(name)` — strict double parse
  - **TypeScript enhancement**: `typedOpt<T>(name, parseFn)` — generic typed accessor
- Implement `cliErrWithHelp(ctx, msg)` — red error + contextual help on stderr
- **Depends on Phase 1**

### Phase 4: Help Rendering (help.ts)
- Terminal-aware help with rounded box drawing (same Unicode box chars as Swift)
- TTY detection (Node's `process.stdout.isTTY` instead of Swift's `isatty`)
- Terminal width detection (`TIOCGWINSZ` via `ioctl` or fallback to `process.stdout.columns`)
- ANSI color support (TTY-aware, same palette: red/green/aqua/gray/bold)
- Help sections: Usage box, Options table, Arguments table, Subcommands table, Notes box
- `cliHelpRender(schema, helpPath, useStderr)` — full help for root or nested command
- **Depends on Phase 1**

### Phase 5: Shell Completion (completion.ts)
- `completionBashScript(schema)` — generate bash tab-completion script
- `completionZshScript(schema)` — generate zsh tab-completion script
- Same scope-walking algorithm as Swift (depth-first, per-node arrays)
- **Depends on Phase 1**

### Phase 6: Main Entry Point (index.ts)
- `cliRun(root: CliCommand)` — orchestrates: validate → merge builtins → parse → validate → dispatch
- Auto-merge `completion`/`bash`/`zsh` reserved commands
- Exit code handling (0 for help/success, 1 for errors)
- **Depends on Phases 2-5**

### Phase 7: Examples & Tests
- `examples/minimal.ts` — hello world with options (like Swift's Minimal example)
- `examples/nested.ts` — deeply nested subcommands with positionals (like Swift's Nested example)
- `src/index.test.ts` — comprehensive tests mirroring Swift's ParseTests
  - Bundled short flags, long option equals, fallback modes
  - Unknown command, implicit help, invalid number validation
  - Completion script generation verification
  - Schema validation (root handler, root positionals, nested fallback, reserved names)
  - **TypeScript-specific**: async handler support, typed option accessors

### Phase 8: Project Polish
- Add `biome.json` config (lint/format)
- Add `bin/` entry in `package.json` for CLI executable
- Add `README.md` with API docs and usage examples
- Update `package.json` scripts
- **Parallel with Phase 7**

**Relevant files**
- `/Users/briandombrowski/dev/bdombro/bun-argsbarg/src/index.ts` — replace placeholder `hello()` with `cliRun` + schema types
- `/Users/briandombrowski/dev/bdombro/bun-argsbarg/src/index.test.ts` — replace with comprehensive test suite
- `/Users/briandombrowski/dev/bdombro/bun-argsbarg/package.json` — add bin entry, biome config, README
- `/Users/briandombrowski/dev/bdombro/bun-argsbarg/tsconfig.json` — keep as-is (already correct for Bun)
- `/Users/briandombrowski/dev/bdombro/bun-argsbarg/examples/local-check.ts` — replace with minimal/nested examples

**Verification**
1. `bun test` — all tests pass
2. `bun ./examples/minimal.ts hello --name World --verbose` — outputs "hello World" with verbose mode
3. `bun ./examples/minimal.ts hello --help` — shows formatted help with options table
4. `bun ./examples/nested.ts stat owner lookup --user-name bob /etc/passwd` — outputs "lookup user=bob path=/etc/passwd"
5. `bun ./examples/minimal.ts completion bash` — outputs valid bash completion script
6. `bun ./examples/minimal.ts completion zsh` — outputs valid zsh completion script
7. `bun lint` and `bun check-types` — no errors
8. `bun ./examples/minimal.ts unknown-cmd` — shows fallback command help with red error

**Decisions**
- **Single-file vs multi-file**: Multi-file (types/parse/context/help/completion) to match Swift's modular structure and keep files manageable
- **Typed options**: Add `typedOpt<T>(name, parse: (s: string) => T)` to leverage TypeScript's type system — this is the key TypeScript advantage over Swift's string-only approach
- **Async handlers**: Support `async (ctx) => Promise<void>` handlers — Bun/Node advantage over Swift's synchronous-only
- **TTY detection**: Use `process.stdout.isTTY` and `process.stdout.columns` (Node built-in) instead of `ioctl`/`isatty` FFI
- **No runtime dependencies**: Keep zero runtime deps, only `@types/bun` as dev dep
- **CLI binary**: Add `bin/argsbarg` entry point so the library can also be used as a CLI tool
- **Schema validation**: Same rules as Swift — root can't have handler/positionals, no duplicate shorts, `-h` reserved, etc.

**Further Considerations**
1. Should we add a `@argsbarg()` decorator pattern for declarative schema definition (like Python's argparse decorators)? This would be a TypeScript-native enhancement.
2. Should the CLI binary (`bin/argsbarg`) support loading schema from a config file (JSON/YAML) for dynamic CLIs?
3. Error exit codes: Swift uses exit(1) for help (implicit) and exit(0) for explicit help. Should we match this or use more conventional exit codes?

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **`docs/cli-program.md`** — extracted commands as exported `CliLeaf` objects (`satisfies CliLeaf`), not zero-arg factory functions.

## [3.3.1] - 2026-06-21

### Added

- **`docs/cli-program.md`** — authoring guide for `CliProgram` and leaves (MCP-free defaults); **headless-capable handlers** and **inline schema by default**.
- **`docs/templates/cursor/rules/cli-program.mdc`** — concise copy-paste Cursor rule for consumer apps.

### Removed

- **`mcpToolSchemaHints`** — redundant with MCP `inputSchema` option descriptions.
- **`wantsDryRun`** — use `ctx.hasFlag("dry-run")` instead.

## [3.3.0] - 2026-06-21

### Added

- **Headless helpers** — `shouldRunHeadless`, `shouldRunHeadlessWithPositionals`, `shouldRunHeadlessWithYes`, `wantsExplicitJson`, `requireYesInNonTty`, `formatDryRunMessage` for Ink/MCP CLIs.
- **`ghReleaseUpdateGetLatest`** — optional `install.updateGetLatest` factory for GitHub releases via `gh`.
- **`createGhVersionCheck`** — version-check cache, update notices, and background refresh helpers.

## [3.2.0] - 2026-06-20

### Added

- **`docs schema`** — print the full command tree as JSON (`myapp docs schema`). Replaces root `--schema` (requires `docs.enabled`).
- **`docs api`** — print the command tree as markdown (`myapp docs api`). Human-readable companion to `docs schema`.
- **`docs skill`** — print generated Cursor `SKILL.md` content to stdout (`myapp docs skill`).
- **`update` built-in** — when `install.updateGetLatest` is set, `myapp update` downloads the latest binary and reinstalls installed artifacts.
- **`install --reinstall`** — replaces `--update` (still accepted as a deprecated alias). Optional `--from <path>` for the binary source.

### Changed

- **Breaking:** root **`--schema`** removed — use **`docs schema`** when `docs.enabled` is `true`.
- **Breaking:** **`install --update`** renamed to **`install --reinstall`**.

## [3.1.0] - 2026-06-20

### Added

- **`docs` built-in** — opt in with `docs: { enabled: true, topics: { ... } }` on the program root. Bundled markdown topics on stdout (`myapp docs`, `myapp docs readme`, `myapp docs all`). Auto **`docs mcp`** guide when `docs` and `mcpServer` are both enabled. See [docs/bundled-docs.md](docs/bundled-docs.md).

### Changed

- **Agent skills** — `SKILL.md` is shell-only (removed MCP setup, `mcp.json`, and `tools/call` content). Use `docs mcp` or MCP tools for agent execution guidance.

## [3.0.0] - 2026-06-20

### Added

- **`version` built-in** — `myapp version` prints `CliProgram.version` (always available; reserved command name).

### Changed

- **`CliProgram.version`** (required) — single source of truth for the `version` built-in and MCP `serverInfo.version`. Removed `mcpServer.version` and automatic `package.json` lookup.
- **MCP opt-in** — `mcpServer: { enabled: true }` enables MCP; omit `mcpServer` to disable. Empty `mcpServer: {}` is rejected at validation.
- **MCP identity from `key`** — removed `mcpServer.name`. MCP `serverInfo.name`, schema URI, and `mcp.json` entry keys use `sanitizeToolSegment(root.key)` (e.g. `nested.ts` → `nested_ts://schema`). Shell `command` stays the raw `key`.

## [2.1.1] - 2026-06-20

### Changed

- **`install` built-in** — no longer gated on compiled binaries; available whenever `install.enabled !== false` (default on). Removed `isCompiledExecutable()` and `src/install/compiled.ts`.

## [2.1.0] - 2026-06-20


## [2.0.1] - 2026-06-20

### Removed

- **`CliContext.schema`** — use `ctx.program` (removed alias; `program` is the only field).

## [2.0.0] - 2026-06-20

### Changed (breaking)

- **`CliCommand` removed** — use `CliProgram` as the schema type passed to `cliRun` / `cliInvoke`. The runtime object shape is unchanged; only the type name and how you annotate it differ.

```typescript
// 1.x
import { type CliCommand } from "argsbarg";
const cli: CliCommand = { ... };
// 2.0
import { type CliProgram } from "argsbarg";
const cli = { ... } satisfies CliProgram;  // or : CliProgram
```

- **Internal type split** — `CliNode` / `CliLeaf` / `CliRouter` model the user command tree; `CliProgram` adds root-only `mcpServer` and `install`. These are not exported from the public API.
- **Capabilities resolver** — reserved built-in names (`completion`, `install`, `mcp`) are derived from program config and runtime (compiled binary), not from user-declared commands.

### Added

- **`ctx.program`** — alias for `ctx.schema` on `CliContext` (same `CliProgram` value).

## [1.5.0] - 2026-06-20

### Added

- **`install` built-in** (compiled binaries only) — install binary, bash/zsh/fish completions, Cursor/Claude skills, and MCP config (`install --all --yes`, `--update`, `--status`, `--uninstall`).
- **`completion fish`** — fish tab-completion script generation.
- Root **`install`** config (`{ enabled?: boolean, prefix?: string }`).

### Changed (breaking)

- **Removed `ai` command group** — no more `ai mcp` or `ai skill`.
- **Restored top-level `mcp`** — `myapp mcp` (reserved only when `mcpServer` is set).
- **Removed `aiSkill` config** — skill directory name defaults to sanitized root `key`; use `install --skill` instead of `ai skill`.

## [1.4.3] - 2026-06-19

### Added

- **`ai` built-in group** — `myapp ai skill cursor` and `myapp ai skill claude` install Agent Skills (`SKILL.md` + `reference.md`) to project or global skill directories.
- **`aiSkill`** root config to opt out of skill install (`{ enabled: false }`).

### Changed (breaking)

- **`myapp mcp`** → **`myapp ai mcp`**
- Reserved top-level command **`mcp`** → **`ai`** (user commands may now be named `mcp`)

## [1.4.2] - 2026-06-19

### Added

- **`fallbackCommand` / `fallbackMode` on any routing node** — nested routers can define default subcommand routing, not just the program root.
- **`ctx.positional(name)`** — named positional lookup; varargs return `string[]`, single slots return `string | undefined`.
- **MCP varargs coercion** — agents may pass `"a,b"` or `"a"` where `string[]` is expected.

### Fixed

- **Known options after varargs positionals** — `--flag` tokens after a varargs tail parse as options instead of being consumed as positional arguments.

## [1.4.1] - 2026-06-19

### Added

- **`ctx.invocation`** (`"cli"` or `"mcp"`) on `CliContext` for handler branching.
- **`cliInvoke`** and `CliInvokeResult` exported from the public API.
- **`CliOptionKind.Enum`** with `choices` — JSON Schema `enum`, shell completions, parse validation, help labels.
- **`mcpTool.description`** — per-leaf MCP tool description override.
- **`mcpTool.requiresEnv`** — env requirements in auto-generated descriptions; enforced at `tools/call` (empty string counts as absent).
- **`mcpServer.resources`** — pluggable `CliMcpResource` items in `resources/list` and `resources/read`.
- **`mcpServer.shellEnv`** — login-shell env captured at MCP server start; `PATH` always merged, other vars fill gaps in host env.
- **`mcpServer.envFile`** — `.env` file loaded into `process.env` after `shellEnv` (warns on stderr if missing).

## [1.4.0] - 2026-06-19

### Added

- **Opt-in MCP** — set `mcpServer: {}` on the program root to enable `myapp mcp`, a stdio MCP server (tools + `argsbarg://schema` resource). Hand-rolled JSON-RPC; zero new dependencies.
- **MCP tool descriptions** — `tools/list` descriptions include the CLI path (e.g. `stat owner lookup — Resolve owner info.`).
- **`mcpTool` leaf opt-out** — set `mcpTool: { enabled: false }` on a leaf to omit it from MCP tools while keeping it in the CLI and `--schema`.
- **MCP stderr on success** — successful tool calls return a second content block when the handler wrote to stderr.
- **MCP `structuredContent`** — when handler stdout is valid JSON, tool results include parsed `structuredContent` alongside text content.

### Fixed

- **Parent-scoped options before positionals** — nested commands accept flags from ancestor nodes when options appear before positional arguments (required for MCP tool argv layout).

## [1.3.1] - 2026-06-19

### Fixed

- **`--schema` discoverability** — list the flag in root help and offer it in shell completions at the program root (same pattern as `--help`).
- **Leaf root help** — show the reserved `completion` command in root help and `--schema` output (routing CLIs already did).

## [1.3.0] - 2026-06-18

### Added

- **`--schema`** — prints the full CLI tree as JSON to stdout (exit 0). Handlers are omitted; the injected `completion` subtree is excluded. Option name `schema` is reserved.

## [1.2.1] - 2026-06-18

### Changed

- **Trailing options** — when a leaf command has only bounded positionals (`argMax !== 0`), options may appear after positional arguments (e.g. `cmd ./file --verbose`). Commands with a varargs tail (`argMax: 0`) keep the previous behavior.
- **`examples/nested.ts`** — `stat` accepts `--json`; `stat owner lookup` prints JSON when the flag is set.

## [1.2.0] - 2026-04-24

### Added

- **`CliOption.required`** — makes an option required when parsing
- **`isInteractiveTty`** - a computed boolean of whether the app is running in an interactive tty
- **Single-command CLI support** - You can now define a `handler` directly on the root of your CLI configuration to quickly build single-command apps without nesting them in subcommands.

### Changed

- **`CliCommand` Strict Union** - (Breaking TS Change) `CliCommand` is now a Discriminated Union type. A command must be *either* a Router (with `commands`) or a Leaf (with `handler`), but not both. This catches structural mistakes at compile time.

## [1.1.1] - 2026-04-23

### Changed

- fix exports in package.json

## [1.1.0] - 2026-04-23

### Changed

- gen index.d.ts with `dts-bundle-generator` so that consumers don't typecheck the source files

## [1.0.1] - 2026-04-22

### Changed

- **`CliPositional`** — `argMin` and `argMax` are optional. When omitted, they behave as `argMin: 1` and `argMax: 1` (one required word). Set `argMax: 0` for an unbounded varargs tail.
- **Release** — `just release <major|minor|patch>` runs `just test` first, then `scripts/release.ts`, which no longer runs typecheck, lint, or tests itself. The release commit uses `git add -A` so all local changes in the repo are included, not only `package.json` and `CHANGELOG.md`.

## [1.0.0] - 2026-04-22

### Added

- `scripts/release.ts` — release automation (`just release <major|minor|patch>`): lint, typecheck, tests, semver bump, CHANGELOG promotion, commit, tag, push, GitHub release, npm publish.
- `CliPositional` type for entries in `CliCommand.positionals` (name, description, kind, argMin, argMax).
- `cliPositionalLabel()` for help-style labels of positional slots (exported alongside `cliOptionLabel()`).

### Changed

- **`CliCommand.children` → `CliCommand.commands`** — nested subcommands are declared under `commands` everywhere (schema, parser, validation, help, completion, runtime).
- **Development tasks** — former `package.json` scripts live in the repo `justfile` (e.g. `just test`, `just lint`). `package.json` no longer defines a `scripts` block.
- **Public barrel (`src/index.ts`)** — re-exports are limited to schema types and enums, `CliSchemaValidationError`, `CliContext`, `cliRun`, and `cliErrWithHelp`. Parsing (`parse`, `postParseValidate`, …), completion script helpers, help renderers, `cliValidateRoot`, and `utils` number helpers are no longer re-exported from the package entry (import from `src/*.ts` paths in this repo, or depend on internal modules if you fork).

### Removed

- **`createOption()`** — options and positionals are plain object literals; there is no factory helper.
- **`CliOptionDef`** — replaced by distinct types (see below).

### Breaking

- **`CliOption`** is only for named flags and value options (`options`). It no longer includes `positional`, `argMin`, or `argMax`. Use **`CliPositional`** on `positionals` for ordered arguments and varargs tails.
- **`CliCommand.positionals`** is now `CliPositional[]`, not `CliOption[]`.
- Migrate schemas: rename every `children` property to **`commands`**; move positional definitions to **`CliPositional`** objects on `positionals` and strip `positional` / `argMin` / `argMax` from flag definitions under `options` (flags only carry `name`, `description`, `kind`, and optional `shortName`).
- Imports: use `CliPositional` where needed; replace `CliOptionDef` with `CliOption` or `CliPositional` as appropriate.

[Unreleased]: https://github.com/bdombro/bun-argsbarg/compare/v3.3.1...HEAD
[3.3.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.1
[3.3.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.0
[3.2.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.2.0
[3.1.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.1.0
[3.0.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.0.0
[2.1.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v2.1.1
[2.1.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v2.1.0
[2.0.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v2.0.1
[2.0.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v2.0.0
[1.5.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.5.0
[1.4.3]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.4.3
[1.4.2]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.4.2
[1.4.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.4.1
[1.4.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.4.0
[1.3.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.3.1
[1.3.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.3.0
[1.2.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.2.1
[1.2.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.2.0
[1.1.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.1.1
[1.1.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.1.0
[1.0.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.0.1
[1.0.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.0.0
